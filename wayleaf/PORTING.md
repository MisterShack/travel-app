# Porting from Waypoint

> Wayleaf is a new repository. Waypoint (`mistershack/travel-app`) is frozen and stays live at
> `waypoint.myze.ca` as David's personal itinerary app. **Nothing is inherited by default.** This is
> the ledger: what comes across, what comes across changed, and what must not come across at all.
>
> Waypoint is ~18,900 lines of non-test TypeScript across three workspaces. Roughly a third of it
> is directly reusable, a third needs the engine or the transport changed, and a third is a
> different product.
>
> Written 2026-09-03 against Waypoint at `6409851`.

## How to read this

Three verdicts:

- **TAKE** — copy it, keep its comments, keep its tests. The comments are frequently the most
  valuable part; several of them record a defect that cost a day to find.
- **ADAPT** — the shape is right, something underneath changed. The entry says what.
- **LEAVE** — do not copy. The entry says why, because "we didn't need it" and "it would have been
  actively wrong" are different reasons and only one of them is worth recording.

**Copy the tests with the code.** Waypoint has 383 vitest specs plus 38 in `infra/`; the ones
attached to TAKE files are free correctness and free documentation.

---

## `shared/` — the highest-value third

| File | Verdict | Notes |
|---|---|---|
| `time.ts`, `time.test.ts` | **TAKE** | The timezone triple. Built on `Intl`, no dependency, platform-neutral. Handles the DST gap by shifting forward and the ambiguity by choosing the earlier occurrence — both deliberate, both tested. This is the foundation of photo clustering (PLAN §2c) and it is the single most valuable file in Waypoint. |
| `airports.ts`, `airports.test.ts` | **TAKE** | OpenFlights table plus `cityFromAddress`. Keep the warning attached to it: most short uppercase words are IATA codes, so membership in this table is not evidence of anything. It also resolves a *name*, never a zone — three Portlands sit in three timezones. |
| `conflicts.ts`, `conflicts.test.ts` | **TAKE** | Gap and conflict detection, pure, client-side. Still correct here, and Phase 1's clustering will want its interval reasoning. Note the fix recorded in its history: air-to-air compares IATA codes, everything else compares place names, because a code and a station name are not one namespace. |
| `timeline.ts` | **ADAPT** | `TimelineItem` grew structured `startPlace`/`endPlace`/`address` fields precisely because a display string is not an interface — that lesson holds. It needs a photo-cluster item kind added. |
| `trip.ts`, `auth.ts`, `common.ts` | **TAKE** | Zod schemas. Straight across. |
| `prefs.ts` | **TAKE** | Time format and theme. Trivially reusable. |
| `nearby.ts` | **ADAPT** | Phase 7 only. Its citation rules are contractual, not decorative — Grounding with Google Maps requires sources shown, immediately following the content they support, reachable in one interaction, with "Google Maps" not recapitalised or wrapped. The server refusing to return an uncited answer is the right call and should survive. |
| `passes.ts` | **LEAVE for now** | The feature is worth having later. Bring the schema back when passes return, not in Phase 0. |

**One new constraint on this workspace.** In Waypoint, "platform-neutral" meant browser and Node.
Here it also means **Metro**, because React Native imports it. A `node:crypto` import that Vite
would have shimmed will break the mobile bundle instead. Add a lint rule; do not rely on noticing.

---

## `server/` — take the shapes, change the engine

### Auth — TAKE, with one transport change

`auth/password.ts`, `auth/tokens.ts`, `auth/sessions.ts`, `auth/routes.ts`, and
`middleware/requireUser.ts`. Argon2 hashing, session tokens stored only as SHA-256, single-use
`auth_tokens` for verify / reset / invite, expired rows deleted on sight rather than merely
ignored. All correct, all tested, all reusable.

**The one change is the transport, and it is not optional.** Waypoint's sessions are cookies, and
`middleware/originGuard.ts` is built on that assumption — its own comment reasons explicitly about
browsers, ambient cookies and the confused deputy, and allows a *missing* `Origin` precisely
because a non-browser client carries no ambient cookies.

A React Native client is that non-browser case, permanently. So:

- Keep the hashed-token session **storage** exactly as it is.
- Add a bearer-token **presentation** for mobile, resolving to the same rows, held in the device's
  secure storage.
- **Scope `originGuard` to the browser surface.** Applied globally it is either bypassed by every
  mobile request — making it decorative — or it blocks them.

`auth_tokens.userId` being nullable is deliberate and the comment says so: an invite exists before
its recipient does. Anything reading it must narrow. Keep that comment.

### Mail — TAKE, verbatim

`mail/mailer.ts`. The `Mailer` interface with `ConsoleMailer` and `MemoryMailer` is a good seam and
is **the template for `FulfilmentProvider`** in PLAN §2g. Copy the pattern as well as the file.

`RESEND_API_KEY` throws on boot in `env.ts`, and the only symptom is a healthcheck failure. That
cost Waypoint eight days of misdiagnosis. Keep the throw, and document it where someone deploying
will read it.

### Trips and membership — TAKE, then add one rule

`trip/routes.ts`, `trip/membership.ts`, `trip/invites.ts`. Owner/member roles with at least one
owner enforced in the membership module; single-use hashed invite tokens bound to an email, checked
against the *verified* email of the redeeming account. Good, and the invite loop is the growth
engine here in a way it was not in Waypoint.

**Add:** PLAN §2e. A collaborator never hits a paywall, enforced here. Write the module so there is
nowhere for a plan check to go on the participation paths.

### Import — TAKE in Phase 5, not before

`import/parse.ts`, `import/resendInbound.ts`, `import/signature.ts`, `import/routes.ts`. Proven end
to end against a real airline confirmation and a real Via Rail one — the second being the stronger
evidence, because rail never takes the heuristic path and so exercises the whole chain including
Gemini.

Three things travel with it:

- The Svix verification is hand-written rather than SDK-based, specifically so it is testable
  without a network. Keep that.
- Everything lands as `needs_review`. The inbound address is reachable by anyone and `From:` is
  forgeable.
- **"Awaiting review" was defined three times, differently**, and the badge read 3 against one
  outstanding row. One `AWAITING` predicate serves every consumer. Do not let that regrow.

### Passes — TAKE the defences, LEAVE the storage

`passes/pkpass.ts` is dependency-free zip reading that makes a file prove it is a PKPASS by
containing a readable `pass.json` — magic bytes cannot distinguish a `.pkpass` from a `.docx`.
**TAKE it**, and take the principle it embodies straight into photo upload: sniff the bytes, never
believe the uploader's `Content-Type`.

`passes/routes.ts` pins `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`,
`Content-Security-Policy: sandbox; default-src 'none'` and `Cache-Control: private, no-store`, and
reads the content type from our own sniffed column. **TAKE that whole header block.** Its comment is
correct and general: the danger is serving a file back, not accepting one.

**LEAVE the `data: blob(...)` column and everything that follows from it.** Waypoint put bytes in
SQLite because Litestream replicates the database and knows nothing about the rest of the disk. With
Postgres and R2 that argument is gone and the opposite one arrives (PLAN §2d). **This is the single
most likely thing to be ported wrong**, because the reasoning in the Waypoint source reads as
sound — and it is sound, about Waypoint.

Note also the stated limit that comes with the feature: an emailed attachment is kept only when the
import resolved to exactly one trip, because `passes.tripId` is not nullable. If passes return,
that constraint should be revisited rather than inherited.

### Database — ADAPT, all of it

`db/schema.ts` is `sqliteTable` throughout. Every table needs rewriting as `pgTable`, and the
opportunity should be taken rather than mechanically translated:

- Timestamps are ISO-8601 **text** in Waypoint, which is a SQLite convention. Use `timestamptz`.
- `blob('data', { mode: 'buffer' })` does not come across at all (above).
- Enum columns are `text(..., { enum: [...] })`. Postgres enums are available; text with a check
  constraint is more portable and BUSINESS-PLAN §6 asks for portability as the real hedge. **Prefer
  the portable form** — no vendor-specific extensions, so a migration stays a weekend.
- The polymorphic `relatedType`/`relatedId` pattern on `reminders` and `passes` is honest about
  three tables not sharing a foreign key. It will be wanted again for photo clusters.

`db/client.ts` is `@libsql/client` + `drizzle-orm/libsql` and becomes `node-postgres`. **Its long
comment about `:memory:` becomes irrelevant** — that trap is libsql's, where the first
`db.transaction()` destroys every table. Delete the comment rather than porting a warning about a
driver we no longer use; a stale warning is worse than none.

`db/migrate.ts` ports directly; Drizzle's migrator is the same shape.

### Notify — ADAPT

`notify/sweep.ts` and `notify/reminders.ts` are good and the reasoning holds: reminders fan out one
row per member per channel, the sweep **claims each row before sending** so an overlapping tick
cannot double-send, and anything more than 2h late is dropped rather than delivering a misleading
"departs in 3 hours" after the plane has gone. **TAKE that claim-before-send pattern** — it is
directly the shape order processing needs in PLAN §2h.

`notify/push.ts` is web push with VAPID. **LEAVE.** Mobile push is APNs/FCM through Expo. Web push
may return for the companion surface later, and the "iOS only exposes PushManager to a PWA launched
from the Home Screen" constraint is worth remembering if it does.

**Postgres changes the sweep's context.** Waypoint's single-instance file-based SQLite meant there
was nowhere else for a scheduler to live and no second writer to race. Postgres allows more than one
instance, so the claim must be a real `UPDATE ... WHERE claimed_at IS NULL RETURNING` rather than a
read-then-write that only worked because nothing else was writing.

### Middleware

`requireUser.ts` — TAKE. `originGuard.ts` — ADAPT, scoped to browser routes (above).
`rateLimit.ts` — TAKE, and keep the fix: the `fly-client-ip` check is a Fly leftover that on
Railway collapses every client into one bucket. It was already removed in Waypoint; do not
reintroduce it by copying from an older commit.

---

## `app/` — the least portable third

Waypoint's client is a Vite/React PWA built for a phone-shaped itinerary. Wayleaf's capture surface
is an Expo app, its first web surface is a static page that is not an app at all, and signed-in
album editing on the web comes later (PLAN §2k). **Most of this workspace is a different product**,
and the parts that do carry over are mostly heading to `mobile/` rather than to `web/`.

Note the direction of travel: a phone-shaped React PWA is closer to the Expo app than to anything
`site/` needs, so read the table below as "what `mobile/` can borrow", not "what the web inherits".
`site/` inherits nothing from here — it is a static page with no session.

| Area | Verdict |
|---|---|
| `api/client.ts` | **ADAPT** — the fetch wrapper is fine; it needs to work with bearer tokens as well as cookies, and it should be shared with the mobile app. |
| `auth/` context | **TAKE** — small and correct. |
| `data/cache.ts`, `sw.ts` | **ADAPT** — the read-through IndexedDB cache is the right idea and offline itinerary access is still a v1 requirement. The service worker is web-only; mobile offline is a different mechanism. Keep the split honest: Waypoint's own e2e notes record that the offline spec covers the cache, not the worker, because the worker is disabled in dev. |
| `features/timeline/` | **ADAPT** — the timeline itself is reusable. `EventForm` is large and phone-shaped. `directions.ts` (the map hand-off — Apple Maps, `geo:`, Google Maps, no embedded map, no API key) is **TAKE**, and works offline, which is the case that matters. |
| `features/trips/`, `features/auth/`, `features/account/` | **ADAPT** — screens, not logic. |
| `features/imports/` | **TAKE in Phase 5** with the import backend. |
| `components/` | **LEAVE mostly** — these are Waypoint's design system, and BRAND.md here is a different palette and a different feeling. Take `useWide.ts`'s *idea*, not its breakpoint. |
| `theme.ts` | **LEAVE** — see BRAND.md. Neutral, warm, paper. Waypoint's palette fights photographs. |

---

## `infra/` and deployment

`infra/check-drift.mjs` is **ADAPT and keep the method**. It is a set of pure rule functions tested
against fixtures with no network, where exit `2` means *could not check* and is never reported as
clean — because a checker that says "OK" about something it never looked at is worse than none.
That principle is worth more than the specific rules, most of which are Waypoint-specific.

One rule generalises directly and should be an early Wayleaf rule: **a healthcheck pointed anywhere
but a real health route is worse than no healthcheck**, because the SPA fallback answers every
unmatched GET with `index.html` — 200, forever, while the API behind it is dead.

`Dockerfile`, `.dockerignore`, `deploy/` — **ADAPT**. Carry the gotchas:

- `STATIC_DIR` must be absolute; `serveStatic` resolves against the process cwd.
- The API must be mounted under `/api`, or the client's `/trips/:id` and the API's `/trips/:id` are
  the same URL and a deep link returns 401 JSON instead of the app.
- `.dockerignore` is load-bearing: `npm ci` installs Linux binaries and `COPY . .` would put the
  host's on top.
- The native-binary pin is **Rolldown**, not Rollup (Vite 8 replaced it), and npm/cli#4828 is live
  on npm 11.17 — measured. `@node-rs/argon2` has the same problem. Declare the platform pairs in
  `optionalDependencies` with the `os` field.
- Vite alias order matters: `@wayleaf/shared/airports` must precede `@wayleaf/shared`.

**Litestream does not come across.** It replicates SQLite. Postgres backups are `pg_dump` to R2 on
our own schedule (PLAN §2a), and the restore drill covers the bucket as well as the database.

**`railway.json` does not come across either**, and the reason is worth carrying: it supplied the
healthcheck path, timeout, replica count and builder, and would have stopped being read on
2026-12-01 — at which point each silently fell back to an unset service value. The healthcheck was
the dangerous one, because unset means deploys stop being checked at all, in the direction that
always looks healthy. Set these on the service and assert them with the drift checker.

---

## The `.claude/` toolkit

`.claude/agents/` holds five project-tuned agents — `deploy-investigator`, `release-verifier`,
`web-accessibility-reviewer`, `migration-rehearser`, `doc-drift-auditor` — that shadow the
`mistershack` marketplace plugin versions. **Port all five and re-tune them**: they name Railway,
`waypoint.myze.ca` and Waypoint's own history, and an agent confidently reciting the wrong project's
deployment story is worse than a generic one.

`.claude/skills/orchestrate/SKILL.md` is explicitly non-portable by its own admission — its value is
knowing *this* project's agents, gates and history. Rewrite it for Wayleaf rather than copying it.
Two of its rules survive rewriting unchanged, though:

- **A plugin that is written is not a plugin that is installed.** Waypoint's routing table pointed
  at five agents nobody could reach for days because a plugin gained agents without a version bump.
- **Never delegate a decision.** Agents report; the lead decides; David vetoes.

`.claude/skills/plan-review/` is portable and should be run against PLAN.md before Phase 0 starts.

---

## The lessons that are not attached to any file

Waypoint's `CLAUDE.md` records these; they cost real time and they are not in the code.

- **Do not disable a control in response to activating it.** Disabling the element holding focus
  drops focus to `<body>`. This bit twice — form submits, then the Nearby chips — and **a jsdom test
  asserted focus stayed and passed**, because jsdom does not blur on disable. Use `aria-disabled`
  plus a refusing handler.
- **A live region that is `display: none` until it has content is never announced.** It enters the
  accessibility tree in the same commit as its first message. It works from the *second* message on,
  so it looks fine to anyone testing by triggering it twice. Mount it empty from first render. And
  `aria-busy` suppresses exactly the "working on it" message a slow call needs.
- **`role="status"` is a page-wide namespace and is implicitly atomic.** Adding one live region
  broke two specs that located `[role="status"]` document-wide. Scope the selector, and park nothing
  inside a status region that you do not want re-recited on every update.
- **A whole-card link has room for exactly one link.** An anchor inside an anchor is invalid HTML
  and browsers disagree about tab order. Stretch the title's hit area with a pseudo-element and put
  sibling actions above it with `z-index`. Assert `container.querySelector('a a')` is null.
- **A visually-hidden suffix does not reliably add a space** — name computation collapses it. Use
  `aria-label` for the whole phrase.
- **A colour token that passes a contrast gate can still fail as a state indicator.** Waypoint's
  selected-card wash measured 1.00:1 against its surface in dark mode — identical relative
  luminance. It had been tuned to carry text at 4.5:1, which is a different job.
- **`registerType: 'autoUpdate'` auto-updates the worker, not the page.** An installed PWA can sit
  on a week-old build for days. Reload on `controllerchange`, guarded so a first visit does not
  reload, and show a build stamp somewhere — the first time this happened it took a minified bundle
  diff to establish that the fix had actually deployed.
- **A mark means what people read it as, not what it is derived from.** Waypoint's amber triangle
  was how an aeronautical chart draws a waypoint, and it read as a hazard sign on a home screen.
