# Travel App — project guide

Personal/family travel agent: flights, lodging, and activities merged into one timeline per trip,
with reminders. **PLAN.md** is the spec — read it before implementing anything. It has not been
built against yet; if you're about to start Phase 0, confirm PLAN.md has been through
`.claude/skills/plan-review` first (§ of PLAN.md's header note).

## Layout (npm workspaces, once Phase 0 lands)

| Path | What |
|---|---|
| `shared/` | `@travel/shared` — Zod schemas, imported **verbatim** by client and server. Platform-neutral. |
| `app/` | `@travel/app` — Vite/React PWA client. |
| `server/` | `@travel/server` — Hono API. |

## Non-negotiables

See PLAN.md §4 for the full list and rationale. In short:

- **Every event time is a UTC instant + an IANA timezone name.** Never store or compare bare local
  datetimes — a flight departs in one zone and lands in another.
- **A trip is the shared unit** (this app's equivalent of budget-app's ledger): owner/member roles,
  single-use hashed invite tokens bound to an email, redemption checked against the *verified*
  email of the redeeming account.
- **The server never trusts the client** — every write is re-validated against `shared/` schemas.
- **No document/attachment storage.** Booking import extracts fields and discards the source
  email; only a summary row survives.
- **Single Railway instance, file-based DB** — the reminder sweep and any other periodic work runs
  in-process, there is nowhere else for a scheduler to live.
- **A booking import is never silently applied** — it always lands as `needs_review` (or unmatched
  `pending`) until a human confirms it.

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

**Planning stage.** PLAN.md is written; nothing has been implemented yet. Next step is an
adversarial review of PLAN.md (see its header note), then Phase 0.
