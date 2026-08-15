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

**Phase 3 complete and verified locally**, 2026-08-15 — the MVP is built. 82 tests
(18 shared, 51 server, 13 app), typecheck, lint and `vite build` all pass, and the deployed shape
works end to end: one process serving the PWA and the API, register → verify → create trip →
add flight → merged timeline.

**Phase 1 (deploy) is still deferred** — it needs the Railway and Namecheap dashboards. Backups
are not gating local work by David's decision (2026-08-15).

Findings from building that contradict a straight port from budget-app, all encoded:

- **The API is mounted under `/api`.** Without it the client's `/trips/:id` page and the API's
  `/trips/:id` endpoint are the same URL, so deep-linking to a trip returns 401 JSON instead of
  the app. `/health` stays at the root because `railway.json` points there.
- **`STATIC_DIR` must be absolute** — `serveStatic` resolves against the process cwd, so a
  relative value 404s the whole client under `npm run start --workspace @travel/server`.
- **The native-binary pin is Rolldown, not Rollup** (Vite 8 replaced it), and the npm/cli#4828
  trap is still live on npm 11.17 — measured. DEPLOY.md §9.
- **Vite alias order matters**: the specific `@travel/shared/airports` alias must precede
  `@travel/shared`, or the bare one swallows it by prefix.
- **`.dockerignore` is load-bearing** — `npm ci` installs Linux binaries and `COPY . .` would put
  the host's macOS ones on top.
- **`rateLimit`'s `fly-client-ip` check was not ported** — a Fly leftover that on Railway
  collapses every client into one bucket.
- **Registration creates nothing** — no auto-created "personal" trip, unlike budget-app's ledger.

## Quality workflow

A phase is done when `npm run typecheck`, `npm run lint` and `npm test` all pass from the repo
root, and the phase's own acceptance criterion in PLAN.md §11 is met. Commit once per phase with
a clear message. Phase 1 additionally is **not** done until a Litestream restore has actually been
rehearsed — configured is not the same as working (DEPLOY.md §4).
