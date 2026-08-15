# Travel App — Implementation Plan

> **Workflow note:** This plan was authored by Sonnet from a scoping conversation with David
> (2026-08-15) — see §12 for the settled decisions it rests on. It has not been built against yet
> and has not been independently reviewed. Before Phase 0 starts, run an adversarial review
> against it (`.claude/skills/plan-review`, ported from `budget-app`, is set up for exactly this —
> David intends to run it with Opus). Findings should be resolved into this document, not carried
> as tribal knowledge.

## 1. Vision

A personal/family travel agent: one place to see every trip's flights, lodging, and activities
merged into a single timeline, get reminders before things happen, and (later) get restaurant and
attraction suggestions. Shared with a small number of people per trip, the same way budget-app
shares a household ledger.

## 2. Tech stack

Deliberately mirrors `budget-app` — same host, same DB engine, same auth pattern, same deploy
shape. The two apps do **not** share a login or a database; this is about reusing a proven pattern,
not building a suite.

| Concern | Choice | Rationale |
|---|---|---|
| Repo layout | npm workspaces: `shared` / `app` / `server` | Same split as budget-app; `@travel/shared` resolves to source so client/server can't drift on schemas |
| Server | Hono | Matches budget-app; small, fast, runs the same way in the same Dockerfile shape |
| DB | SQLite via libSQL (`@libsql/client`) + Drizzle ORM | Matches budget-app; Railway volume + Litestream backup story is already solved there |
| Validation | Zod, in `shared/`, imported verbatim by client and server | Same "server never trusts the client" rule as budget-app |
| Auth | Ported from budget-app: argon2 password hashing, hashed session tokens in a `sessions` table, single-use hashed tokens for verify/reset/invite | Proven code, **separate accounts** — no SSO (§12) |
| Mail | Resend, over plain `fetch` (no SDK) | Same `Mailer` interface/`ResendMailer` as budget-app; also used for inbound (see §6) |
| Client | Vite + React + TypeScript, installable PWA | Matches David's platform choice; PWA gives offline-ish access while traveling without committing to a native app |
| Push | Web Push (VAPID) | Standard, no vendor lock-in, works from the PWA |
| Host | Railway, Dockerfile build, volume at `/data`, Litestream to object storage | Copy budget-app's `DEPLOY.md` runbook and known gotchas (§9) |

## 3. Data model (Drizzle-style, draft)

```ts
// --- Auth (ported from budget-app, unchanged shape) ---

users {
  id, email (unique, stored lower-cased), passwordHash,
  emailVerifiedAt?, createdAt, updatedAt
}

sessions {
  tokenHash (pk),              // only the hash is stored, same as budget-app
  userId -> users.id,
  expiresAt, createdAt
}

authTokens {
  tokenHash (pk),
  userId? -> users.id,         // null on 'invite' — the invitee doesn't exist yet
  kind: 'verify' | 'reset' | 'invite',
  tripId? -> trips.id,         // set on 'invite' only
  email?,                      // set on 'invite' only; redemption checks it against
                                // the *verified* email of the account redeeming
  expiresAt, usedAt?, createdAt
}

// --- Trips (this app's equivalent of budget-app's ledgers) ---

trips {
  id, name, destination,
  startDate, endDate,          // ISO date, no time — trip-level bounds for lists/sort
  homeTimezone,                 // IANA name; default display zone for the trip
  createdAt, updatedAt
}

tripMembers {
  tripId -> trips.id, userId -> users.id,
  role: 'owner' | 'member',
  joinedAt
  // PK (tripId, userId) — same shape as budget-app's ledgerMembers
}

// --- Timeline entities ---
// Every timestamp below is a UTC instant *plus* an IANA timezone name for
// display — see §4's timezone rule. Sorting the timeline is a UNION of these
// three tables ordered by the UTC instant; there is no single polymorphic
// "event" table, because each type has meaningfully different required fields.

flights {
  id, tripId -> trips.id,
  airline, flightNumber, confirmationCode?,
  departureAirport, departureAt, departureTimezone,
  arrivalAirport,   arrivalAt,   arrivalTimezone,
  seat?, notes?,
  source: 'manual' | 'import', bookingImportId? -> bookingImports.id,
  createdAt, updatedAt
}

lodging {
  id, tripId -> trips.id,
  name, address?,
  checkIn,  checkInTimezone,
  checkOut, checkOutTimezone,
  confirmationCode?, notes?,
  source: 'manual' | 'import', bookingImportId? -> bookingImports.id,
  createdAt, updatedAt
}

activities {
  id, tripId -> trips.id,
  kind: 'restaurant' | 'attraction' | 'transport' | 'other',
  name, location?,
  startAt, startTimezone, endAt?, endTimezone?,
  confirmationCode?, notes?,
  source: 'manual' | 'import', bookingImportId? -> bookingImports.id,
  createdAt, updatedAt
}

// --- Booking import (Resend inbound pipeline, §6) ---

bookingImports {
  id, tripId?,                  // null until matched to a trip
  resendMessageId, fromAddress, subject, receivedAt,
  status: 'pending' | 'needs_review' | 'applied' | 'rejected' | 'failed',
  extractedType?: 'flight' | 'lodging' | 'activity',
  extractedSummary?,            // short text for the review screen, not the raw email
  errorMessage?,
  processedAt?, createdAt
  // The raw email body/attachments are fetched from Resend's API, parsed in
  // memory, and discarded — never written to disk. This row plus its summary
  // is the only durable record an import happened, per the "no document
  // storage" decision in §12.
}

// --- Notifications ---

pushSubscriptions {
  id, userId -> users.id, endpoint, p256dh, auth, createdAt
}

reminders {
  id, tripId -> trips.id,
  relatedType: 'flight' | 'lodging' | 'activity', relatedId,
  remindAt,                     // UTC instant
  channel: 'push' | 'email',
  sentAt?, createdAt
}
```

## 4. Non-negotiables

- **Every event time is a UTC instant + an IANA timezone name, never a bare local time.** A
  flight departs in one zone and lands in another; a naive "local datetime string" cannot sort
  correctly across a trip that crosses zones or represent the departure/arrival gap correctly. Do
  the arithmetic in UTC; use the stored timezone only to *render*.
- **A trip is the shared unit**, the same role budget-app gives a ledger: ownership is a set of at
  least one owner, invites are single-use hashed tokens bound to an email, redemption checks the
  invite's email against the *verified* email of the account redeeming it.
- **The server never trusts the client:** every write is re-validated against the `shared/` Zod
  schemas before touching the database, regardless of what the client already validated.
- **No document/attachment storage.** Booking import extracts structured fields and discards the
  source email. If parsing quality turns out to need the original for re-processing, that is a
  reversal of this decision, not a workaround — revisit it explicitly, don't quietly cache raw
  emails "just in case."
- **Single Railway instance, file-based DB:** like budget-app, there is nowhere for a job queue or
  scheduler to live but the process itself. The reminder sweep runs in-process on an interval,
  same reasoning as budget-app's boot-time `purgeExpired`.
- **A booking import is never silently applied to the timeline.** Parsing free-text/HTML email
  into structured data is inherently lossy; every import lands as `needs_review` (or `pending`
  while trip-matching is ambiguous) and a human confirms before it becomes a real `flights` /
  `lodging` / `activities` row.

## 5. Auth & sharing model

Port budget-app's `server/src/auth/*` (password.ts, sessions.ts, tokens.ts, routes.ts) with
`ledger` renamed to `trip` throughout. Same primitives:

- Argon2 password hashing, hashed (not raw) session tokens in a cookie, hashed single-use tokens
  for email verification / password reset / trip invites.
- Every user gets nothing automatically on registration (unlike budget-app's auto-created personal
  ledger) — an empty trip list until they create or are invited to a trip. There's no "personal"
  vs "shared" trip distinction to carry over; every trip starts with exactly one owner (its
  creator) and can gain members via invite.
- Invite flow: owner enters an email → `authTokens` row with `kind: 'invite'`, `tripId`, `email` →
  Resend sends the link → redemption requires the redeeming account's **verified** email to match.

**Explicitly not doing:** SSO with budget-app. Two separate `users` tables, two separate logins.
Revisit only if maintaining two accounts becomes a real annoyance in practice — see §12.

## 6. Booking import pipeline (Resend inbound)

1. Namecheap: point a subdomain (e.g. `trips.<domain>` or an alias) at Resend's inbound MX per
   their setup docs; verify the domain in Resend.
2. Resend receives mail sent to that address, POSTs a webhook event (metadata only — no body) to
   `POST /webhooks/resend-inbound`.
3. The webhook handler calls Resend's Received Emails / Attachments API to fetch the full message,
   parses it in memory (see below), writes a `bookingImports` row, and **discards the raw
   content** — nothing from the email persists beyond the row's `extractedSummary`.
4. **Trip matching:** if the sender forwarded from an address already tied to exactly one
   in-progress or upcoming trip they're a member of, pre-select it; otherwise `tripId` stays null
   and the review screen asks which trip it belongs to. (Open question — see §13.)
5. **Parsing:** start with structured-source heuristics (airlines/OTAs send fairly regular HTML;
   look for known patterns first — confirmation code, flight number, airport codes, ISO-ish dates)
   before reaching for an LLM. Where heuristics fail, fall back to a free-tier LLM call (Gemini,
   per David's cost preference in §12) with the email text and a strict JSON schema for the
   extraction, so cost is bounded and no per-parse API key surprises show up in a bill.
6. Review screen shows the extracted fields next to a snippet of the source, lets the user
   correct/discard, and only then does data land in `flights` / `lodging` / `activities`.

## 7. Notifications

- **In-app**: unread reminders shown on trip open — no infra beyond the DB.
- **Web push**: PWA registers a service worker + subscribes via VAPID keys; `pushSubscriptions`
  stores the endpoint per user. Requires generating and storing a VAPID key pair as Railway env
  vars.
- **Email**: reuses the Resend `Mailer` interface already built for auth.
- **Scheduling**: a `reminders` row is created automatically when a flight/lodging/activity is
  added (defaults TBD — see §13), plus the user can add custom ones. An in-process interval
  (matching budget-app's single-instance scheduler pattern) sweeps for `remindAt <= now AND
  sentAt IS NULL`, sends, stamps `sentAt`.

## 8. Client / PWA plan

- Trip list (upcoming / past), trip detail = single merged timeline (flights + lodging +
  activities, sorted by UTC instant, each rendered in its own local timezone with a small badge
  when it differs from the trip's `homeTimezone`).
- Add/edit forms per entity type; a review queue for pending `bookingImports`.
- Installable PWA manifest + service worker (also the vehicle for web push).
- No document/photo UI in v1 — nothing to build here per §4.

## 9. Deployment

Copy budget-app's `DEPLOY.md` runbook, adjusted for this app, and carry over its hard-won lessons
rather than re-learning them:

- `railway.json`: Dockerfile build, healthcheck at `/health`, restart on failure.
- Volume **must** mount at `/data` — anywhere else silently discards data on every deploy.
- Litestream configured from day one this time (budget-app deferred this and ran unbacked for a
  stretch) — bucket/endpoint/credentials from env, `deploy/litestream.yml` stays host-neutral.
- `tsx` is a runtime dependency, not a dev one — the image runs `npm prune --omit=dev` and the
  server runs TypeScript directly.
- Clear Railway Watch Paths (or explicitly cover `app/**`, `server/**`, `shared/**`, `deploy/**`,
  `Dockerfile`, `railway.json`, `package*.json`) — an unwatched-path commit is marked *skipped*,
  not failed, and silently ships nothing.
- New for this app: Namecheap MX/DNS changes for the Resend inbound subdomain (§6.1), and VAPID
  keys as env vars for web push.

## 10. API surface (sketch, not final)

```
POST   /auth/register /auth/login /auth/logout /auth/verify /auth/reset
GET    /trips                          list trips the user is a member of
POST   /trips                          create trip (creator becomes owner)
GET    /trips/:id                      trip detail
POST   /trips/:id/invite               owner invites by email
POST   /trips/:id/invite/:token/accept
GET    /trips/:id/timeline             merged flights+lodging+activities, sorted
POST   /trips/:id/flights | /lodging | /activities        create
PATCH  /flights/:id | /lodging/:id | /activities/:id      edit
DELETE /flights/:id | /lodging/:id | /activities/:id
GET    /trips/:id/imports              pending bookingImports for review
POST   /imports/:id/apply | /imports/:id/reject
POST   /webhooks/resend-inbound        Resend inbound webhook
POST   /push/subscribe | /push/unsubscribe
```

## 11. Phases

- **Phase 0 — Workspace scaffold:** npm workspaces (`shared`/`app`/`server`), TS config, ESLint,
  Vitest, `railway.json`, Dockerfile skeleton. (Structural scaffold — package.json files, no
  workspace scripts yet — already created; Phase 0 fills these in for real.)
- **Phase 1 — Auth & trips core:** port auth module, Drizzle schema + migrations, `trips` /
  `tripMembers` CRUD + invite flow, libSQL client setup.
- **Phase 2 — Timeline core (the "launch this weekend" MVP):** `flights` / `lodging` /
  `activities` CRUD + Zod schemas, merged timeline query, PWA client with trip list + timeline
  view + add/edit forms. No import, no notifications yet — manual entry only.
- **Phase 3 — Booking import:** Resend inbound domain setup, webhook, parser (heuristics + LLM
  fallback), trip-matching, review-and-apply UI.
- **Phase 4 — Notifications:** VAPID/web push, service worker, reminder generation + in-process
  sweep, email reminders via the existing `Mailer`.
- **Phase 5 — Deployment:** Railway service, volume, Litestream from day one, DNS.

**Deferred / explicitly out of scope for v1** (from §12): expense/budget tracking, document or
photo attachments, AI-generated restaurant/attraction recommendations (would reuse the Gemini
call already built for import parsing, if it happens), SSO with budget-app, native mobile app.

## 12. Settled decisions (from the 2026-08-15 scoping conversation)

| Question | Decision |
|---|---|
| Stack | Hono, matching budget-app |
| Users | Shared with a few people per trip (multi-user, collaborative) |
| Platform | Installable PWA |
| Auth | Reuse the *pattern*, not the account — separate `users` table, no SSO |
| Data entry | Import from confirmations from day one, manual entry too |
| Import mechanism | Dedicated Resend inbound address + Namecheap DNS, not upload-only |
| Notifications | In-app + web push + email |
| AI recommendations | Cheapest viable option (Gemini free tier / Google Places), deferred past v1 |
| Attachments | None — structured data only |
| Budget tracking | Skipped for v1 |
| MVP scope | Core timeline only: trip → flights/hotels/activities → one combined view |
| Repo | Standalone repo at `/Users/david/Code/travel-app` (not a budget-app workspace) |

## 13. Open questions (not yet resolved — flag these for the reviewer)

- **Trip matching for inbound email** when the sender belongs to more than one upcoming trip, or
  none: §6 step 4 punts to "ask the user," but the review-queue UX for that isn't designed yet.
- **Default reminder timing**: how long before a flight/check-in/activity should a reminder fire
  by default, and is it the same for every event type? Not decided.
- **LLM parsing fallback cost/reliability**: "free tier" caps exist (Gemini's free tier has rate
  limits); no design yet for what happens when parsing fails or the free tier is exhausted mid-trip
  — silent `needs_review` with no extraction, presumably, but not stated as a rule.
- **Multi-timezone trip display**: §8 says events render in their own local zone with a badge when
  it differs from `homeTimezone`, but there's no decided default for *which* zone the trip-level
  date range (`startDate`/`endDate`) is anchored to when the trip itself spans zones.
- **Litestream "from day one"** (§9) is stated as a goal but not yet verified against budget-app's
  actual config — needs to be copied and adapted, not assumed to be a drop-in.
