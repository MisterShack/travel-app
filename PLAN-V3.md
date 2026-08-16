# Waypoint — Plan V3: place

> **Status: draft, not started.** Authored by Opus on 2026-08-15 from a request by David for maps
> and restaurant/attraction suggestions.
>
> **Run `/review-kit:plan-review PLAN-V3.md` before building any of it.** This plan rests on
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

## 3. Suggestions

PLAN.md §12 already defers this as "cheapest viable option (Gemini free tier / Google Places)".
Two things have changed since: Gemini is now on the paid tier for privacy reasons (§6.7), and
Google restructured Maps Platform pricing in 2025, replacing the $200 monthly credit with per-SKU
free tiers. **The old cost assumption no longer holds and must be re-checked before committing.**

### The design risk, which is larger than the cost

The app's stated character is *quiet*: no upsells, no recommendations you did not ask for
(BRAND.md §2). A suggestions feature is, definitionally, recommendations you did not ask for. It is
the single change most likely to make Waypoint feel like every other travel app.

If it is built, it should be:

- **Pulled, never pushed.** A "what's near this?" action on a lodging row. Never a feed, never a
  notification, never a card that appears on the timeline uninvited.
- **Attributed and honest.** If a model generated it, say so — the import queue already does this
  and it is the right precedent.
- **Cached per place, not per request.** The same hotel does not need re-asking every time the
  screen opens, and this is the difference between pennies and a bill.

### Open question the plan cannot answer

Does anyone want this? It was listed at the original scoping as a "later" idea and has not been
asked for since. Building it because it is on an old list is a poor reason. The honest test is
whether, after a real trip using the app, its absence was ever felt.

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

- **Phase 8 — Directions hand-off.** §2 step 1. Small, offline-safe, free. A day.
- **Phase 9 — Geocode on import.** §2 step 2. Needs a geocoding provider and a cost check; store
  coordinates only.
- **Phase 10 — Suggestions, if wanted.** §3, gated on the question in §3 having a real answer.
- **Phase 11 — Conflict and gap detection.** The differentiator that emerges from the architecture
  rather than being bolted on: impossible overlaps, tight connections, unbooked nights. It needs
  correct instants across zones, which is the expensive thing this project already paid for and
  which competitors mostly have not. No API, no network, no cost per use, and it speaks only when
  something is wrong — which suits an app whose stated character is quiet.
- **Phase 12 — Segments.** §3a. Rail, coach and ferry as first-class journeys. Sequenced after
  Phase 11 so the conflict rules exist before the data model widens under them, and because it is
  the first migration to touch live bookings.

## 5. Open questions

- **Which geocoding provider, and at what cost per lookup?** Nominatim is free but its usage policy
  forbids heavy automated use; commercial providers are metered. This is the load-bearing unknown
  in Phase 9.
- **Does a tile provider's free tier permit caching tiles for offline use?** Several forbid it
  outright. If none do, §2 step 3 is closed rather than merely expensive.
- **What is the actual Places cost under the post-2025 pricing?** PLAN.md §13 already flags this as
  unpriced; it must be answered before Phase 10, not during it.
- **Is "quiet" worth more than "helpful"?** §3's design risk is a values question about the product,
  not a technical one, and it belongs to David rather than to this document.
