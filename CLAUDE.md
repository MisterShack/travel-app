# Waypoint — project guide

Personal/family travel agent: flights, lodging, and activities merged into one timeline per trip,
with reminders. **PLAN.md** is the V1 spec (shipped, phases 0–5). **PLAN-V2.md** (Terraform and Playwright) and
**PLAN-V3.md** (maps and suggestions) are drafts, not started. Read the relevant one before implementing anything. It has not been
built against yet; if you're about to start Phase 0, confirm PLAN.md has been through
`.claude/skills/plan-review` first (§ of PLAN.md's header note).

**The product is called Waypoint** (BRAND.md). The repo directory, the npm workspaces
(`@travel/*`) and the domain (`trips.myze.ca`) still say *travel* — those are identifiers rather
than the product name, and renaming them buys nothing but churn and a broken deploy. Change them
only if the domain moves.

## Layout (npm workspaces)

| Path | What |
|---|---|
| `shared/` | `@travel/shared` — Zod schemas, imported **verbatim** by client and server. Platform-neutral. |
| `app/` | `@travel/app` — Vite/React PWA client. |
| `server/` | `@travel/server` — Hono API. |

## Non-negotiables

See PLAN.md §4 for the full list and rationale. In short:

- **Every event time is local wall-clock + an IANA timezone name + a derived UTC instant.** All
  three. Local+zone is the source of truth (it is what the ticket says, and DST rules change);
  the UTC instant is a derived index for sorting and comparison, recomputed when either changes.
  Never store a local datetime alone — a flight departs in one zone and lands in another.
- **A trip is the shared unit** (this app's equivalent of budget-app's ledger): owner/member roles,
  at least one owner enforced in the membership module, single-use hashed invite tokens bound to
  an email, redemption checked against the *verified* email of the redeeming account.
- **The server never trusts the client** — every write is re-validated against `shared/` schemas.
- **No document or attachment is persisted _by this app_.** Booking import extracts fields in
  memory; the review screen fetches the source from Resend on demand. Resend retains its own copy
  — the rule is about our storage, and saying so honestly is part of the rule.
- **Single Railway instance, file-based DB** — the reminder sweep and any other periodic work runs
  in-process, there is nowhere else for a scheduler to live. But it claims rows before sending and
  drops stale work; budget-app's boot-time `purgeExpired` is the same *location*, not the same
  reliability bar.
- **A booking import is never silently applied** — it always lands as `needs_review` (or unmatched
  `pending`) until a human confirms it. It is also untrusted input: the inbound address is
  reachable by anyone and `From:` is forgeable.
- **The trip timeline is readable without connectivity.** A read-through IndexedDB cache ships
  with the MVP. Offline *writes* are explicitly out of scope.

## Relationship to budget-app

This app deliberately reuses budget-app's proven patterns — same host (Railway), same DB engine
(SQLite via libSQL + Drizzle), same auth code shape (argon2, hashed session tokens, hashed
single-use tokens), same Resend `Mailer` interface, same deploy shape (Dockerfile, volume at
`/data`, Litestream). It does **not** share a login, a database, or a Railway service with
budget-app — two separate accounts, by design (PLAN.md §5, §12). If that becomes a real annoyance
in practice, treat reconsidering it as a deliberate decision, not a quiet workaround.

When porting code from `/Users/david/Code/budget-app`, carry over the deploy gotchas documented in
its `CLAUDE.md`/`DEPLOY.md` (volume mount path, `tsx` as a runtime dependency, Railway Watch Paths,
the Linux-binary `optionalDependencies` issue if native deps end up in the lockfile) rather than
re-discovering them the hard way.

## Status

**Live at <https://trips.myze.ca>** (Railway, deployed 2026-08-15). Verified from outside: valid
certificate, `/health` answering JSON, the client served at `/`, SPA deep links resolving, and
`/api/*` returning JSON rather than being shadowed by the static fallback. Registration and email
verification work against real Resend delivery.

**All phases (0–5) are done.** 151 tests, typecheck and lint clean.

**Phase 4 (booking import) shipped and verified end to end against a real forwarded airline
confirmation, 2026-08-15** — including two per-passenger PDF tickets, read correctly.

Implementation: a Svix-signature-verified webhook (implemented
directly rather than via an SDK, so it is testable without a network), then three more gates —
recipient (an MX on the sending domain delivers replies to our own `no-reply` too), verified
sender, and a per-user daily cap. Heuristics run first and claim a flight only on two independent
signals; Gemini on the *paid* tier is the fallback. Everything lands as `needs_review` and is
applied only after a human saves it through the normal validated create route.

**Phase 5 (notifications) shipped 2026-08-15**: reminders fan out one row per member per channel,
the in-process sweep claims each row before sending (so an overlapping tick cannot double-send)
and drops anything more than 2h late rather than delivering a misleading "departs in 3 hours"
after the plane has gone. Email is the default channel; web push is an opt-in upgrade, because
iOS only exposes PushManager to a PWA launched from the Home Screen. Default lead times: flights
3h, check-in 2h, activities 1h.

Two things that are true and worth keeping in view:

- **There are no backups.** `LITESTREAM_BUCKET` is unset by David's decision (2026-08-15), so the
  Railway volume is the only copy of every account and trip, and the restore drill in DEPLOY.md §6
  has never been run. Deliberate, but it makes the volume a single point of failure.
  **And a custom Railway Start Command currently overrides the image's `ENTRYPOINT`**, so
  `entrypoint.sh` — and therefore Litestream — never runs. Harmless while no bucket is set;
  actively dangerous the moment one is, because everything would look configured and nothing would
  replicate. Clearing it crashed the deploy once, cause unknown. See the boxed warning in
  DEPLOY.md §5 before turning backups on.
- **Registration is open.** The app is publicly reachable, so anyone with the URL can create an
  account and consume the Resend quota. There is no invite gate.

**Phase 11 (conflict and gap detection) shipped 2026-08-15**, from PLAN-V3. Pure function in
`shared/`, run on the client, so it works offline and costs nothing per use. It is the feature that
falls out of the timezone work rather than being bolted on — "you land at 13:00 but dinner is
booked for 12:30" is a comparison only because every event carries a correct instant across zones.

Outstanding in production only, not in code: `RESEND_WEBHOOK_SECRET`, `GEMINI_API_KEY` and the
inbound MX record (DEPLOY.md §11) for import; `VAPID_*` for push. Each degrades its own feature
when absent and none breaks the app.

Findings from building that contradict a straight port from budget-app, all encoded:

- **The API is mounted under `/api`.** Without it the client's `/trips/:id` page and the API's
  `/trips/:id` endpoint are the same URL, so deep-linking to a trip returns 401 JSON instead of
  the app. `/health` stays at the root because `railway.json` points there.
- **`RESEND_API_KEY` is required to deploy at all** — `env.ts` throws on boot without it, and the
  only symptom is a Railway healthcheck failure. DEPLOY.md §0 and §3.
- **`STATIC_DIR` must be absolute** — `serveStatic` resolves against the process cwd.
- **The native-binary pin is Rolldown, not Rollup** (Vite 8 replaced it), and npm/cli#4828 is
  still live on npm 11.17 — measured. DEPLOY.md §9.
- **Vite alias order matters**: `@travel/shared/airports` must precede `@travel/shared`.
- **`.dockerignore` is load-bearing** — `npm ci` installs Linux binaries and `COPY . .` would put
  the host's macOS ones on top.
- **`rateLimit`'s `fly-client-ip` check was not ported** — a Fly leftover that on Railway
  collapses every client into one bucket.
- **Registration creates nothing** — no auto-created "personal" trip, unlike budget-app's ledger.
- **Most short uppercase words are IATA airport codes.** `ADD`, `SEE`, `EAT`, `ALL`, `THE`, `FOR`,
  `AND`, `NOT`, `CAR`, `BUS`, `SAT`, `SUN` and `HST` are all in the OpenFlights table, so "does the
  airport table know this word" is not evidence of anything. The import heuristic must read a route
  as a **pair the email itself joined** — an arrow, a dash, "to", or departure/arrival labels — and
  a flight number only where the email calls it one. Taking the first two recognised codes in
  document order imported an OpenTable reservation as a flight (2026-08-16).

- **A timezone is not a place.** `zoneLabel` names the zone's namesake city, so an Ottawa arrival
  (`America/Toronto`) was labelled "Toronto" in both the timeline badge and the reminder text —
  reported from a real WestJet import, 2026-08-16, where the extraction was correct and only the
  label was wrong. `TimelineItem` now carries `startPlace`/`endPlace`, filled from the airport table
  for flights; lodging and activities keep the zone, because there the user chose the zone by hand.

**The brand's mark was removed on 2026-08-16.** An amber outlined triangle with a dot at the
centroid is how an aeronautical chart draws a named waypoint; it is also, at a glance, a hazard
sign, which is what David read on his own home screen. BRAND.md §9 now records the general lesson —
a mark means what people already read it as, not what it is derived from — and the identity is the
wordmark alone until something earns its place. The app icon is a `W`.

## Quality workflow

A phase is done when `npm run typecheck`, `npm run lint` and `npm test` all pass from the repo
root, and the phase's own acceptance criterion in PLAN.md §11 is met.

| Trigger | Run |
|---|---|
| Any UI change, and before showing the app to anyone | `web-accessibility-reviewer` agent |
| Wanting to see the app rather than its test output | `node app/e2e/drive.mjs` (see its header) |

Both exist because the unit suites were green and the app was still wrong: a browser drive found
six defects in one pass, including new events defaulting to the browser's timezone instead of the
trip's. Tests prove the code does what it says; they cannot tell you the app is wrong. Commit once per phase with
a clear message. Phase 1 additionally is **not** done until a Litestream restore has actually been
rehearsed — configured is not the same as working (DEPLOY.md §4).
