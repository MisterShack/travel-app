# Waypoint — project guide

Personal/family travel agent: flights, lodging, and activities merged into one timeline per trip,
with reminders. **PLAN.md** is the V1 spec (shipped, phases 0–5). **PLAN-V2.md** (Terraform and Playwright) and
**PLAN-V3.md** (maps and suggestions) are drafts, not started. Read the relevant one before implementing anything. It has not been
built against yet; if you're about to start Phase 0, confirm PLAN.md has been through
`.claude/skills/plan-review` first (§ of PLAN.md's header note).

**The product is called Waypoint** (BRAND.md). The repo directory, the npm workspaces
(`@travel/*`) still say *travel* — those are identifiers rather than the product name, and renaming
them buys nothing but churn and a broken deploy. **The domain did move** to `waypoint.myze.ca` on
2026-08-16, and the workspaces were deliberately left alone: they are not user-visible, and the
Dockerfile, the Vite aliases and every import would have to move with them.

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

**Live at <https://waypoint.myze.ca>** (Railway, deployed 2026-08-15). Verified from outside: valid
certificate, `/health` answering JSON, the client served at `/`, SPA deep links resolving, and
`/api/*` returning JSON rather than being shadowed by the static fallback. Registration and email
verification work against real Resend delivery.

**All phases (0–5) are done.** 176 tests, typecheck and lint clean.

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

**Phase 12 (rail, coach and ferry as first-class segments) shipped 2026-08-16**, from PLAN-V3 §3a.
`flights` became `segments`; migration 0007 renames the table and its columns and defaults every
existing row to `mode = 'air'`, because every row that existed was a flight. Rehearsed against a
database built at 0006 with a real booking, a pending reminder and an import in it.

**Verified end to end against a real forwarded Via Rail confirmation, 2026-08-17**, which is the
same bar Phase 4 was held to and is not the same thing as the unit tests passing: those stub the
model, and the rail path is the one that cannot be checked without it. Rail never takes the
heuristic path — that claims `air` only, on a labelled flight number *and* an IATA pair — so a
successful rail import exercises the whole chain and settles three production settings at once.
It proves the inbound MX delivers, that `RESEND_WEBHOOK_SECRET` is set (`verifyWebhook` returns
`not_configured` and the route 401s without it), and that `GEMINI_API_KEY` is set and the model
answers.

**Phase 11 (conflict and gap detection) shipped 2026-08-15**, from PLAN-V3. Pure function in
`shared/`, run on the client, so it works offline and costs nothing per use. It is the feature that
falls out of the timezone work rather than being bolted on — "you land at 13:00 but dinner is
booked for 12:30" is a comparison only because every event carries a correct instant across zones.

Outstanding in production only, not in code: `VAPID_*` for push, which is the last of these left.
It degrades only its own feature when absent and does not break the app. The import three —
`RESEND_WEBHOOK_SECRET`, `GEMINI_API_KEY` and the inbound MX record (DEPLOY.md §11) — are set and
proven, by the Via Rail import above rather than by reading the dashboard.

Findings from building that contradict a straight port from budget-app, all encoded:

- **The API is mounted under `/api`.** Without it the client's `/trips/:id` page and the API's
  `/trips/:id` endpoint are the same URL, so deep-linking to a trip returns 401 JSON instead of
  the app. `/health` stays at the root because `railway.json` points there.
- **`RESEND_API_KEY` is required to deploy at all** — `env.ts` throws on boot without it, and the
  only symptom is a Railway healthcheck failure. DEPLOY.md §0 and §3.
- **`STATIC_DIR` must be absolute** — `serveStatic` resolves against the process cwd.
- **The native-binary pin is Rolldown, not Rollup** (Vite 8 replaced it), and npm/cli#4828 is
  still live on npm 11.17 — measured. DEPLOY.md §9. It is not only a deploy problem: the same bug
  left a Windows development machine with no Rolldown or LightningCSS binding, so `vitest` died at
  startup before running a test. The `win32-x64` pair is declared alongside the Linux one, and the
  `os` field keeps each out of everywhere it does not belong.
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

- **"Awaiting review" was defined three times, differently.** The Inbox tab badge counted every
  import the account had ever received while the list beside it filtered `applied` and `rejected`
  out, so it read 3 against one outstanding row and never went down; the per-trip route keyed off
  `processedAt`, which is stamped at ingest and so is never null. One `AWAITING` predicate now
  serves all three. The badge also lives in `InboxProvider` rather than `App`, because reviewing an
  import does not navigate and the count was only ever re-read on a route change.
- **A journey is not a flight.** `flights` became `segments` with a `mode` of air/rail/coach/ferry
  (PLAN-V3 §3a, migration 0007). A train has everything a flight has — origin, destination,
  departure, arrival — and landing it as a generic activity threw the destination away, which is
  exactly the data a conflict needs. The endpoint is an IATA code for air and a station *name* for
  everything else; there is no IATA for stations, so the zone is asked for rather than derived. Hue
  encodes the kind and the icon's shape encodes the mode.
- **The conflict rule was parsing the subtitle.** Putting seats in it made every connection compare
  `LIS · 14C` against `LIS` and report a change of airport that was not one. Endpoints are now
  structured fields on the timeline item. A display string is not an interface.
- **A booking is a list, not a row.** The flight import extracted one leg and one seat: a return
  trip lost the flight home, and a family booking lost everyone but one seat. A booking now carries
  `flights[]` and `passengers[]`; `flights.seat` became a `passengers` JSON column (migration 0005,
  the first that rewrites existing rows — see DEPLOY.md); and an import stays in the review queue
  until every leg has been added, tracked in `booking_imports.applied_segments`.
- **`registerType: 'autoUpdate'` auto-updates the *worker*, not the page.** The generated
  `registerSW.js` is a single line that registers `/sw.js`; our worker calls `skipWaiting()` and
  `clients.claim()`, so a new build activates at once — and the page already running keeps the
  JavaScript it downloaded when it opened. On an installed PWA, which iOS keeps warm for days, a
  user can sit on a week-old build while the server has moved on. `data/updates.ts` reloads on
  `controllerchange` (guarded so a first visit does not reload). The Account screen shows a build
  stamp, because the first time this happened it took a minified bundle diff to establish that the
  fix really had deployed.
- **A draft's `kind` was extracted and then thrown away.** The model reports whether an activity is
  a restaurant, an attraction or transport; the review form's prefill never read it, so a forwarded
  OpenTable booking arrived as "Other" on the one screen the import flow exists to save work on. The
  mapping now lives in `app/src/features/timeline/draft.ts` — out of the component so it can be
  tested, because a field silently missing from it is invisible until someone forwards the right
  email.
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
