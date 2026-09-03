# Wayleaf — project guide

Travel memory platform: plan the trip, live it, and end up with a book. **Start at ROADMAP.md** —
it holds what is left, in what order, and the gates. The specs behind it: **BUSINESS-PLAN.md**
(strategy, v0.3, David's), **PLAN.md** (the build, phases 0–7), **PORTING.md** (what comes across
from Waypoint and what deliberately does not), **BRAND.md** (identity and design system).

**This is a new repository, not a rename.** Waypoint (`mistershack/travel-app`) is frozen and stays
live at `waypoint.myze.ca` as David's personal itinerary app. Wayleaf borrows its proven parts
deliberately, file by file, and PORTING.md is the ledger. Nothing is inherited by accident, and
nothing is inherited *silently* — several of Waypoint's best decisions are wrong here, and the ones
that invert are recorded as inversions rather than quietly dropped.

## The thesis, in one line

**Every trip should end with a book.** We are not an AI trip planner — that market is saturated and
free (BUSINESS-PLAN §2). We are a memory company that plans your trip because planning it is how we
get the structured data that makes the book assemble itself.

The single metric is **book attach rate per completed trip**. It is instrumented before anything
else is instrumented (BUSINESS-PLAN §14.7). Everything else is vanity.

## Layout (npm workspaces)

| Path | What |
|---|---|
| `shared/` | `@wayleaf/shared` — Zod schemas, the timezone triple, clustering rules. Imported **verbatim** by every client and the server. Platform-neutral: no `node:`, no DOM, no React Native. |
| `server/` | `@wayleaf/server` — Hono API on Railway, Postgres via Drizzle, R2 for all media. |
| `mobile/` | `@wayleaf/mobile` — React Native (Expo), iOS first. **The product.** Camera roll and background upload are the whole game. |
| `site/` | `@wayleaf/site` — the public web surface. Static marketing page and the policies. Ships first of the two web things, and it is not an app. |
| `web/` | `@wayleaf/web` — React SPA, **later**. Signed-in album editing on a large screen. Does not exist in v1. |

**Mobile is first and web is second, and the split inside web matters.** Photos originate on the
phone, in-trip use is on the phone, camera-roll permission is the entire product, and push exists
nowhere else. What the web does at launch is *explain the product and host the policies* — who we
are, what we do, where to get the app. Signed-in album editing on a large screen is a real and
wanted thing, and it is a later addition, not a v1 surface.

**Two consequences that are easy to miss and expensive to discover late:**

- **There is no web app to run a beta on.** Any plan that plots the beta on a web client is void —
  the capture surface has to ship before the first household does anything. This is why Phase 1 is
  the phone rather than a browser upload form that would be thrown away.
- **The policies are a build dependency, not just a compliance one.** App Store Connect will not
  accept a binary without a privacy policy URL and accurate privacy labels. So `site/` gates the iOS
  submission, which gates the beta, which gates everything — and it is the one gate that a lawyer's
  turnaround time sits inside.

`shared/` being platform-neutral is load-bearing in a way it was not in Waypoint: it is now imported
by a React Native bundle as well as a browser and Node. A stray `node:crypto` import breaks Metro,
not the type check.

## Non-negotiables

Full rationale in PLAN.md §2. In short, and in the order they will bite:

- **Backups are a hard requirement, from the first row.** Not a gate, not a phase, not deferred.
  Waypoint deferred backups deliberately and correctly — the worst case there was David re-entering
  his own trips. Here the worst case is **losing someone's honeymoon**, and there is no version of
  that which is acceptable. Nightly `pg_dump` to R2 on our own schedule, independent of Railway's
  offering, and **the restore is tested, not just the backup**. A backup nobody has restored from
  is a belief, not a backup. This is the single largest inversion from Waypoint and it is first
  because it is the one most likely to be inherited wrong.

- **Every event time is local wall-clock + an IANA timezone name + a derived UTC instant.** All
  three. Local+zone is the source of truth; the instant is a derived index, recomputed when either
  changes. Ported verbatim from Waypoint's `shared/src/time.ts`, including its DST gap/ambiguity
  handling, because it is correct and it was expensive.

- **The itinerary is the timezone oracle for photos — and the camera's clock is a separate
  unknown.** This is the whole product, expressed as a schema constraint, and it is two questions
  that look like one. EXIF `DateTimeOriginal` is a *naive local datetime* — no zone, and
  `OffsetTimeOriginal` is frequently absent. The itinerary knows what zone the *traveller* was in,
  so clustering a photo to "Tuesday, the Colosseum" is a cross-zone comparison that only works
  because every event carries the triple above. **A photo book company cannot copy this without
  building a trip planner first** (BUSINESS-PLAN §2).

  But `DateTimeOriginal` is written from the *device's* clock, not the place's. A DSLR still set to
  `America/Toronto` at the Colosseum stamps 08:00 for 14:00 — six hours out, wrong day, wrong
  caption. A household shoots on 3–5 devices with independent offsets, so this is the normal case.
  **Resolve the device's clock first (PLAN §2c step one), the traveller's location second.** Never
  apply the oracle to a raw EXIF timestamp.

- **Media bytes live in R2. Never in the database.** This *inverts* Waypoint's passes decision, and
  the inversion is the point: passes went into SQLite because Litestream replicates the database
  and knows nothing about the rest of the disk, so a file beside it would have had no backup path.
  With Postgres and R2 that argument is gone, and the reverse one arrives — 1.6 GB per trip of
  originals in Postgres would make every `pg_dump` unusable and every restore a multi-hour outage.
  **Read PORTING.md before reusing anything from `server/src/passes/`**; the sniffing and the
  serving defences carry, the storage decision does not.

- **The server never trusts the client** — every write re-validated against `shared/` schemas. And
  every uploaded byte is sniffed: the uploader's `Content-Type` is never believed, an image has to
  prove it is an image. Ported from Waypoint's passes work — **but not in its original form**,
  because uploads go client-to-R2 and the API never sees the bytes. Presigned PUTs carry pinned
  size, type and expiry conditions, and a photo stays `pending_scan` until something has actually
  read it. Nothing serves, clusters or prints an unpromoted row (PLAN §2d).

- **A collaborator never hits a paywall.** This is an authorisation rule, enforced in the
  membership module, not a billing rule bolted on later (BUSINESS-PLAN §3). Everyone else on the
  trip dumps photos in for free, forever. They are the cheapest acquisition channel there is, and
  the first time one of them hits a wall the loop is dead.

- **EXIF is stripped on the way out, never on the way in.** Geotags are how clustering works, so
  they are kept server-side. Shared links and exported derivatives are stripped by default, and we
  say so out loud — it is a trust feature (BUSINESS-PLAN §12).

- **Print fulfilment sits behind an interface from day one**, shaped like Waypoint's `Mailer`: one
  seam, a console implementation for development, a memory implementation for tests, Prodigi behind
  it. A second vendor is integrated before launch, because print quality *is* the product and being
  unable to switch vendors is the same as having no opinion about quality.

- **An order is money, so it is idempotent.** A double-charged card or a double-printed book is a
  real-world failure that a refund does not fully undo. Explicit state machine, idempotency keys on
  every transition, and no path where a retry prints twice.

- **The book PDF has a resolution floor.** A placement below Prodigi's DPI minimum is refused or
  warned about before the order, never after the print. "Print quality complaints" is a High risk in
  BUSINESS-PLAN §12; this is the cheapest part of the answer.

## What is deliberately *not* built

- **Itinerary generation from scratch.** The commodity (BUSINESS-PLAN §4). Ingest and organise
  first; generate later, if ever.
- **Gmail / inbox integration.** Restricted-scope verification plus a third-party security
  assessment that has historically cost tens of thousands. Forwarding addresses only. Do not
  "upgrade" without pricing the audit (BUSINESS-PLAN §12).
- **Video, in v1.** One minute of 4K is ~350MB — a single clip can outweigh an entire trip's
  photos. Short clips in the digital album only, later, capped and transcoded (BUSINESS-PLAN §8).
- **Capacitor, and native Swift + Kotlin.** Ruled out in BUSINESS-PLAN §6 with reasons. Expo.

## Relationship to Waypoint

Same host (Railway), same ORM (Drizzle), same auth code shape (argon2, hashed session tokens,
hashed single-use tokens), same `Mailer` interface, same "a booking import is never silently
applied" rule. **Different database engine, different media store, different client stack, and a
different attitude to backups.**

It does not share a login, a database, a Railway service or a domain with Waypoint. **Wayleaf lives
at `wayleaf.app`** (registered 2026-09-03; `wayleaf.ca` redirects to it). The domain layout, every
DNS record, and the MX conflict between human mail and the import pipeline are in **DNS.md** — read
it before touching mail or adding a subdomain.

When porting, carry over the deploy gotchas documented in Waypoint's `CLAUDE.md` and `DEPLOY.md`
rather than re-discovering them: `STATIC_DIR` must be absolute, the API must be mounted under
`/api` or the client's `/trips/:id` and the API's `/trips/:id` are the same URL, `RESEND_API_KEY`
throws on boot, `.dockerignore` is load-bearing, and the native-binary `optionalDependencies` issue
(npm/cli#4828) is live and bites on Linux *and* Windows.

## Status

**Nothing is built.** This repository holds the plan and the port ledger. Phase 0 has not started.

**The plan has been reviewed twice and the two rounds disagree.** A self-review under
`/plan-review` returned REVISE — eight findings, all resolved in PLAN.md or recorded as decisions in
ROADMAP §6. Three independent cold reviewers then returned **RETHINK** (business), **DO NOT BUILD AS
SPECIFIED** (safety) and **PROCEED WITH FIXES** (security) against the founding documents as a
whole. The team in `.claude/` is what came out of round 2; this plan was not revised for it.

**Until the decisions in ROADMAP §6 are made, this is not a build-ready spec.** PLAN §6 carries both
rounds and the one gap in the record: round 2's findings were never written down, which leaves the
release bar's condition 3 — every CRITICAL and HIGH closed — unverifiable against a list that does
not exist.

## Quality workflow

A phase is done when `npm run typecheck`, `npm run lint` and `npm test` all pass from the repo root,
**and** the phase's own acceptance criterion in PLAN.md §4 is met. The acceptance criteria are
deliberately not test suites — several of them require a real printed object or a real camera roll,
because the suites cannot see those.

| Trigger | Run |
|---|---|
| Any change at all | `npm run typecheck`, `npm run lint`, `npm test` from the root |
| Any change to a client, the API, or a user-facing flow | The workspace's own e2e suite (`mobile/` via Maestro or Detox; `web/` via Playwright when it exists) |
| Any change to `site/` | `npm run build --workspace @wayleaf/site`, then look at it in a real browser at 390px and in both themes |
| Any UI change, and before showing the app to anyone | `web-accessibility-reviewer` agent |
| Any migration that touches existing rows | `migration-rehearser` agent |
| Any change to upload, storage retention or deletion | Restore drill. Not the backup — the restore |
| Any change to order state, pricing or fulfilment | Idempotency replay test, and a sandbox order |
| After a push reaches production | `release-verifier` agent |

**Verified means exercised, not stubbed.** Waypoint learned this the expensive way: its unit suites
were green while the app defaulted new events to the browser's timezone instead of the trip's, and
a single browser drive found six defects in one pass. Here the equivalents are sharper — a
clustering suite over synthetic EXIF proves nothing about a real camera roll, and a PDF that opens
in a viewer proves nothing about what comes back from a printer. Say which kind of evidence a claim
rests on.
