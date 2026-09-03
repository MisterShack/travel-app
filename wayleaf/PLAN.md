# Wayleaf — Plan V1: from a camera roll to a printed book

> **Read BUSINESS-PLAN.md first.** It owns the strategy, the pricing and the unit economics. This
> document owns the build: what gets made, in what order, what each phase has to prove before it is
> called done, and which of the business plan's assumptions the code is allowed to lean on.
>
> Written 2026-09-03, against BUSINESS-PLAN v0.3.

---

## 1. What this plan disagrees with, up front

Three places where the build should not follow the business plan literally. Each is a
recommendation for David, not a decision already taken.

### 1a. Both entry paths in v1 is the wrong first month

BUSINESS-PLAN §4 says build Path A (planned trip) and Path B (retroactive trip) in v1. Agreed, for
v1. **Not agreed for the first release**, because of the date.

§9 says the ordering flow must ship **no later than early October** or a full gifting season is
lost. Today is 2026-09-03. That is roughly four weeks, for two people, and the critical path to a
printed book is:

```
photos in → EXIF out → cluster → select and dedupe → lay out → PDF to a printer's spec → order → ship
```

**Email ingestion is not on that path.** It is the thing that makes Path A work, it is genuinely
the highest-ROI use of AI (§5.1), and Wayleaf gets it nearly free because Waypoint already proved
it end to end against a real airline confirmation and a real Via Rail one. All of which is an
argument for porting it *confidently*, and none of which is an argument for porting it *first*.

Path B needs no ingestion at all. A user picks a date range and a destination, dumps a camera roll
in, and we infer the skeleton from EXIF. §4 already says Path B is "faster to value and likely
converts better, because the user arrives already wanting the book," and §10.6 says the retroactive
angle "works year-round rather than only in season."

**Recommendation: the closed beta ships Path B only.** Path A lands in Phase 5, after the book
works. This is not a reduction in scope, it is a reordering of it, and it buys back the four weeks
that the October deadline does not have.

**What it costs, stated because it should be decided with this on the table:** the beta then proves
nothing about ingestion accuracy, which §5 calls "the single most damaging bug in the product." The
mitigation is that Waypoint's ingestion is already proven against real mail, and Phase 5's
acceptance criterion re-proves it here rather than assuming the port was clean.

### 1b. "Migrate SQLite → Postgres while it's still cheap" is already free

BUSINESS-PLAN §14.4 reads as an urgent, decaying opportunity. It is not one, because Wayleaf is a
new repository with no rows in it. There is no migration — there is a schema authored on Postgres
from the first line, and Waypoint's SQLite database is never read.

This matters mainly because it removes a phase people would otherwise budget for, and because it
frees the schema from Waypoint's shape. Several tables should *not* be reproduced (see PORTING.md).

### 1c. The database is not the only irreplaceable thing

§6 is right that losing the database means losing someone's honeymoon, and it prescribes `pg_dump`
to R2 with a tested restore. Correct, and incomplete: after Phase 1 the database holds *rows about*
photos, and R2 holds the photos. A perfect database restore against a bucket that has been
lifecycle-expired, region-lost, or wrongly reconciled is still a lost honeymoon.

**So the restore drill restores both, together, and checks that every row still resolves to an
object.** A drill that only proves Postgres came back proves the cheaper half.

---

## 2. Non-negotiables, with reasons

These are the rules the whole build is held to. CLAUDE.md states them in short; this is why.

### 2a. Backups from the first row, and the restore is what is tested

Waypoint deferred backups by an explicit, recorded decision, and that decision was right *there*:
the app was personal, the worst case was David re-entering his own trips, and writing the deferral
down was worth more than doing the work.

**None of that transfers.** From the first beta household onward, the worst case is destroying
something the user cannot recreate at any price. A photo of a person's honeymoon is not
re-obtainable, and neither the money nor the apology exists that fixes it.

Concretely: nightly `pg_dump` to R2 on our own schedule, independent of whatever Railway offers,
because §6 is right that both vendors can change their pricing and their product. Verify Railway's
current PITR offering before relying on it, and treat it as a bonus rather than the plan. Restore
drills are scheduled and logged, and a drill that has not been run this quarter is a failed gate.

**Also: deletion is a backup problem.** The free tier expires print-resolution originals after 12
months (§7). That is a scheduled, irreversible destruction of user data run by our own code, which
is a far more likely way to lose a honeymoon than a Railway outage. It needs a grace period, a
warning email before it fires, and a dry-run mode that is used every single time before the real
one. Build it in Phase 6, not earlier, and build the dry run first.

### 2b. The timezone triple, ported verbatim

Local wall-clock + IANA zone + derived UTC instant, on every event. Waypoint's
`shared/src/time.ts` implements it on `Intl` with no dependency, handles the DST gap by shifting
forward and the DST ambiguity by choosing the earlier occurrence, and is tested. Take it as-is.

Never store a local datetime alone. A flight departs in one zone and lands in another; a trip
crosses zones mid-way; and DST rules change between booking and travel, which is why the local time
is the source of truth and the instant is derived rather than the other way round.

### 2c. The itinerary is the timezone oracle for photos

This is the technical statement of the business plan's unfair advantage, and it is the single most
important paragraph in this document.

**EXIF `DateTimeOriginal` is a naive local datetime.** It carries no zone. `OffsetTimeOriginal`
exists in the spec and is written by recent iPhones, but is absent on a great many files — older
cameras, most Android devices historically, anything that has been through a messaging app, and
every screenshot. So the common case is: a photo says `2026-07-14 14:03:22` and nothing else.

To place that photo on a timeline you must know what zone the camera was in. Three sources, in
order of trust:

1. **`OffsetTimeOriginal`**, where present. Believe it.
2. **The itinerary.** If the trip says the traveller was in `Europe/Rome` from Sunday 18:40 to
   Friday 09:15, then a naive `14:03` on Tuesday is `Europe/Rome` at 14:03. This is the oracle, and
   it is exactly what a photo-book company without a trip planner cannot do.
3. **The geotag**, where present, resolved to a zone by coordinates. Reliable, but a minority of
   photos have one.

Where none of the three answers, **ask, and remember the answer for the trip** — do not guess. A
silently wrong zone reorders a day and captions the wrong meal, which looks like the product being
stupid rather than the data being thin.

**Path B has no oracle.** A retroactive trip has no itinerary until we have inferred one, and the
inference depends on the zone. The loop is broken by starting from geotagged photos: resolve zones
from the coordinates that exist, use those to anchor the naive timestamps around them, and where a
whole trip has no geotags at all, take the zone from the destination the user typed at trip
creation. **This asymmetry between the two paths is real and it is the hardest part of Phase 1.**
It is understated in the business plan, which describes Path B as reusing "the same clustering
machinery" — the clustering machinery is the same, the zone resolution is not.

### 2d. Media in R2; the database holds rows about media

Waypoint put pass bytes *in* SQLite, deliberately and correctly, because Litestream replicates the
database and nothing else on the disk — a file written beside it would have been the one thing in
the app with no backup path.

That reasoning is void here, and the opposite reasoning arrives: at ~1.6 GB of originals per trip
(§8), photos in Postgres make every `pg_dump` unusable, every restore a multi-hour outage, and
every backup an expensive one. R2 is the store, at $0.015/GB-month with **zero egress at any
volume**, which for a photo-serving product is the entire difference between a viable bill and an
unviable one.

Two things carry from the passes work regardless:

- **Sniff the bytes; never believe the uploader's `Content-Type`.** An image must prove it is an
  image.
- **The danger is serving a file back, not accepting one.** Anything rendered from our own origin
  is script holding the reader's session. Derivatives are served from R2 through presigned,
  short-lived, single-purpose URLs on a domain that holds no session cookie — never proxied through
  the API origin, which would put the money saved on egress straight back onto the Railway bill and
  reintroduce the risk at the same time.

**Uploads go client → R2 directly, with presigned PUTs minted in batch by the API.** Four hundred
photos through the API process is four hundred chances to fall over on a Railway container, and it
is also the "route media through Railway" mistake that §8 identifies as the difference between a
$40 bill and a $600 one.

### 2e. Collaborators never hit a paywall

Enforced in the membership module. A trip has an owner and members; every member may upload, view
and download the trip's photos at display resolution, forever, without an account tier being
consulted. What the tier gates is **originals retention** and the **owner's** book credit and AI
features — never participation.

The check that must not exist is "is this user's plan sufficient to add a photo to a trip". Write
the membership module so that check has nowhere to go.

### 2f. EXIF out, not in

Keep every byte of EXIF on ingest — it is the clustering input. Strip location and device metadata
from anything leaving the system: share links, exported albums, downloadable derivatives. Default
on, stated in the UI, and a per-trip override at most. §12 lists it as a Medium risk mitigation; it
is also a genuinely good line in a marketing page.

### 2g. Fulfilment behind an interface, and a second vendor before launch

Shaped exactly like Waypoint's `Mailer`: an interface, a console implementation that writes the
order to the terminal, a memory implementation for tests, and Prodigi behind it in production.

§12 asks for the abstraction "from day one" and a second vendor kept integrated. Do both. The
argument is not vendor risk in the abstract — it is that "order samples from three vendors before
choosing; print quality is the product" is a High-severity mitigation, and a codebase that can only
talk to one printer cannot act on what those samples show.

### 2h. Orders are idempotent, and their states are explicit

`draft → submitted → paid → sent_to_printer → in_production → shipped → delivered`, plus
`cancelled` and `refunded`. Every transition carries an idempotency key. Stripe webhooks arrive out
of order and more than once; Prodigi's will too. A retry must never print a second book, and a
duplicated webhook must never charge a second time.

Test this by replaying every webhook twice, out of order, in the suite — not by hoping.

### 2i. A resolution floor on every placement

Before an order is accepted, every image placement is checked against the printer's DPI minimum for
its physical size on the page. Below it: refuse, or warn explicitly and record that the user chose
to proceed. A cropped 12MP phone photo blown across a 8×8 spread can fall under the floor, and the
first anyone hears of it is a complaint about a book that has already been paid for and shipped.

### 2j. Book attach rate is instrumented before anything else

An events table exists in Phase 0, before there is anything to record. §8 says the business lives or
dies on book attach rate and §14.7 says instrument it first. That is only possible if the event
stream predates the funnel it measures — analytics retrofitted after launch cannot answer questions
about the launch.

Minimum event set from the start: trip created (with path A/B), collaborator invited, invite
accepted, photos uploaded (count), album generated, album edited, book previewed, order started,
order paid. Attach rate is `order paid / trip with photos`, and every denominator is in that list.

---

## 3. Data model — the shape, not the DDL

Ported from Waypoint where the shape survives; new where it does not. PORTING.md says which is
which per table.

**Carried across, largely as-is:** `users`, `sessions`, `auth_tokens`, `trips`, `trip_members`.
`segments`, `lodging` and `activities` carry too, and they are what Path A fills — but in Wayleaf
they are also the zone oracle of §2c, which is a second job they did not have before.

**New, and the substance of this product:**

- **`photos`** — one row per uploaded file. Holds the R2 keys (original, display, thumb), the
  sniffed content type, byte size, a perceptual hash for dedupe, the *naive* EXIF local datetime
  as written by the camera, the resolved zone **and how it was resolved** (offset / itinerary /
  geotag / user / destination-default), the derived instant, lat/lng where present, pixel
  dimensions, and the uploader. **Storing how the zone was resolved is not bookkeeping** — it is
  what lets the UI say "we think this was Rome" with the right amount of confidence, and what lets
  a later itinerary correct an earlier guess.
- **`photo_clusters`** — a group of photos the system believes belong together: a moment, an
  activity, a day. Carries its own time bounds and centroid, an optional link to the itinerary
  entity it matched, and a `selected_photo_id` for the best-of-cluster pick. Rebuildable from
  `photos` by a pure function, and rebuilt whenever the itinerary changes.
- **`albums`** and **`album_pages`** — the editable digital album. The generated version and the
  user's edits must be distinguishable, so a regeneration after adding fifty more photos does not
  silently discard an hour of someone's layout work.
- **`orders`**, **`order_items`**, **`order_events`** — §2h's state machine and its audit trail.
- **`events`** — §2j's analytics stream.

**Deliberately not carried:** `push_subscriptions` in its web-push form (mobile push is APNs/FCM
through Expo, a different shape), and `passes` as a table storing bytes (§2d). Passes as a *feature*
is worth having later; passes as a `blob` column is not.

**Clustering lives in `shared/`, as a pure function.** Same argument that put Waypoint's conflict
detection there: it runs on the client, so it works offline, it costs nothing per use, and it is
testable without a network. It is also then the same code on mobile, web and server, which matters
because a cluster the phone shows and a cluster the book uses must be the same cluster.

---

## 4. Phases

Each phase names an acceptance criterion. The criterion is what makes the phase done — not the test
suite, which is assumed.

### Phase 0 — Foundation

Repository, workspaces, CI. Postgres on Railway with Drizzle (`drizzle-orm/node-postgres`), the
auth stack ported (argon2, hashed session tokens, hashed single-use tokens, Resend `Mailer`), R2
wired with presigned direct uploads, the `events` table, and the backup pipeline: nightly
`pg_dump` to R2 plus the restore script.

**Two things here are easy to get wrong and are called out because they were found by reading
Waypoint's code rather than by imagining this one:**

- **Mobile cannot use Waypoint's cookie session.** `originGuard` rejects state-changing requests
  from unrecognised origins and reasons explicitly about browsers and ambient cookies; a native
  client has neither. Sessions need a second presentation — a bearer token in the device's secure
  storage — resolving to the same hashed-token row. The storage model ports; the transport does
  not, and `originGuard` must be scoped to the browser surface rather than applied globally.
- **`@node-rs/argon2` is a native binary**, and npm/cli#4828 is live. Declare the Linux pair in
  `optionalDependencies` with the `os` field, exactly as Waypoint does, or the Docker build ships
  a macOS binding and fails at boot with a message about something else.

**Acceptance:** a user registers, verifies by email, and uploads a photo from the web client that
lands in R2 as an object the API never touched. Then the database is destroyed and restored from
last night's dump, **and that photo still resolves** — §1c's both-halves drill, run for the first
time on the smallest possible dataset, which is the only comfortable time to run it.

### Phase 1 — Trips and photos, Path B

Trip creation from a date range and a destination. Household invite and shared trips (ported).
Bulk photo upload. EXIF extraction, zone resolution per §2c with its provenance recorded, and
clustering by time and location into a day-by-day skeleton.

**HEIC is a real problem the business plan does not mention.** iPhones shoot HEIC by default. No
browser displays it, and `sharp` needs libheif to read it. Every display derivative therefore
requires a transcode, on a container, at upload volume. Decide in this phase whether that happens
on the device before upload (cheap for us, slower for the user, and the client already has the
decoder) or server-side (predictable, and the cost lands on us). **Recommendation: on device.** The
phone decodes HEIC natively and for free; a Railway container does not.

**Acceptance:** four hundred real photos from a real past trip — David's, with the itinerary
withheld — cluster into a day-by-day skeleton that David agrees with on inspection. Synthetic EXIF
fixtures do not count for this; they cannot contain the screenshots, the messaging-app copies with
their metadata stripped, and the photo taken at 01:30 that belongs to the previous day.

### Phase 2 — The digital album

Deduplicate near-identical shots. Select the best of each cluster on sharpness, faces, exposure and
composition. Caption from the itinerary — "Tuesday — Colosseum" — not from a generic vision model,
which is the whole point of §5.2. Chapter breaks per day or per city. Cover shot detection. Then
make all of it editable, with generated and edited state distinguishable per §3.

**Acceptance:** from the Phase 1 trip, an album a human approves in **ten minutes or less**. §5 sets
that bar itself ("four hours of layout work to ten minutes of approval"), and it is measurable.
Time it with a stopwatch on someone who is not the author.

### Phase 3 — The book, and fulfilment — **the October gate**

PDF generation to Prodigi's real specification: page size, bleed, colour profile, spine. The DPI
gate of §2i. The `FulfilmentProvider` interface with Prodigi behind it and a second vendor
integrated. Stripe checkout — 0% Apple commission, physical goods (§7). The order state machine of
§2h.

**Acceptance:** a real printed book, of a real trip, in David's hands, ordered through the app.
Not a PDF that opens. Not a sandbox order. The object.

### Phase 4 — Mobile (Expo, iOS)

Camera roll access without demanding full-library permission — §12 is right that refusal is a
Medium risk and that manual selection must be genuinely pleasant rather than a punishment. Bulk
background upload that survives the app being backgrounded, which is the specific thing §6 says
Capacitor cannot do and is the reason for the whole stack choice. Push notifications.

**Acceptance:** four hundred photos upload over hotel-grade wifi with the app backgrounded and the
screen locked, and **none are lost**. Then the same run with airplane mode toggled twice in the
middle, and still none are lost.

### Phase 5 — Ingestion, Path A

Port Waypoint's inbound pipeline: unique per-user forwarding address, Svix-verified webhook, the
recipient / verified-sender / daily-cap gates, heuristics first claiming only on two independent
signals, Gemini as the fallback, and everything landing as `needs_review` until a human confirms it.

**Two lessons come with it and must not be re-learned.** Most short uppercase words are IATA airport
codes — `ADD`, `SEE`, `EAT`, `THE`, `SAT`, `HST` are all in the table — so a route must be read as a
pair the email itself joined, never as the first two recognised codes in document order. And an
import is untrusted input: the inbound address is reachable by anyone and `From:` is forgeable.

**Acceptance:** a real forwarded confirmation becomes an itinerary, **and** the photos from that
same trip re-cluster against the itinerary's zones rather than their previously guessed ones — with
the provenance column in `photos` showing the change. That second half is the one that proves §2c
actually works, and it is invisible if you only test the import.

### Phase 6 — Household tier and storage tiering

The $39/yr subscription (15% under Apple's Small Business Program — assume it, treat better as
upside). R2 lifecycle rules moving originals older than 12 months to Infrequent Access. The free
tier's originals expiry, built dry-run-first per §2a, with a warning email and a grace period.

**Acceptance:** the expiry job runs in dry-run against real beta data and its output is read line by
line by a human before the real one is ever enabled.

### Phase 7 — v1.5

In-trip suggestions (§5.4 — cheap model plus a places API; do not over-invest). Preference memory,
explicit and editable, never inferred from photos (§5.3). Calendar write-out. Additional print SKUs
per §9 Phase 2: magnets, postcards, the $25 softcover mini book.

---

## 5. Open questions

Things this plan cannot settle, listed so they are not mistaken for oversights.

1. **Every number in BUSINESS-PLAN §8 is a guess until a Prodigi account exists.** Print cost,
   shipping and the 46% contribution margin all move together. This blocks pricing, not building.
2. **What DPI floor, what colour profile, what bleed** — Phase 3 cannot start without Prodigi's real
   specification. It is the first thing to ask for after the rate card.
3. **HEIC transcode, device or server** — recommended on device in Phase 1, but it needs measuring
   against a real 400-photo upload before it is settled.
4. **How long may a grounded Maps result be cached** — inherited unanswered from Waypoint, and it
   gates Phase 7's suggestions the same way it gated Waypoint's. The API docs carry no retention
   statement at all; the silence is confirmed rather than assumed.
5. **Whether the closed beta is Path B only** — §1a's recommendation, David's call.
6. **Railway's current PITR offering** — verify before relying on it. §6 flags Supabase as
   historically stronger here, and the answer changes only how much our own pipeline has to carry,
   never whether it exists.
