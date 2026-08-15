# Travel App — Implementation Plan

> **Workflow note:** Authored by Sonnet from a scoping conversation with David (2026-08-15); see
> §12 for the settled decisions it rests on. Reviewed adversarially by Opus on 2026-08-15
> (`.claude/skills/plan-review`), and the findings are resolved **into this document** — §13 now
> holds only what is still genuinely open. Nothing has been built against it yet.
>
> Three review findings changed the shape of the plan rather than its details, and are called out
> where they land: the client needs an offline read path (§8), deployment moves ahead of auth
> (§11), and reminders needed a recipient (§3, §7).

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
| Auth | Ported from budget-app: argon2 password hashing, hashed session tokens, single-use hashed tokens for verify/reset/invite, plus `originGuard` and `rateLimit` (§5) | Proven code, **separate accounts** — no SSO (§12) |
| Mail | Resend, over plain `fetch` (no SDK) | Same `Mailer` interface/`ResendMailer` as budget-app; also used for inbound (§6) and as the **default** reminder channel (§7) |
| Client | Vite + React + TypeScript, installable PWA **with an offline read cache** | Installability is what makes iOS web push possible at all (§7); the offline cache is what makes the app useful on a plane (§8). The PWA shell alone does **not** give offline access to data — that takes the cache, and it is in scope for the MVP phase. |
| Push | Web Push (VAPID) | Standard, no vendor lock-in — but iOS imposes hard preconditions; see §7 |
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
  startDate, endDate,          // ISO date, no time. Anchored to homeTimezone — these
                               // exist only for list sort and upcoming/past bucketing,
                               // never for event arithmetic.
  homeTimezone,                 // IANA name; default display zone for the trip
  createdAt, updatedAt
}

tripMembers {
  tripId -> trips.id, userId -> users.id,
  role: 'owner' | 'member',
  remindersEnabled (default true),   // per-member opt-out; see §7 fan-out
  joinedAt
  // PK (tripId, userId) — same shape as budget-app's ledgerMembers
}

// --- Timeline entities ---
// Every event time is stored as a triple: the local wall-clock time, the IANA
// zone it is expressed in, and the derived UTC instant. See §4's timezone rule
// for why all three are needed and which one is authoritative.
//
// Sorting the timeline is a UNION of these three tables ordered by the UTC
// instant; there is no single polymorphic "event" table, because each type has
// meaningfully different required fields.

flights {
  id, tripId -> trips.id,
  airline, flightNumber, confirmationCode?,
  departureAirport, departureLocal, departureTimezone, departureAt,
  arrivalAirport,   arrivalLocal,   arrivalTimezone,   arrivalAt,
  seat?, notes?,
  source: 'manual' | 'import', bookingImportId? -> bookingImports.id,
  createdAt, updatedAt
}

lodging {
  id, tripId -> trips.id,
  name, address?,
  checkInLocal,  checkInTimezone,  checkInAt,
  checkOutLocal, checkOutTimezone, checkOutAt,
  confirmationCode?, notes?,
  source: 'manual' | 'import', bookingImportId? -> bookingImports.id,
  createdAt, updatedAt
}

activities {
  id, tripId -> trips.id,
  kind: 'restaurant' | 'attraction' | 'transport' | 'other',
  name, location?,
  startLocal, startTimezone, startAt,
  endLocal?,  endTimezone?,  endAt?,
  confirmationCode?, notes?,
  source: 'manual' | 'import', bookingImportId? -> bookingImports.id,
  createdAt, updatedAt
}

// --- Booking import (Resend inbound pipeline, §6) ---

bookingImports {
  id,
  userId -> users.id,           // resolved from fromAddress at ingest; mail from an
                                // address matching no verified user is rejected, never
                                // stored. Without this an unmatched import belongs to
                                // nobody and there is no principled answer to who may
                                // read it.
  tripId?,                      // null until matched to a trip
  resendMessageId (unique),     // also the idempotency key for webhook retries
  fromAddress, subject, receivedAt,
  status: 'pending' | 'needs_review' | 'applied' | 'rejected' | 'failed',
  extractedType?: 'flight' | 'lodging' | 'activity',
  extractedFields?,             // JSON of the parse result, shown on the review screen
  errorMessage?,
  processedAt?, createdAt
  // Nothing from the raw email is written to this database — see §4. The review
  // screen fetches the source from Resend on demand rather than from here.
}

// --- Notifications ---

pushSubscriptions {
  id, userId -> users.id,
  endpoint (unique),            // re-subscribing must update, not duplicate
  p256dh, auth, createdAt, lastSeenAt
  // Deleted on a 404/410 from the push service — that is how a browser reports
  // a dead subscription, and keeping it means retrying forever.
}

reminders {
  id, tripId -> trips.id,
  userId -> users.id,           // one row per recipient per channel: a reminder
  channel: 'push' | 'email',    // without a recipient cannot be delivered or
                                // recorded, and a single sentAt cannot represent
                                // "sent to two of four members"
  relatedType: 'flight' | 'lodging' | 'activity', relatedId,
  origin: 'auto' | 'custom',    // 'auto' rows are regenerated on edit, deleted
                                // with the event; 'custom' rows are the user's
  remindAt,                     // UTC instant
  claimedAt?,                   // set before sending, so an overlapping sweep
                                // cannot select the same row twice (§7)
  sentAt?, failedAt?, error?,
  createdAt
}
```

## 4. Non-negotiables

- **Every event time is stored as local wall-clock time + an IANA timezone name + the derived UTC
  instant.** The UTC instant is what the timeline sorts and compares on — a flight departs in one
  zone and lands in another, and no bare local datetime can order that correctly. But the *local*
  time is authoritative for future events, because a local wall-clock time is what an airline or
  hotel actually sold you. Countries change their DST rules with a few months' notice (Chile,
  Iran, Lebanon, Morocco and Mexico all have, recently); when that happens, a UTC instant computed
  under the old rules is wrong and the printed ticket is still right. So: **local + zone is the
  source of truth, the UTC instant is a derived index**, recomputed whenever the local time, the
  zone, or the container's tzdata changes. Never store a local datetime *alone*.
- **A trip is the shared unit**, the same role budget-app gives a ledger: ownership is a set of at
  least one owner, invites are single-use hashed tokens bound to an email, redemption checks the
  invite's email against the *verified* email of the account redeeming it. This invariant is
  enforced in the membership module, not at the route, so leaving and being removed cannot
  disagree about it (§5).
- **The server never trusts the client:** every write is re-validated against the `shared/` Zod
  schemas before touching the database, regardless of what the client already validated.
- **No document or attachment is persisted _by this app_.** Booking import extracts structured
  fields; the raw email is parsed in memory and never written to our database or disk. The scope
  of this rule is our storage, not the world: Resend retains the received message on their side
  and shows it in their dashboard, which is what makes on-demand source fetching possible at all
  (§6). Say that honestly rather than implying the mail evaporates. If parsing quality turns out
  to need *our own* copy for reprocessing, that is a reversal of this decision, not a workaround.
- **Single Railway instance, file-based DB:** there is nowhere for a job queue or scheduler to
  live but the process itself. Note that budget-app's boot-time `purgeExpired` is *not* precedent
  for the reliability this needs — its own comment says missing a run costs nothing because
  expired rows are rejected on use. A missed reminder sweep costs a missed flight. Same location,
  different bar; see §7 for the mechanism that meets it.
- **A booking import is never silently applied to the timeline.** Parsing free-text/HTML email
  into structured data is inherently lossy, and the inbound address is reachable by anyone who
  learns it, so an import is also untrusted input. Every import lands as `needs_review` (or
  `pending` while trip-matching is ambiguous) and a human confirms before it becomes a real
  `flights` / `lodging` / `activities` row. The review screen renders sender-supplied text as
  untrusted content, never as app chrome.
- **The trip timeline is readable without connectivity.** The moment this app is most needed —
  airport, plane, foreign SIM, roaming off — is the moment a server-of-record client shows an
  empty screen. A read-through cache of the last-fetched timeline is part of the MVP, not a later
  enhancement (§8).

## 5. Auth & sharing model

Port budget-app's `server/src/auth/*` (`password.ts`, `sessions.ts`, `tokens.ts`, `routes.ts`),
`server/src/ledger/membership.ts` and `invites.ts` (as `trip/*`, with `ledger` renamed to `trip`
throughout), and `server/src/middleware/originGuard.ts` and `rateLimit.ts`. The middleware is not
optional: sessions are cookie-based, so CSRF protection is load-bearing, and registration is
publicly reachable — budget-app removed its invite-code gate and notes that anyone with the URL
can now create an account and consume the Resend quota. Inherit the mitigation, not just the
exposure.

**One porting gotcha:** `rateLimit.ts`'s `clientAddress()` checks the `fly-client-ip` header, a
leftover from budget-app's abandoned Fly.io deploy. On Railway that header never appears, so
without a fix the limiter keys every request to `'direct'` — one shared global bucket. Replace it
with the Railway equivalent and set `TRUST_PROXY` accordingly.

Same primitives otherwise:

- Argon2 password hashing, hashed (not raw) session tokens in a cookie, hashed single-use tokens
  for email verification / password reset / trip invites.
- Every user gets nothing automatically on registration (unlike budget-app's auto-created personal
  ledger) — an empty trip list until they create or are invited to a trip. There's no "personal"
  vs "shared" trip distinction to carry over; every trip starts with exactly one owner (its
  creator) and can gain members via invite.
- Invite flow: owner enters an email → `authTokens` row with `kind: 'invite'`, `tripId`, `email` →
  Resend sends the link → redemption requires the redeeming account's **verified** email to match.
  Redemption is **not** nested under `/trips/:id` — the redeemer is not yet a member, so a
  trip-scoped route would collide with the membership middleware. It is `POST
  /invites/:token/accept`, mirroring budget-app's deliberately unscoped `acceptInvite`.
- An unauthenticated `GET /invites/:token` describes the invite (trip name and invited address
  only — never whether that address already has an account) so the landing page can say what the
  invitee has been invited to before they sign in.
- Owners can revoke a pending invite. A typo'd address otherwise stays a live key for the full TTL.

**Roles.** A `member` may create, edit and delete any timeline entity in a trip they belong to —
this is a family trip planner, not a permissions system. An `owner` may additionally invite,
revoke invites, remove members, grant ownership, and delete the trip. The last owner cannot be
removed or leave; they must grant ownership to someone else first, or delete the trip.

**Explicitly not doing:** SSO with budget-app. Two separate `users` tables, two separate logins.
Revisit only if maintaining two accounts becomes a real annoyance in practice — see §12.

## 6. Booking import pipeline (Resend inbound)

1. **DNS — settled 2026-08-15.** Inbound goes on **`mail.myze.ca`**, the domain already verified
   in Resend for sending. Resend's plan allows one verified domain, and this needs no second one:
   the DKIM record lives at `resend._domainkey.mail.myze.ca`, a subdomain, and `mail.myze.ca`
   itself currently holds no MX, CNAME or A record, so an inbound MX has nothing to collide with.
   The MX must have the **lowest priority value** present or mail will not route to Resend.

   It cannot go on `trips.myze.ca`: that name is a CNAME to Railway, and DNS forbids a CNAME
   coexisting with any other record type.

   **Consequence to handle in the webhook.** An MX on `mail.myze.ca` makes *every* address at that
   domain deliver to Resend — including `no-reply@mail.myze.ca`, the From address on every
   verification, invite and reminder email. Anyone who replies to one of those would otherwise
   land in the import pipeline. So the webhook matches on the **recipient**: only mail addressed
   to the designated inbound address (`trips@mail.myze.ca`) is processed, and everything else is
   discarded without creating a row. A reply to a reminder is not a booking confirmation.
2. Resend receives mail sent to that address and POSTs a webhook event to
   `POST /webhooks/resend-inbound`. The payload is **metadata only** — no body, headers or
   attachments.
3. **The webhook is authenticated.** Resend signs every webhook; the handler verifies the
   signature before doing anything else, and rejects unsigned or mis-signed requests. Without this
   the route is a world-writable endpoint that will fetch attacker-chosen message ids and write
   rows. The route additionally carries a rate limit, and `resendMessageId` is unique so Resend's
   retries are idempotent.
4. **The sender must be a known user.** `fromAddress` is resolved against verified user emails;
   mail from an address matching no verified user is rejected and nothing is stored. The inbound
   address is an email address, so anyone who learns it can mail it — without this gate, someone
   else's spam creates unbounded rows and unbounded LLM spend (§13). Note that `From:` is
   trivially forged, so this is a cost and noise control, **not** an authentication of the sender;
   the §4 human-review invariant is what actually contains the blast radius. Cap imports per user
   per day.
5. The handler calls Resend's Received Emails / Attachments API to fetch the full message, parses
   it in memory, writes a `bookingImports` row, and **writes nothing from the raw email to our
   database** (§4).
6. **Trip matching:** if the resolved user belongs to exactly one in-progress or upcoming trip,
   pre-select it; otherwise `tripId` stays null and the review screen asks which trip it belongs
   to. Unmatched imports are reachable via `GET /imports` (the caller's own, scoped by `userId`)
   and assigned via `POST /imports/:id/assign`.
7. **Parsing:** start with structured-source heuristics (airlines/OTAs send fairly regular HTML;
   look for known patterns first — confirmation code, flight number, airport codes, ISO-ish dates)
   before reaching for an LLM. Where heuristics fail, fall back to an LLM call (Gemini) with the
   email text and a strict JSON schema for the extraction.

   **On the paid tier, not the free one.** Gemini's free tier may use prompts to improve Google's
   products, and the prompts here are booking confirmations: names, home addresses, flight
   numbers, confirmation codes. At roughly 100 imports a year of a few thousand tokens each,
   Flash-Lite costs well under a dollar annually — a trivial price for not handing a family's
   travel documents to a training corpus. Cost was the original reason to pick the free tier
   (§12); it is not a good enough reason. **When the LLM is unavailable, rate-limited or fails**, the import still lands as
   `needs_review` with `extractedFields` empty and `errorMessage` set — the user gets a row saying
   "we received this, couldn't read it, here's the source." Parsing failure is never silent and
   never drops the import.
8. **Review screen** shows the extracted fields beside the source, fetched from Resend's API **on
   demand** at review time. **Resend keeps received mail for 30 days**, so this is a 30-day
   window: past it the source is gone and an unreviewed import is an extraction with nothing to
   check it against. Acceptable — imports get reviewed in days, not months — but the review queue
   should show the age of a pending import rather than let it quietly pass the line. This is the reason to fetch rather than to have stored: the whole
   justification for a human-review step is that a human can check the extraction against the
   original, and reviewing an extraction with nothing to compare it against is rubber-stamping.
   The user corrects or discards, and only then does data land in `flights` / `lodging` /
   `activities`.

## 7. Notifications

**Delivery channel.** Email is the **default** channel; push is an upgrade the user opts into.
This is a change from the original plan and it is driven by the target device: on iOS, Web Push
works *only* for a PWA the user has added to the Home Screen via the Share sheet — not in Safari,
not in Chrome-on-iOS, not from a bookmark — and the permission prompt must come from a user
gesture. There is no graceful way to detect "installed but denied" after the fact. Making push the
primary channel would make the happy path depend on a manual, undiscoverable install step that
Safari never prompts for. Email has none of these preconditions and the `Mailer` already exists.

- **In-app**: unread reminders shown on trip open — no infra beyond the DB.
- **Web push**: the client detects iOS-without-install and shows an explicit "add to Home Screen"
  onboarding prompt rather than silently failing. `pushSubscriptions` stores the endpoint per
  user; a `404`/`410` from the push service deletes the row. Requires VAPID keys as Railway env
  vars.
- **Email**: reuses the Resend `Mailer` interface already built for auth.

**Fan-out.** When a flight/lodging/activity is created, one `reminders` row is generated per trip
member with `remindersEnabled`, per channel that member has available. Custom reminders are
created for the requesting user only.

**Regeneration.** `origin: 'auto'` reminders are deleted and regenerated in the same transaction
as a `PATCH` to the related event, and deleted with a `DELETE`. Without this, editing a delayed
flight leaves a reminder for the old departure time and deleting a cancelled flight still pings
you about it — the two failures most likely to make someone stop trusting the app. The sweep also
skips any reminder whose target row no longer exists (`relatedId` is polymorphic and cannot carry
a foreign key).

**The sweep.** An in-process interval, the only place a scheduler can live (§4). It must:

1. **Claim before sending** — `UPDATE reminders SET claimedAt = now WHERE id = ? AND claimedAt IS
   NULL`, and proceed only if a row changed. Select-send-stamp duplicates every notification whose
   send outlasts one tick.
2. **Not overlap itself** — a tick that is still running skips the next one.
3. **Drop stale work** — the process dies on every Railway restart, crash and redeploy, and
   `claimedAt IS NULL` means the next boot picks the backlog up. That is correct for a reminder
   five minutes late and absurd for one four hours late. Anything more than **2 hours** past
   `remindAt` is marked `failedAt` with `error: 'stale'` and never sent.
4. Stamp `sentAt` on success, `failedAt` + `error` on failure, and leave the row for inspection
   either way.

## 8. Client / PWA plan

- Trip list (upcoming / past), trip detail = single merged timeline (flights + lodging +
  activities, sorted by UTC instant, each rendered in its own local timezone with a small badge
  when it differs from the trip's `homeTimezone`).
- Add/edit forms per entity type; a review queue for pending `bookingImports`.
- Installable PWA manifest + service worker (also the vehicle for web push).
- **Offline read cache.** Every successful timeline fetch writes the response to IndexedDB, keyed
  by trip. When a fetch fails, the view renders the cached copy behind a visible banner naming
  when it was saved. Writes remain online-only and fail honestly — there is no offline mutation
  queue, and adding one is explicitly not in scope. This is the cheap two-thirds of local-first:
  it is a few hours of work inside the MVP phase and a painful retrofit afterwards, and it is the
  difference between the app working on a plane and showing an empty screen (§4).
- **Timezone data.** Converting a typed local time to a UTC instant needs the zone, and the user
  types an airport code, not `Europe/London`. A bundled IATA→IANA lookup table lives in `shared/`
  (a few hundred KB of static JSON covering real commercial airports — no runtime dependency, no
  network call). Lodging and activities fall back to a zone picker defaulted to the trip's
  `homeTimezone`. When an airport code is unknown, the form asks rather than guessing: defaulting
  a foreign airport to the home zone silently produces wrong instants for exactly the multi-zone
  trips §4 exists to handle.
- **Concurrent edits.** `PATCH` carries the `updatedAt` the client last saw; a mismatch returns
  409 and the client reloads and re-presents. Two members editing the same flight is a real case
  in a shared trip, and last-write-wins should be a decision, not an accident.
- No document/photo UI in v1 — nothing to build here per §4.

## 9. Deployment

Copy budget-app's `DEPLOY.md` runbook, adjusted for this app, and carry over its hard-won lessons
rather than re-learning them:

- `railway.json`: Dockerfile build, healthcheck at `/health`, restart on failure.
- Volume **must** mount at `/data` — anywhere else silently discards data on every deploy.
- **`VITE_API_URL` is a build-time value.** `/` means same-origin (the deployed shape); unset
  builds a client with no sign-in at all, and that build loads and looks fine right up until
  someone tries to log in. The Dockerfile sets it and a test pins it, exactly as budget-app does.
- `tsx` is a runtime dependency, not a dev one — the image runs `npm prune --omit=dev` and the
  server runs TypeScript directly.
- Static file serving is registered **after** the API routes so it can never shadow them, and is
  active only when `STATIC_DIR` is set.
- Litestream configured **in Phase 1, before any real data exists** (§11) — bucket/endpoint/
  credentials from env, `deploy/litestream.yml` stays host-neutral. budget-app deferred this and
  ran unbacked with real user data; the phase order here is what prevents repeating that, not good
  intentions.
- Clear Railway Watch Paths (or explicitly cover `app/**`, `server/**`, `shared/**`, `deploy/**`,
  `Dockerfile`, `railway.json`, `package*.json`) — an unwatched-path commit is marked *skipped*,
  not failed, and silently ships nothing.
- The three Linux native binaries in root `optionalDependencies` (`rollup`, `@node-rs/argon2`,
  `@libsql`) are load-bearing if those deps land in the lockfile — see budget-app's `CLAUDE.md`.
- New for this app: Namecheap MX/DNS for the Resend inbound subdomain (§6.1), and VAPID keys as
  env vars for web push.

## 10. API surface (sketch, not final)

**Everything below is mounted under `/api`.** The client owns every other path,
and without the prefix the two collide: the client's trip page is `/trips/:id`
and so was the API's, so a browser deep-linking to a trip received
`401 {"error":"unauthenticated"}` instead of the app shell. `/health` stays at
the root because `railway.json` points its healthcheck there.

```
POST   /auth/register /auth/login /auth/logout /auth/verify /auth/reset

GET    /trips                          list trips the user is a member of
POST   /trips                          create trip (creator becomes owner)
GET    /trips/:id                      trip detail
PATCH  /trips/:id                      rename / dates / homeTimezone
DELETE /trips/:id                      owner only

GET    /trips/:id/members
DELETE /trips/:id/members/:userId      remove; refuses the last owner
POST   /trips/:id/members/:userId/owner   grant ownership
POST   /trips/:id/leave                refuses the last owner
POST   /trips/:id/invite               owner invites by email
GET    /trips/:id/invites              pending invites
DELETE /trips/:id/invites/:id          revoke
GET    /invites/:token                 unauthenticated: trip name + invited address only
POST   /invites/:token/accept          authenticated; deliberately not trip-scoped (§5)

GET    /trips/:id/timeline             merged flights+lodging+activities, sorted
POST   /trips/:id/flights | /lodging | /activities        create
PATCH  /flights/:id | /lodging/:id | /activities/:id      edit (updatedAt precondition → 409)
DELETE /flights/:id | /lodging/:id | /activities/:id

GET    /imports                        the caller's unmatched imports
GET    /trips/:id/imports              imports matched to a trip
GET    /imports/:id/source             proxied source fetch for the review screen (§6.8)
POST   /imports/:id/assign             assign to a trip
POST   /imports/:id/apply | /imports/:id/reject

POST   /webhooks/resend-inbound        Resend inbound webhook; signature-verified, rate-limited
POST   /push/subscribe | /push/unsubscribe

GET    /health                         at the root, not under /api
```

Authorization: a trip id in a request is a claim, never an authorisation. Every route above
resolves the caller's role through the membership module before reading or writing anything, and
the flat entity routes (`PATCH /flights/:id`) resolve entity → trip → role.

## 11. Phases

The order below is the review's main structural change. The original plan put deployment last
while calling Phase 2 "the launch this weekend MVP" — which would have put real trips on a Railway
volume with no backup, the exact failure budget-app already made. Deployment now comes second,
before there is anything to lose, and it is also a Phase 2 prerequisite in its own right: invite
redemption requires a **verified** email, which requires working outbound mail, which requires a
verified Resend domain.

- **Phase 0 — Workspace scaffold:** npm workspaces (`shared`/`app`/`server`), TS config, ESLint,
  Vitest, `railway.json`, Dockerfile, and a Hono server that answers `/health`. (The structural
  package.json files already exist; Phase 0 fills them in for real.)
- **Phase 1 — Deploy skeleton:** Railway service at `trips.myze.ca`, volume at `/data`, Litestream
  configured **and a restore drill actually run**, Resend domain verified and `MAIL_FROM` set.
  Nothing real is stored yet, which is the point — this is the cheapest moment to get the
  infrastructure wrong.
  **Done 2026-08-15** — live at <https://trips.myze.ca>, valid certificate, `/health` answering,
  the client served, SPA deep links resolving, and `/api/*` still returning JSON rather than being
  shadowed by the static fallback. Registration and email verification work against real Resend
  delivery.
  **Except backups**, which David has deliberately deferred for both apps: `LITESTREAM_BUCKET` is
  unset and the Railway volume is the only copy. The restore drill therefore has not been run.
  That is a decision, not an oversight — but it means the volume is a single point of failure from
  the moment real trips go in.
- **Phase 2 — Auth & trips core:** port auth + membership + invites + middleware, Drizzle schema
  and migrations, `trips`/`tripMembers` CRUD, full invite flow, libSQL client setup.
- **Phase 3 — Timeline core (the MVP, and the point this goes live):** `flights`/`lodging`/
  `activities` CRUD + Zod schemas, IATA→IANA table, merged timeline query, PWA client with trip
  list + timeline view + add/edit forms, **and the offline read cache** (§8). Manual entry only.
- **Phase 4 — Booking import: done 2026-08-15.** Signature-verified webhook, recipient and
  verified-sender gates, per-user daily cap, idempotency on the provider's message id, heuristic
  parser with a paid-Gemini fallback, single-candidate trip matching, and the review-and-apply UI.
  Needs `RESEND_WEBHOOK_SECRET`, `GEMINI_API_KEY` and the inbound MX record (DEPLOY.md §11) to run
  in production.
- **Phase 5 — Notifications: done 2026-08-15.** Reminder generation and fan-out, the in-process
  sweep with claim-before-send and a staleness cutoff, email reminders via the existing `Mailer`,
  VAPID web push with a custom service worker, and the iOS install prompt. Verified end to end
  against a running server: a due reminder is delivered once and not re-sent.

**Deferred / explicitly out of scope for v1** (from §12): expense/budget tracking, document or
photo attachments, offline *writes* (§8), AI-generated restaurant/attraction recommendations
(would reuse the Gemini call already built for import parsing, if it happens), SSO with
budget-app, native mobile app.

## 12. Settled decisions

From the 2026-08-15 scoping conversation, plus three settled during the plan review the same day.

| Question | Decision |
|---|---|
| Stack | Hono, matching budget-app |
| Users | Shared with a few people per trip (multi-user, collaborative) |
| Platform | Installable PWA |
| Auth | Reuse the *pattern*, not the account — separate `users` table, no SSO |
| Data entry | Import from confirmations from day one, manual entry too |
| Import mechanism | Dedicated Resend inbound address + Namecheap DNS, not upload-only |
| Notifications | In-app + email + web push |
| AI recommendations | Cheapest viable option (Gemini free tier / Google Places), deferred past v1 |
| Attachments | None stored by this app — structured data only |
| Budget tracking | Skipped for v1 |
| MVP scope | Core timeline only: trip → flights/hotels/activities → one combined view |
| Repo | Standalone repo at `/Users/david/Code/travel-app` (not a budget-app workspace) |
| **Offline** (review) | **Reading the itinerary without connectivity is a requirement.** Read-through IndexedDB cache ships with the MVP; offline writes stay out of scope |
| **Push target** (review) | **iPhone.** Drives email-first reminders and the Home Screen install prompt (§7) |
| **Launch point** (review) | **Goes live at Phase 3.** Deployment and backups therefore move to Phase 1 (§11) |
| **Audience** (2026-08-15) | David, his family, and his **dev portfolio**. The third one is why the repo, its history and the UI's finish are part of the deliverable, not just the running app |
| **Running cost** (2026-08-15) | Target **~$10/month**. A $20/month line item is disqualifying; a few dollars a year to avoid a compromise is not |
| **LLM tier** (2026-08-15) | **Paid** Gemini, not the free tier — see §6.7 |

## 13. Open questions

**Settled 2026-08-15:** the Resend verified-domain question is closed — the plan allows one
domain, `mail.myze.ca` is it, and it can carry both outbound DKIM and inbound MX. No add-on, no
extra cost. See §6.1, including the recipient-filtering rule that comes with sharing the domain.

**Settled in Phase 5:** default reminder lead times are flights 3h, check-in 2h, activities 1h
(`DEFAULT_LEAD_MINUTES`), chosen as the warning each type actually needs to be useful. Per-event
overrides are deferred — sensible defaults matter more than a setting nobody opens. Reminders are
not created for an event whose lead time has already passed: you just entered it, so notifying
immediately would be noise.

Resolved into the document above and no longer open: the trip-matching UX (§6.6), the LLM-failure
rule (§6.7), the trip-level date anchor (§3 — `homeTimezone`, and those fields are for sort and
bucketing only), and Litestream's status (§11 Phase 1 makes it a gated deliverable with a restore
drill rather than an aspiration).

Still genuinely open:

- **Resend verified-domain count.** Free includes only a limited number, and an extra domain is a
  $20/month add-on — which alone would double the §12 budget. Inbound MX and outbound DKIM/TXT can
  share one name (only a CNAME conflicts with other record types, which is why the *app's* domain
  had to be separate — §6.1), so `mail.myze.ca` should be able to do both. Confirm against the
  actual Resend account before Phase 4 rather than discovering it at DNS time.
- **LLM spend cap.** §6.4's per-user import cap and §6.7's failure path bound the damage, but no
  number is chosen for either. On the paid tier the exposure is money rather than a quota, so set
  a billing alert as well as a per-user cap when Phase 4 lands.
- **`tzdata` refresh policy.** §4 makes the UTC instant a derived value that must be recomputed
  when timezone rules change. The container's ICU data is pinned at image build, so "when tzdata
  changes" in practice means "when we rebuild". Whether that needs anything more deliberate — a
  periodic recompute, or a check on boot — is unresolved and only matters for trips booked months
  ahead.
- **Trip deletion semantics.** §10 has `DELETE /trips/:id` for owners. Whether that is a hard
  delete, a soft delete with a grace period, or requires all other members to be removed first is
  undecided. Related and also undecided: account deletion, which nothing in the plan covers yet.
