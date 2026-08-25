# Waypoint — Plan V3: place

> **Status: partly built, and never reviewed.** Authored by Opus on 2026-08-15 from a request by David for maps
> and restaurant/attraction suggestions.
>
> **Phases 8, 10, 11 and 12 have shipped from this document and the review below was never run.**
> That is the finding: the instruction has now been passed over **four** times, once deliberately
> and three times by habit — Phase 10 on 2026-08-25 being the most recent, and the one that most
> deserved it, since §3 was the section resting on third-party pricing and third-party terms. Only
> **phase 9** is left to review. Either run it against that, or record that it was consciously
> skipped. ROADMAP.md §4 tracks the decision.
>
> **Run `/review-kit:plan-review PLAN-V3.md` before building any more of it.** This plan rests on
> third-party pricing and on a claim about what people actually need, which are the two things
> that skill is best at attacking.

Both features answer the same question — *where is this, and what is near it?* — and both collide
with commitments already made. This document is mostly about that collision, because the features
themselves are easy and the collision is not.

## 1. What this must not break

Three existing commitments constrain everything below. They are not negotiable in passing; if one
should change, that is its own decision.

- **The timeline reads with no network** (PLAN.md §4, §8). This is the app's central claim and the
  reason the offline cache shipped with the MVP.
- **~$10/month, all in** (PLAN.md §12). Railway is already $5–10 of that.
- **No document or photo storage** (PLAN.md §4). Map tiles and place photos are images.

Map tiles and Places results are network-dependent, metered, and images. Every one of the three.

## 2. Maps

### The honest problem

A map on the trip screen is a network dependency on the screen that must work offline. At a gate
with no signal, a static map thumbnail is a grey box — and a grey box where a map should be reads
as *broken*, not as *offline*, which is worse than not having it.

### What is actually wanted

Probably not a map. The underlying need is **"how do I get there, and how far is it?"** — and on a
phone that question is answered better by the device's own map app, which has the user's location,
their transport preferences, offline maps if they have downloaded them, and live traffic.

### Proposal, cheapest first

1. **Link out, do not embed.** Every lodging and activity with an address gets a "Directions"
   action opening `geo:` / Apple Maps / Google Maps with the address. Costs nothing, needs no API
   key, works offline as far as handing off to an app that may itself work offline, and is what
   most people do with an in-app map anyway.
2. **Coordinates on import.** When the parser reads an address, geocode it once and store lat/long.
   That is structured data, not a document, so §4 is satisfied. It makes step 3 possible later and
   improves the hand-off in step 1.
3. **A static map image, only if 1 and 2 prove insufficient.** Cached at write time, shown with an
   honest placeholder offline. Needs a tile provider with a free tier that permits caching — which
   several explicitly do not, and that licence question is the deciding factor, not the price.

**Recommendation: do 1, measure whether anyone wants more, and treat 3 as unlikely to be worth it.**

## 3. Suggestions — "what's nearby"

> **SHIPPED 2026-08-25**, the same day it was decided — everything below except the cache, which
> is still behind the retention gate and is the one part of this section that is not built. See
> "What was decided" for which half landed.
>
> **Decided 2026-08-25, by David, and the shape he asked for is the one this section already
> prescribed.** He described wanting to ask, from an activity, what restaurants are nearby or where
> the nearest metro station is. That is "pulled, never pushed" exactly. The open question below —
> *does anyone want this?* — is answered by having been asked for, which is the test it set.

### The cost, which §5 said must be priced before this is built

Priced 2026-08-25 against **Gemini's Grounding with Google Maps**, which is the tool for this and
needs no new vendor: `GEMINI_API_KEY` already exists and is already on the paid tier.

| | |
|---|---|
| Grounded prompts | **5,000 per month free**, shared across Gemini 3 |
| Beyond that | **$14 / 1,000 search queries** — about 1.4¢ each |
| Tokens (flash-lite) | $0.30 / 1M in, $2.50 / 1M out — negligible at this size |

**At family scale the free allowance is effectively unreachable**: a hundred questions a month is
2% of it. The cost objection that gated this phase, and that killed live flight status outright
(ROADMAP §5), does not survive contact with the actual number. What survives is the *abuse* case —
registration is open, so the cap below is about someone else spending the allowance, not about
David spending it.

### What was decided

- **Pulled, never pushed.** Unchanged, and now confirmed: no feed, no notification, no card that
  appears on the timeline uninvited.
- **On the event's own page**, not the timeline row. The row was cut back to two links on
  2026-08-25 and the audit had already flagged the one action on it as under the touch target;
  adding a second is the wrong direction. Tapping a card already opens it, and an answer needs room
  to render anyway.
- **Fixed intent chips**, not a free-form box — "eat nearby", "getting around", and so on. Bounded
  cost, cacheable per place *and* intent, predictable enough to lay out, and it covers both of the
  questions actually asked for. **A free-form question is deliberately deferred to a paid tier if
  one ever exists** (David, 2026-08-25): it is the flexible version and it is the unbounded one, so
  it is the natural thing to put behind a subscription rather than behind the free allowance.
- **Cached per place, readable offline** — subject to the retention gate below. The offline half is
  the point rather than a bonus: "nearest metro" is a question you have abroad, on a bad
  connection, which is exactly when a live-only feature has nothing to say.

  **This is the one thing that did not ship** (2026-08-25). Nothing is persisted, so offline is an
  honest refusal — the chips disable and say "Offline — asking needs a connection" — rather than a
  chip that spins and fails. Building the cache first and asking about retention afterwards would
  have meant deciding the gate by having already built past it.
- **A per-user daily cap**, reusing the booking import's pattern rather than inventing one. It is
  written, tested and already bounds one account's damage.

  **Shipped as the pattern, not the mechanism** (`NEARBY_DAILY_CAP`, default 25). The import counts
  rows in `booking_imports`, which exist anyway; this phase persists nothing while the cache is
  gated, so counting that way would have meant a table whose only job is to count — and the first
  thing this phase stores should be decided by the retention gate, not by a limiter. Nor is it the
  `rateLimit` middleware: that charges before the handler runs, so a chip tapped on an addressless
  event would spend a day's allowance on a question that never reached the model. It is consumed at
  the call site, in memory, and therefore resets on deploy. That bounds sustained cost rather than a
  burst, which is the honest description of what it buys.

### Attribution is contractual, not a nicety

Grounding with Google Maps **requires** that place citations and their Google Maps links are shown:
the sources "must immediately follow the generated content that the sources support" and "must be
viewable within one user interaction", and the words *Google Maps* may not be recapitalised,
localised or wrapped onto two lines.

This lands well rather than awkwardly — the section already wanted "attributed and honest", with
the import queue's "read by AI" as precedent. But it is a **hard UI constraint**: a design that
renders an answer without its citations is not shippable, so it cannot be left to a later polish
pass.

### The one gate left

**How long may a grounded result be kept?** The API documentation is silent, and the whole cost
strategy — cache per place, not per request — rests on the answer. Google Maps Platform terms have
historically restricted retention of Places content, and if grounding inherits that, an indefinite
cache is not an option and the design needs a TTL or a different shape.

**Answer this against the service terms before building the cache.** Everything else above can be
built while it is open; the cache cannot. That is the same discipline §5 applied to the cost
question, and the cost question turned out to be the one that dissolved.

**Still open after building the rest** (2026-08-25). The API documentation was read while
implementing this and it carries no retention statement at all — so the silence is confirmed rather
than assumed, which is a slightly stronger position than before: the question is not "did anyone
look", it is "the terms do not say, and Maps Platform's separate terms historically did". Answering
it needs the service terms, not the API docs.

## 3a. Rail, coach and ferry — the modelling gap

Asked on 2026-08-15 whether conflict detection would cover OpenTable and Via Rail. The answers
differ, and the difference is a gap in the data model rather than in the feature.

**A restaurant reservation fits.** It is an `activity` with a kind, a location and a start. Nothing
is lost.

**A rail journey does not.** A train has what a flight has — origin, destination, departure,
arrival — but only `flights` models that shape. A train currently lands as a generic `activity`
with a single `location` and a start, so the destination is lost entirely. That is precisely the
data a conflict needs: *"you arrive in Toronto at 14:00 but your hotel is in Montreal"* is
undetectable if the app does not know you arrive anywhere.

Mitigated immediately by teaching the parser to record an activity's end time and to put the route
in the name (2026-08-15). That stops the arrival being thrown away; it does not make the
destination structured.

### The real fix: generalise `flights` into `segments`

One table for anything that carries you from one place to another, with a `mode` of `air`, `rail`,
`coach` or `ferry`. The endpoints become places rather than strictly airports — an IATA code for
air, a station name for rail — and the timezone triple works unchanged on both ends.

**Why this is worth doing rather than tolerating.** Most travel apps are US-built and flight-first;
rail is an afterthought in them. In Canada and Europe it is not. Treating rail as a first-class
journey is a real point of difference that costs no third-party API, works offline, and reuses the
timezone machinery already built — which is the same argument that makes conflict detection
attractive and is the opposite of what maps and suggestions offer.

**What it costs.** A migration on live data, a parser change, and every screen that says "flight".
The migration must move existing rows rather than recreate them, and it is the first change in this
project to touch a table holding real bookings, so it needs a rehearsal against a copy of the
production database rather than only a test fixture.

**Open question:** whether the airport table (`shared/src/airports.ts`) has a rail equivalent worth
bundling. There is no IATA for stations, and station-name geocoding is a different problem — the
zone can most likely be derived from the trip or asked for, as lodging already does.

## 4. Phases

- **Phase 8 — Directions hand-off: done 2026-08-17.** §2 step 1. Small, offline-safe, free — and
  the offline claim is the one that was actually verified: the browser drive's *offline* screenshot
  shows the Directions action still on the cards, because a URL needs no network to exist. That is
  the whole argument for handing off rather than embedding, made visible.

  Lodging and activities only. A segment gets nothing, deliberately: its endpoints are an IATA code
  for air and a station name for everything else, and neither is safe to hand to a maps app — "YOW"
  is not an address and "Ottawa" is a city rather than the station in it. Sending someone
  confidently to the wrong place is worse than offering nothing, and it is the same
  false-positives-are-the-design-constraint reasoning as Phase 11.

  **`TimelineItem` gained an `address` field rather than the action reading `subtitle`**, which
  already displays exactly this for both kinds. That duplication is the point: the conflict rule
  once read its endpoints by splitting the subtitle and broke the first time seats were appended to
  it. A display string is not an interface.

  Two things the unit tests could not have told us, both found while building. The card was a
  single `<Link>` wrapping everything, so a second action inside it would have been an anchor
  inside an anchor — invalid, and inconsistently operable by keyboard. The title now carries the
  link and stretches its hit area over the card, with Directions above it: two sibling links, one
  card, and a test that fails if anyone puts it back. And the accessible name from a
  visually-hidden `" to {title}"` suffix computed as "Directionsto Hotel Lutetia", because name
  computation collapses the leading space; it is an `aria-label` now.
- **Phase 9 — Geocode on import.** §2 step 2. Needs a geocoding provider and a cost check; store
  coordinates only.
- **Phase 10 — Suggestions, if wanted.** §3, gated on the question in §3 having a real answer.
- **Phase 11 — Conflict and gap detection: done 2026-08-15.** The differentiator that emerges from
  the architecture rather than being bolted on: impossible overlaps, tight connections, unbooked nights. It needs
  correct instants across zones, which is the expensive thing this project already paid for and
  which competitors mostly have not. No API, no network, no cost per use, and it speaks only when
  something is wrong — which suits an app whose stated character is quiet.

  Shipped as a pure function in `shared/`, so it runs on the client over the timeline already in
  hand: no network, no round trip, no cost per use. Five rules — overlap, tight connection, airport
  change, unbooked night, event outside the trip's dates.

  **The design constraint throughout was false positives.** An app that cries wolf gets ignored,
  and is then worse than silent. Two rules exist mainly to stay quiet: lodging is excluded from
  overlap checks entirely, because a hotel spans the whole stay and would otherwise conflict with
  every dinner; and an overnight flight counts as covering a night, because telling someone to book
  a hotel they are flying through would be wrong.
- **Phase 12 — Segments: done 2026-08-16.** §3a. `flights` became `segments` with a `mode`;
  `airline`/`flight_number`/`departure_airport`/`arrival_airport` became
  `carrier`/`service`/`origin`/`destination`. Migration 0007 is hand-written, because drizzle-kit
  cannot tell a rename from a drop-and-add and on live data the difference is every existing
  booking; SQLite's RENAME is a catalogue edit, so there is no table copy and no partial move.
  `mode` defaults to `'air'` — every row that existed was a flight, so the default is the backfill.

  **Sequencing it after Phase 11 was right, and for a reason the plan did not anticipate.** The
  connection rule read its endpoints by splitting the subtitle on "→". That held only while the
  subtitle was exactly `LHR → LIS`; adding seats to it made every connection compare `LIS · 14C`
  against `LIS` and report a change of airport that was not one. The endpoints are now structured
  fields on the timeline item. A display string is not an interface, and the rule that depended on
  one was already broken before the data model widened under it.

  **The open question is answered: no rail equivalent of the airport table.** There is no IATA for
  stations, and bundling a station list would be a large table serving one lookup. The endpoint is
  the station *name* as the ticket writes it, and the zone is asked for on the form — exactly as
  lodging already does. Setting the departure zone carries the arrival zone with it, because most
  rail journeys do not cross one and a mismatched pair records an instant hours out while both
  fields look filled in.

## 5. Open questions

- **Which geocoding provider, and at what cost per lookup?** Nominatim is free but its usage policy
  forbids heavy automated use; commercial providers are metered. This is the load-bearing unknown
  in Phase 9.
- **Does a tile provider's free tier permit caching tiles for offline use?** Several forbid it
  outright. If none do, §2 step 3 is closed rather than merely expensive.
- ~~**What is the actual Places cost under the post-2025 pricing?**~~ **Priced 2026-08-25** — and
  the answer is that it is nearly free at this scale. Gemini's Maps grounding gives 5,000 grounded
  prompts a month before charging, then $14/1,000. §3 has the table. The discipline was right and
  the fear was not.
- ~~**Is "quiet" worth more than "helpful"?**~~ **Answered 2026-08-25, by David, and not as a
  trade.** Helpful *when asked*, quiet otherwise — which is what "pulled, never pushed" was always
  for. The app does not volunteer anything it was not asked for, so nothing about its character is
  spent.
- **How long may a grounded Maps result be cached?** The new load-bearing unknown, and the only
  thing blocking §3's cache. See §3's last section.
