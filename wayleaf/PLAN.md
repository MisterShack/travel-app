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

### 1a. Both entry paths belong in v1 — the question is only which comes first

**This section previously argued the opposite, on schedule grounds, and the schedule is gone.**
BUSINESS-PLAN §9 said the ordering flow had to ship by early October or lose a gifting season; on
2026-09-03 David killed that deadline. People travel year-round, the retroactive angle works
year-round, and the priority is a product that is stable rather than one that is early.

So the argument that produced "Path B only" no longer holds, and it is worth being precise about
*why* it was weak even before the date went, because the reasoning generalises.

**The de-scope cut the cheap work and kept the expensive work.** This document claimed the email
ingestion port was "nearly free" because Waypoint proved it end to end, and eleven lines later
claimed that cutting it bought back four weeks. Both cannot be true. `server/src/import/` is 1,044
lines with its tests already written — two or three days. Meanwhile Path B keeps the hardest
unsolved problem in the product, which §2c names itself: a retroactive trip has no timezone oracle.
**As a schedule lever it was close to worthless; it was a product decision wearing a schedule
argument.**

It was also quietly refuting the positioning. BUSINESS-PLAN §2 rests on "a photo book company
cannot copy this without building a trip planner first" — and Path B *is* that company. Shipping
only Path B would have meant the beta measured a product the strategy says has no moat, while the
half that supplies the moat sat unbuilt.

**So: build both. Sequence Path B first, for product reasons that stand on their own** — it is
faster to value, the user arrives already wanting the book (§4), and "turn last summer's photos
into a book" acquires people who have never wanted a trip planner (§10.6). Path A follows closely
rather than being deferred behind the book.

**And there is an ordering argument for pulling ingestion earlier than Phase 5**, which §5 records
as an open decision rather than settling here: Phase 5's acceptance criterion — photos re-clustering
against an itinerary's zones instead of their guessed ones — is the only test that actually proves
§2c, the central technical claim of the product. Building the album on clusters that a later import
will re-derive means either building the edit-preservation machinery twice or discovering the
conflict late. Doing ingestion before the album means the album is built once, against final
clusters.

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

### 2c. The itinerary is the timezone oracle — and the camera's clock is a separate unknown

This is the technical statement of the business plan's unfair advantage, and it is the single most
important section in this document. It is also the one most easily got wrong, because it contains
**two questions that look like one**.

**EXIF `DateTimeOriginal` is a naive local datetime.** It carries no zone. `OffsetTimeOriginal`
exists in the spec and is written by recent iPhones, but is absent on a great many files — older
cameras, most Android devices historically, anything that has been through a messaging app, and
every screenshot. So the common case is: a photo says `2026-07-14 14:03:22` and nothing else.

The trap is to answer "where was the traveller?" and think you have answered "what time was it?"
**You have not.** `DateTimeOriginal` is written from the *device's clock*, which is set to whatever
zone that device believed it was in — and that is not necessarily the zone it was standing in.

> A DSLR still set to `America/Toronto`, photographing the Colosseum at 14:00 Rome time, stamps
> `08:00`. Resolve that against the itinerary's `Europe/Rome` and you get an instant **six hours**
> from the truth: wrong day boundary, wrong activity, wrong caption. The photo lands in the
> previous evening.

Phones auto-update on landing, but not instantly and not always — so the arrivals-hall photos, the
first of every trip, are exactly the ambiguous ones. And BUSINESS-PLAN §3 says photos are
"scattered across 3–5 phones," which means **a trip is a set of devices with independent, unknown
clock offsets**. The mixed-device case is the normal case, not an edge case.

So resolution is two steps, in this order.

**Step one — what was this device's clock set to?** Per device, per trip:

1. **`OffsetTimeOriginal`**, where present. Believe it; the device wrote its own offset.
2. **Anchor on that device's geotagged photos.** A geotag gives the true zone at that moment via
   coordinates, and therefore the true offset; the difference against what the device stamped *is*
   the device's error. Propagate it to that device's ungeotagged photos.
3. **Ask, once per device per trip**, where a device has no geotags and no offset at all — "was
   this camera set to local time?" is a question a human answers in one tap and a heuristic
   answers wrongly.

**Step two — where was the traveller?** Now the itinerary earns its keep. If the trip says the
traveller was in `Europe/Rome` from Sunday 18:40 to Friday 09:15, a corrected `14:03` on Tuesday is
`Europe/Rome` at 14:03. **This is the oracle, and it is exactly what a photo-book company without a
trip planner cannot do.**

Note what step two actually requires, because the plan should not pretend it is a lookup: the
itinerary holds *events*, not continuous presence. A flight arriving Sunday 18:40 and another
departing Friday 09:15 imply Rome in between by **interpolation**, not by record. Building that
interval set — zone spans derived from ordered events, with the gaps filled and the boundaries at
the segments that cross them — is a real function to write and test, and it belongs in `shared/`
beside the clustering.

Where neither step answers, **ask, and remember the answer** — do not guess. A silently wrong zone
reorders a day and captions the wrong meal, which looks like the product being stupid rather than
the data being thin.

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
  image. **But see below — this rule does not survive direct-to-R2 upload in its original form.**
- **The danger is serving a file back, not accepting one.** Anything rendered from our own origin
  is script holding the reader's session. Derivatives are served from R2 through presigned,
  short-lived, single-purpose URLs on a domain that holds no session cookie — never proxied through
  the API origin, which would put the money saved on egress straight back onto the Railway bill and
  reintroduce the risk at the same time.

**Uploads go client → R2 directly, with presigned PUTs minted in batch by the API.** Four hundred
photos through the API process is four hundred chances to fall over on a Railway container, and it
is also the "route media through Railway" mistake that §8 identifies as the difference between a
$40 bill and a $600 one.

**Which breaks the sniff rule as Waypoint wrote it, and the break has to be repaired explicitly.**
There, the API received the bytes and could refuse before anything was written. Here the API never
sees them, so by the time anything can be sniffed the object already exists and has already been
billed. Two consequences, both non-negotiable in their own right:

- **A presigned PUT is minted with conditions, never bare.** A size ceiling, a content-type
  prefix, and a short expiry, pinned into the signature. An unconditioned URL is an unbounded
  write capability handed to a client — four hundred of them is four hundred chances to put 5GB of
  anything into our bucket at our cost, and by §2e a *collaborator* holds them too, deliberately
  unchecked against any plan.
- **A photo is `pending_scan` until something has read its bytes.** Sniffing becomes an
  asynchronous step after the PUT completes: fetch the head of the object, verify it is genuinely
  the image type it claims, record dimensions and EXIF, then promote to `ready`. **Nothing serves,
  clusters or prints a photo that has not been promoted**, and an object that fails the check is
  deleted rather than merely flagged — an unreferenced object in a bucket still costs money and
  still has a URL.

The conditions are the cheap half and the state is the load-bearing half. A `pending_scan` state
that everything downstream forgets to filter on is the same as not having one.

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
order paid. Every denominator anyone will want is in that list.

**Attach rate is a cohort measure, not a running ratio, and getting this wrong is worse than not
measuring it.** Books are ordered after the trip, sometimes months after. Computed naively as
`orders paid / trips with photos`, the denominator includes trips that have not yet had time to
convert — so the number is depressed by exactly the rate at which new trips arrive. **It falls
fastest when acquisition is working**, and it will be at its most misleading during the beta and
immediately after any marketing push, which are the two moments it will actually be read.

So: **attach rate is measured over trips whose end date is at least 60 days past**, and it is
always reported with its cohort window named. Sixty days is a starting value chosen to sit beyond
the post-trip emotional peak the business plan builds the whole conversion story on (§7); replace
it with a measured value as soon as there are enough real orders to see the distribution of
trip-end-to-order lag, and report that lag as its own metric in the meantime.

This matters more than a metrics quibble usually does: BUSINESS-PLAN §12 makes "book attach rate
lands below 5%" an *existential* trigger to change pricing models. A number that is wrong in a known
direction, wired to that decision, is worse than one nobody trusts.
### 2k. Mobile is the product; the web explains it

Photos originate on the phone. In-trip use is on the phone. Camera-roll permission is the entire
product, and push notifications exist nowhere else. **So the phone is not a client of this system,
it is the system**, and anything that treats it as one of several equal surfaces will get the
sequencing wrong.

The web does two jobs, and neither is capture:

1. **Explain the product and host the policies.** Who we are, what we do, where to get the app,
   privacy policy, terms. This ships first and is not an app.
2. **Later: signed-in album editing on a large screen.** Genuinely better than a phone for laying
   out a book — the one job where the web wins outright rather than imitating the app.

**The trap this rule exists to prevent:** building a web upload path "just for the beta". It would
be thrown away, it would measure the funnel through a surface the strategy says cannot work, and it
would take the time that should have gone into the background-upload path that is the actual
product. Read any beta plan that runs on a browser as a plan that has not accepted this rule.

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
  as written by the camera, the resolved zone **and how it was resolved** (offset / device-anchor /
  itinerary / geotag / user / destination-default), the derived instant, lat/lng where present,
  pixel dimensions, the uploader, and the **scan state** of §2d — nothing serves, clusters or
  prints a row that is still `pending_scan`. **Storing how the zone was resolved is not
  bookkeeping** — it is what lets the UI say "we think this was Rome" with the right amount of
  confidence, and what lets a later itinerary correct an earlier guess.
- **`devices`** — the camera a photo came off, identified from EXIF `Make` / `Model` /
  `BodySerialNumber`, scoped per trip, carrying the **clock offset** derived in §2c step one and
  how *that* was derived (own-offset / geotag-anchored / asked). Without this table there is
  nowhere to put the answer to "was this camera set to local time", and the correction has to be
  re-derived per photo from evidence that most photos do not carry. It is a small table and it is
  the difference between a six-hour error and none.
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

### Phase 1 — Capture: the phone, trips and photos (Path B)

**This phase is the Expo app, not a browser upload form.** Mobile is first (see §2k), so the
capture surface ships here rather than in a later phase — a web uploader built to carry a beta
would be thrown away, and it would measure the funnel through a surface the strategy says cannot
work.

Trip creation from a date range and a destination. Household invite and shared trips (ported).
Camera roll access **without demanding full-library permission** — BUSINESS-PLAN §12 is right that
refusal is a Medium risk and that manual selection must be genuinely pleasant rather than a
punishment. Bulk background upload that survives the app being backgrounded, which is the specific
thing §6 says Capacitor cannot do and is the entire reason for the stack choice. EXIF extraction,
zone resolution per §2c with its provenance recorded, and clustering by time and location into a
day-by-day skeleton.

**HEIC is a real problem the business plan does not mention.** iPhones shoot HEIC by default. No
browser displays it, and `sharp` needs libheif to read it. Every display derivative therefore
requires a transcode, on a container, at upload volume. Decide in this phase whether that happens
on the device before upload (cheap for us, slower for the user, and the client already has the
decoder) or server-side (predictable, and the cost lands on us). **Recommendation: on device.** The
phone decodes HEIC natively and for free; a Railway container does not.

**Acceptance:** four hundred real photos from a real past trip cluster into a day-by-day skeleton
that the person who took them agrees with. Synthetic EXIF fixtures do not count for this; they
cannot contain the screenshots, the messaging-app copies with their metadata stripped, the photo
taken at 01:30 that belongs to the previous evening, or the second camera whose clock was never
changed.

**Upload is a separate criterion and it is pass/fail:** four hundred photos upload over
hotel-grade wifi with the app backgrounded and the screen locked, and **none are lost**. Then the
same run with airplane mode toggled twice in the middle, and still none are lost.

**And the clustering is judged by someone other than the author, on a camera roll that is not
David's.** David
grading his own trip is not a blind test — he knows where he was, so a near-miss reads as correct
and the failure the criterion exists to catch is the one he is least able to see. Run it twice:
once on David's roll to debug against known ground truth, once on someone else's as the actual
gate, scored as a **countable error rate** (photos placed on the wrong day, clusters split or
merged wrongly) rather than an impression. Write the number down; it is the baseline every later
change to clustering is measured against.

### Phase 2 — The digital album

Deduplicate near-identical shots. Select the best of each cluster on sharpness, faces, exposure and
composition. Caption from the itinerary — "Tuesday — Colosseum" — not from a generic vision model,
which is the whole point of §5.2. Chapter breaks per day or per city. Cover shot detection. Then
make all of it editable, with generated and edited state distinguishable per §3.

**Acceptance:** from the Phase 1 trip, an album a human approves in **ten minutes or less**. §5 sets
that bar itself ("four hours of layout work to ten minutes of approval"), and it is measurable.
Time it with a stopwatch on someone who is not the author.

### Phase 3 — The book, and fulfilment

PDF generation to Prodigi's real specification: page size, bleed, colour profile, spine. The DPI
gate of §2i. The `FulfilmentProvider` interface with Prodigi behind it and a second vendor
integrated. Stripe checkout — 0% Apple commission, physical goods (§7). The order state machine of
§2h.

**Acceptance:** a real printed book, of a real trip, in David's hands, ordered through the app.
Not a PDF that opens. Not a sandbox order. The object.

### Phase 4 — The web surface

Two different things wearing one word, shipping at two different times. Neither is the product.

**4a — `site/`, the public page. Ships during Phase 0–1, not here.** It is listed under Phase 4 so
it has an owner and a specification; its *first pass* is needed far earlier than its number
suggests, because BUSINESS-PLAN §10's launch motion begins "waitlist → 50 hand-held beta
households" and there is nowhere to collect a waitlist without it.

Pass one — who we are, what we do, where to get the app, and a waitlist. Static, fast, no
framework needed, no session, no cookie the app relies on.

Pass two — **the policies, and this one is a hard gate on the iOS submission.** App Store Connect
will not accept a binary without a privacy policy URL, and it rejects on inaccurate privacy labels.
So the sequence is: `privacy-counsel` briefs real counsel → counsel produces the privacy policy and
terms → they go on `site/` → the binary can be submitted → the beta can start. **A lawyer's
turnaround sits inside the critical path**, which is the argument for Gate 0 being a gate rather
than a task.

Also here: App Store nutrition labels declaring every data type and every third party, and the
`NSPhotoLibraryUsageDescription` purpose strings, which are marketing copy read at the worst
possible moment and should be written like it.

**4b — `web/`, signed-in album editing. Later, and genuinely wanted.** A large screen is honestly
better for laying out a book than a phone is, and this is the one job where the web beats the app
rather than imitating it. It needs the bearer/cookie session split of Phase 0 to already be right.
Do not start it until a book has been printed.

**Acceptance for 4a pass one:** a stranger reads the page and can say what the product does and who
it is for. **For pass two:** the iOS binary is accepted by App Store Connect, which is the only
test of it that means anything.

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

Things this plan cannot settle, listed so they are not mistaken for oversights. **These are
questions nobody can answer yet because the information does not exist.** Decisions that are
David's to make — including the ones the plan review surfaced — live in ROADMAP §6, and are not
restated here; a decision written down twice drifts.

1. **Every number in BUSINESS-PLAN §8 is a guess until a Prodigi account exists.** Print cost,
   shipping and the 46% contribution margin all move together. This blocks pricing, not building.
2. **What DPI floor, what colour profile, what bleed** — Phase 3 cannot start without Prodigi's real
   specification. It is the first thing to ask for after the rate card.
3. **HEIC transcode, device or server** — recommended on device in Phase 1, but it needs measuring
   against a real 400-photo upload before it is settled.
4. **How long may a grounded Maps result be cached** — inherited unanswered from Waypoint, and it
   gates Phase 7's suggestions the same way it gated Waypoint's. The API docs carry no retention
   statement at all; the silence is confirmed rather than assumed.
5. **Whether ingestion (Path A) moves ahead of the album** — §1a makes the argument; the decision
   is ROADMAP §6.4. Both paths are in v1 either way; this is only about order, and it turns on
   whether the album should be built against clusters an import will later re-derive.
6. **Railway's current PITR offering** — verify before relying on it. §6 flags Supabase as
   historically stronger here, and the answer changes only how much our own pipeline has to carry,
   never whether it exists.

---

## 6. Review record

**This plan has been reviewed twice, by reviewers of different independence, and the two rounds
reached different verdicts.** Read both. Round 2 is the one that governs, and it is the one this
section used to omit.

### Round 1 — self-review, 2026-09-03. Verdict: REVISE

Run under `/plan-review`. Eight findings; all eight are resolved in this document or recorded as
decisions in ROADMAP §6 (the table below). Nothing was found that changed the approach — Path B
first, R2 for media, the itinerary as the zone source, backups as a hard requirement, fulfilment
behind an interface all stand.

**It was run by the same model that wrote the plan**, which the skill itself warns against: a
reviewer sharing the author's priors shares its blind spots. This section used to end by asking for
a re-run with a different reviewer before Phase 1. That re-run has happened. It is round 2, and the
plan did not survive it in the shape round 1 left it.

### Round 2 — three independent cold reviewers, 2026-09-03

Against the founding documents as a whole, not this file alone:

| Review | Verdict |
|---|---|
| Business | **RETHINK** |
| Safety | **DO NOT BUILD AS SPECIFIED** |
| Security | **PROCEED WITH FIXES** |

All three converged on the same shape, independently:

> "The documents are strongest exactly where Waypoint had already been hurt, and thinnest where
> Wayleaf is new. Money, object storage and session transport — the three genuinely new surfaces —
> each get one confident paragraph and no adversary."

> "It reviewed the plan against itself rather than against the world."

**What came out of round 2 was the team, not a revision of this document.**
`.claude/team/CHARTER.md` §1 records the reasoning: every seat exists because a dimension of the
work had nobody accountable for it. `privacy-counsel` exists because the safety review found that
*consent*, *GDPR*, *PIPEDA*, *COPPA*, *BIPA*, *biometric*, *privacy policy*, *terms of service*,
*erasure*, *moderation* and *age gate* appear **zero times** across seven documents.
`security-reviewer` exists because three of the four security criticals — webhook authenticity,
presigned upload capability, the cookie/bearer CSRF split — are app-layer, and a database or infra
seat would have missed all three.

**So this is not a build-ready spec.** The `/team` skill states that as a standing fact; it is
restated here, in the document it is about, because this is where someone about to build from it
will look. Until the decisions in ROADMAP §6 are made, treating this plan as buildable is the
mistake the reviews exist to prevent.

### The gap in this record

**Round 2's findings were never written down.** They survive only as the summary above, reassembled
from `CHARTER.md` §1 and two agent files. There is no findings list, no severity table, and the
*fourth* security critical is not named anywhere in this repository.

That has a concrete consequence rather than a tidiness one: **ROADMAP §1's release bar, condition 3,
cannot currently be checked.** It requires that every CRITICAL and HIGH from the security review be
closed, against a list that does not exist. Either round 2 is re-run and its findings recorded here,
or condition 3 is unverifiable and the bar has a hole in exactly the place — money, uploads,
sessions — that all three reviewers independently called the thinnest. Recorded 2026-09-03.

What round 1 changed:

| # | Finding | Where it went |
|---|---|---|
| 1 | The oracle answers *where the traveller was*; EXIF records *what the camera's clock said*. Conflating them puts a DSLR's photos six hours out | §2c rewritten as two steps; `devices` added to §3 |
| 2 | "Sniff the bytes" and "upload direct to R2" contradict each other operationally — the API never sees the bytes | §2d: presigned conditions, and a `pending_scan` state nothing downstream may skip |
| 5 | `order paid / trip with photos` falls fastest when acquisition works | §2j: a 60-day cohort measure, always reported with its window |
| 8 | Phase 1's acceptance criterion was not blind, and its stated condition was a no-op | §4 Phase 1: someone else's camera roll, a countable error rate, written down |
| 3 | Whose retention clock governs a collaborator's uploaded photo | ROADMAP §6.5, with a recommendation |
| 4 | A re-cluster can destroy album edits; the plan asserts both properties and reconciles neither | ROADMAP §6.6, with a recommendation |
| 6 | §2e builds a commitment against the business plan's own stated pricing fallback | ROADMAP §6.7, with a recommendation |
| 7 | The October date depends on Gate 2, which runs on Prodigi's clock and has never been timed | **Moot 2026-09-03** — the deadline was killed. Gate 2 still blocks Phase 3, but nothing now depends on how fast Prodigi answers |
