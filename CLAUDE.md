# Waypoint — project guide

Personal/family travel agent: flights, lodging, and activities merged into one timeline per trip,
with reminders. **Start at ROADMAP.md** — it holds what is left, in what order, and the greenlight
gate that backups are scheduled to. The specs behind it: **PLAN.md** (V1, phases 0–5, shipped),
**PLAN-V2.md** (Terraform and Playwright — reviewed 2026-08-17, step 6.3 shipped), **PLAN-V3.md**
(place and suggestions — phases 8, 11 and 12 shipped). Read the relevant one before implementing
anything.

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

**All phases (0–5) are done**, with one stated exception: Phase 1’s acceptance criterion includes a
Litestream restore drill, and backups are deliberately deferred until the greenlight (ROADMAP.md §1).
PLAN.md §11 says so under Phase 1; this line used to say it without the caveat. 236 tests,
typecheck and lint clean — 198 under vitest across the three workspaces plus 38 in `infra/` under
`node --test`, which a vitest-only count misses. Plus 31 Playwright specs, which are not in
`npm test` and are run separately.

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
  **The Start Command that overrode the image's `ENTRYPOINT` was cleared on 2026-08-24**, so
  `entrypoint.sh` now runs and Litestream *can* start — nothing is replicating yet, because no
  bucket is set, but the mechanism is no longer broken. It had been overridden for nine days and
  43 deployments. The crash that justified leaving it alone was the missing `RESEND_API_KEY`,
  misattributed; the deploy history holds exactly two failures ever, both before that key was set.
  **`npm run check-drift` asserts this** and turns it into a failure the moment
  `LITESTREAM_BUCKET` is set (DEPLOY.md §8a).
- **Registration is open.** The app is publicly reachable, so anyone with the URL can create an
  account and consume the Resend quota. There is no invite gate.

**`railway.json` is gone, and nothing rests on it.** Deleted 2026-08-24. It had supplied the
healthcheck path, the healthcheck timeout, the replica count and the Dockerfile builder, and it
would have stopped being read on 2026-12-01 — at which point each fell back to the service's own
value, all of them unset. The healthcheck was the dangerous one: unset means deploys stop being
checked at all, silently, in the direction that always looks healthy.

**The fix was the dashboard, not `.railway/railway.ts` (DEPLOY.md §8b).** Railway IaC is a
declarative plan/apply system over the whole project — structurally what Phase 6 was closed to
avoid — and `railway config migrate` generated a file that named the wrong project, **omitted the
volume** from its `resources`, dropped the restart policy silently and could only emit the builder
as a comment. `railway config apply` carries `--confirm-destructive`, and the volume is the only
copy of every account and trip.

Two things worth keeping from doing it. **Config as Code locks the dashboard fields it owns**, so
the values could not be set there while the file existed and the file could not safely go until
they were — a real deadlock, broken with `serviceInstanceUpdate`, which writes the service's values
*underneath* the file. That was a no-op for behaviour (every value was identical to what the file
already supplied) and it did not even trigger a redeploy. And **`builder` was never the field
selecting the Dockerfile**: the enum is `HEROKU | NIXPACKS | PAKETO | RAILPACK` with no `DOCKERFILE`
member, so `dockerfilePath` is what pins it. `builder` still reads `RAILPACK` and does not matter.

**The drift check grew to seven rules on 2026-08-24**, when Phase 6 was closed and it became the
thing that covers the dashboard instead of Terraform. It now also asserts the healthcheck path, the
builder and the restart policy — all read from data it was *already fetching*, because a GraphQL
field that does not exist fails the whole request and exits `2`, turning a working checker into a
silent one. `latestDeployment.meta` carries the whole of `railway.json`, and
`serviceInstance.healthcheckPath` was in the query and simply unread. The sharpest of the new rules:
a healthcheck pointed anywhere but `/health` is **worse than none**, because the SPA fallback
answers every unmatched GET with `index.html`, so it returns 200 and passes forever while the API
behind it is dead. `infra/README.md` §"Adding a rule" records the method and the two rules still
missing (App Sleeping, and region).

**The Railway drift check shipped 2026-08-17**, from PLAN-V2 §4 step 3 — built first and alone,
because Terraform cannot own the volume mount path, the Start Command or the Watch Paths (PLAN-V2
§2a), which are the three settings on this deployment that have actually gone wrong. `infra/` holds
no Terraform and the README says why. The rules are pure functions tested against fixtures with no
network; `2` means *could not check* and is never reported as clean, because a checker that says
"OK" about something it never looked at is worse than none. **It has not yet been run against
Railway with a real token** — the queries validate against the live schema, but the response shapes
do not, so the first real run is still the one that proves it.

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

**Phase 8 (directions hand-off) shipped 2026-08-17**, from PLAN-V3 §2 step 1. Lodging and
activities with an address get a Directions action that opens the device's own map app — Apple Maps,
`geo:` on Android, Google Maps on the web. No embedded map, no API key, no tile provider, nothing
added to the bundle. Verified in the browser drive's **offline** screenshot, which is the case that
matters: a URL needs no network to exist, so the hand-off survives exactly where an embedded map
would have shown a grey box.

Segments get nothing on purpose — an IATA code is not an address and a station's city is not the
station. `TimelineItem` gained a structured `address` rather than the action reading `subtitle`.

**Phase 7 (Playwright) shipped 2026-08-24**, from PLAN-V2 §5. All five steps: the harness, the auth
fixture, every step-3 journey, the accessibility layer and CI — **31 specs, green three runs
running**. The journeys and what each is for are in ROADMAP.md §2.

Two things worth carrying forward from writing the journeys:

- **Assert the stored instant, not the rendered text.** The UTC instant is derived from local
  wall-clock plus a zone and is never displayed, so a timeline that reads perfectly and a database
  an hour out are indistinguishable on screen — until someone travels. The entity specs read the
  row back out of the suite's database. And the zones have to differ: the flight spec runs four
  distinct ones, because a Lisbon-to-London pair would have passed while proving nothing, those two
  never differing.
- **The offline spec covers the cache, not the service worker.** The worker is disabled in dev, so
  a reload offline has no shell to load and fails before any application code runs. Client-side
  navigation exercises the IndexedDB read-through cache, which is where the itinerary lives; the
  worker's own behaviour needs the production build. `drive.mjs` splits it the same way. A spec
  that quietly proves less than its name claims is worse than one that says so.

Three things the harness found or forced, none of which a unit test could have:

- **The plan's auth fixture could not be built as written.** It asked for one that "completes
  verification by reading the token straight from the test database". `auth_tokens` stores only the
  SHA-256, deliberately, so there is nothing to read. The fixture mints a token and writes the hash
  the server will look for, which exercises the real `/verify` route without a mailbox, a log
  scrape, or a test-only hole in production code.
- **A Playwright config is a module, and workers re-import it.** `mkdtempSync` at module scope ran
  once per process, so the fixtures opened a different, unmigrated database from the one the API was
  started against. It reads as `no such table: users` — a broken migration, not two files. The path
  is published through the environment now and read in exactly one place.
- **The suite must not use the dev ports.** The first run collided with dev servers that had been up
  for eight days, the second with two more Vite instances walking up from 5173. Worse than failing
  would have been succeeding: a suite that reuses a running server drives whatever database that
  server was started with. Nothing is reused, and `API_PROXY_TARGET` lets Vite point at the
  suite's own API.

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
- **The zone-is-not-a-place fix stopped half way.** Flights got `startPlace`/`endPlace` from the
  airport table; lodging and activities were left sending `null` "because the user chose the zone by
  hand, so showing it back is faithful". It is not: `America/Toronto` is the *correct* zone for
  Montreal, so a Montreal dinner was badged "Toronto" while the same card's subtitle said Montreal —
  one row naming two cities (reported 2026-08-25). Both now read the city out of the address, via
  `cityFromAddress` over the city index already in the airport table. **It resolves a name, never a
  zone**, which is the entire safety argument: three Portlands sit in three timezones so deriving a
  zone from free text would be a guess, while echoing the spelling back is not. Diacritics are
  folded — the table is anglicised and the people who live in Montréal are not.
- **An IATA code and a station name are not one namespace.** The conflict rule compared
  `destination` against `origin` as strings, and Phase 12 had made those a code for air and a
  station *name* for rail — so a flight into `YOW` followed by a train out of `Ottawa` reported a
  change of city that was not one. Reported 2026-08-25 from a real Winnipeg–Ottawa–Montreal
  itinerary, where it fired at *both* ends of the return trip, which is why it looked like two bugs
  and was one. Air-to-air still compares codes, and must — `LHR` and `LGW` are both "London" and
  telling them apart is the rule's whole purpose. Everything else compares `endPlace`/`startPlace`,
  the airport's own city for a flight and the station name as written for a train, which is the one
  form the two modes can meet in. The false alert was also *masking* a real one: it hit `continue`
  before the tight-connection check, so an airport-to-station transfer with 30 minutes in it said
  nothing.
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
- **A whole-card link has room for exactly one link.** The timeline card was a single `<Link>`
  wrapping everything, so Phase 8's Directions action would have been an anchor inside an anchor —
  invalid HTML, and tab order and activation differ by browser. The title carries the link now and
  stretches its hit area across the card with a pseudo-element; Directions sits above it with
  `z-index`. Two sibling links, one card, and `expect(container.querySelector('a a')).toBeNull()`
  so it stays that way. Any future per-row action lands in the same place.
- **A visually-hidden suffix does not reliably add a space.** `Directions<span
  class="visually-hidden"> to {title}</span>` computes as "Directionsto Hotel Lutetia" — name
  computation collapses the leading space. Use `aria-label` for the whole phrase and keep the
  visible word inside it, which is what WCAG 2.5.3 asks anyway.
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

**This table is the owner of the gates.** `.claude/skills/orchestrate/SKILL.md` routes work to the
team and links here rather than restating it; a gate written down twice drifts.

| Trigger | Run |
|---|---|
| Any change at all | `npm run typecheck`, `npm run lint`, `npm test` from the root |
| Any change to the client, the API, or a user-facing flow | `npm run test:e2e --workspace @travel/app` |
| Any UI change, and before showing the app to anyone | `web-accessibility-reviewer` agent |
| Wanting to see the app rather than its test output | `node app/e2e/drive.mjs` (see its header) |

The e2e suite runs a real browser against both servers on its own ports (8799/5199, clear of the
dev defaults), with a throwaway SQLite file per run. It needs no mail credential: verification
tokens are minted against the test database, because they are SHA-256 hashed at rest and cannot be
read back.
| Touching the Railway dashboard, and before turning backups on | `npm run check-drift` (DEPLOY.md §8a) |
| Any migration that touches existing rows, before it deploys | `migration-rehearser` agent |
| After a push reaches production | `release-verifier` agent |
| A deploy that failed, or behaves in a way the repo does not explain | `deploy-investigator` agent |

The first two exist because the unit suites were green and the app was still wrong: a browser drive
found six defects in one pass, including new events defaulting to the browser's timezone instead of
the trip's. The third exists because the suites cannot see the deployment at all — the volume mount
path, the Start Command and the Watch Paths are dashboard state, they are the three settings that
have really gone wrong here, and Terraform cannot own any of them (PLAN-V2 §2a). Tests prove the
code does what it says; they cannot tell you the app is wrong, and they cannot tell you the volume
is mounted somewhere that throws every trip away on the next deploy. Commit once per phase with
a clear message. Phase 1 additionally is **not** done until a Litestream restore has actually been
rehearsed — configured is not the same as working (DEPLOY.md §4).
