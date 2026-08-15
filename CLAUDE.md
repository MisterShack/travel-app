# Travel App — project guide

Personal/family travel agent: flights, lodging, and activities merged into one timeline per trip,
with reminders. **PLAN.md** is the spec — read it before implementing anything. It has not been
built against yet; if you're about to start Phase 0, confirm PLAN.md has been through
`.claude/skills/plan-review` first (§ of PLAN.md's header note).

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

Phases 0, 1, 2 and 3 are done — the MVP is shipped. 84 tests, typecheck and lint clean.

Two things that are true and worth keeping in view:

- **There are no backups.** `LITESTREAM_BUCKET` is unset by David's decision (2026-08-15), so the
  Railway volume is the only copy of every account and trip, and the restore drill in DEPLOY.md §6
  has never been run. Deliberate, but it makes the volume a single point of failure.
- **Registration is open.** The app is publicly reachable, so anyone with the URL can create an
  account and consume the Resend quota. There is no invite gate.

Outstanding: **Phase 4** (booking import — needs the Resend inbound domain, and note §13's open
question about the verified-domain allowance) and **Phase 5** (notifications — needs VAPID keys).

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

## Quality workflow

A phase is done when `npm run typecheck`, `npm run lint` and `npm test` all pass from the repo
root, and the phase's own acceptance criterion in PLAN.md §11 is met.

| Trigger | Run |
|---|---|
| Any UI change, and before showing the app to anyone | `accessibility-reviewer` agent |
| Wanting to see the app rather than its test output | `node app/e2e/drive.mjs` (see its header) |

Both exist because the unit suites were green and the app was still wrong: a browser drive found
six defects in one pass, including new events defaulting to the browser's timezone instead of the
trip's. Tests prove the code does what it says; they cannot tell you the app is wrong. Commit once per phase with
a clear message. Phase 1 additionally is **not** done until a Litestream restore has actually been
rehearsed — configured is not the same as working (DEPLOY.md §4).
