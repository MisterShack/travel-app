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

**Phase 2 (auth & trips core) complete and verified locally**, 2026-08-15. `typecheck`, `lint`,
43 tests and `vite build` all pass on Node 24.19.0 / npm 11.17.0, and the whole flow works against
a real SQLite file outside the test harness: register → verify → create trip → invite → redeem.

**Phase 1 (deploy) is deferred, not done** — it needs the Railway and Namecheap dashboards. The
rule it existed to enforce still binds: **nothing real is stored in a deployed instance until
DEPLOY.md is complete through its restore drill**, and Phase 3 cannot launch before it.

Findings from building Phase 0–2 that contradict a straight port from budget-app, all encoded:

- **`STATIC_DIR` must be absolute.** Hono's `serveStatic` resolves its root against the process
  cwd, so a relative value works from the repo root and 404s the entire client under
  `npm run start --workspace @travel/server`. `env.ts` refuses a relative value at boot.
- **The native-binary pin is Rolldown, not Rollup.** Vite 8 replaced Rollup, so budget-app's
  `@rollup/rollup-linux-x64-gnu` pins a package this tree lacks. The npm/cli#4828 trap is still
  live on npm 11.17 — measured: removing `optionalDependencies` drops the lockfile's Linux
  entries from 22 to zero. DEPLOY.md §9.
- **`.dockerignore` is load-bearing.** The Dockerfile runs `npm ci` (Linux binaries) then
  `COPY . .`; without it the host's macOS `node_modules` lands on top of them.
- **`rateLimit`'s `fly-client-ip` check was deliberately not ported.** It is a leftover from
  budget-app's abandoned Fly deploy; on Railway it always misses, collapsing every client into
  one shared bucket.
- **Registration creates nothing.** No auto-created "personal" trip, unlike budget-app's ledger —
  a new account has an empty trip list until it creates a trip or redeems an invite.

## Quality workflow

A phase is done when `npm run typecheck`, `npm run lint` and `npm test` all pass from the repo
root, and the phase's own acceptance criterion in PLAN.md §11 is met. Commit once per phase with
a clear message. Phase 1 additionally is **not** done until a Litestream restore has actually been
rehearsed — configured is not the same as working (DEPLOY.md §4).
