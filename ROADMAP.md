# Waypoint — roadmap and the greenlight gate

> **This document owns two things and links out for everything else.** It owns the **greenlight
> gate** below, which no other document records, and the **order of what is left**. Detail lives in
> the plans: **PLAN.md** (V1, phases 0–5), **PLAN-V2.md** (Terraform and Playwright, phases 6–7),
> **PLAN-V3.md** (place and suggestions, phases 8–12). Status of what shipped lives in CLAUDE.md.
>
> It exists because after twelve phases across three plan documents there was no single place that
> answered "what is next, and what has to be true before this is real". Written 2026-08-18.

## 1. The greenlight

**Waypoint is in development until David says otherwise** — decided 2026-08-17, and the reason this
document exists.

It is publicly reachable at <https://waypoint.myze.ca>, it holds real bookings, and registration is
open to anyone with the URL. None of that makes it launched. The distinction is not cosmetic: it
sets what losing the database costs. Today that is re-entering David's own trips. After the
greenlight it is other people's data, and the calculation changes with it.

**Backups are scheduled to this moment, not deprioritised.** That is the whole point of writing the
gate down. A deferral nobody records is not a deferral; it is an omission that everyone remembers
differently in a month.

### What must be true before the greenlight

| # | Gate | Where it is documented | Status |
|---|---|---|---|
| 1 | The Start Command no longer overrides the image `ENTRYPOINT`, **or** the reason it cannot be cleared is understood | DEPLOY.md §5, PLAN-V2 §4 step 0 | Unresolved — the long pole |
| 2 | `LITESTREAM_BUCKET` set and replication proven with `litestream snapshots` | DEPLOY.md §5 | Blocked on 1 |
| 3 | The restore drill actually run — this is Phase 1's own acceptance criterion | DEPLOY.md §6, PLAN.md §11 | Never run |
| 4 | `npm run check-drift` passes against production with a real token | DEPLOY.md §8a, `infra/README.md` | Never run against Railway |
| 5 | `VAPID_*` set, if web push should work at launch | DEPLOY.md §3 | Optional — decide, do not drift |
| 6 | Registration gate reconsidered, or the decision restated deliberately | — | Judged an acceptable risk 2026-08-18 |

**Gate 1 is the one to pull forward.** Everything about backups waits behind it, and its size is
genuinely unknown: clearing the Start Command crashed the deploy on 2026-08-15 and the cause was
never established. Finding out whether that is a two-line fix or a real problem is an hour of work
that can happen at any time, and it should happen long before the greenlight rather than on the day.

The cheapest first move costs nothing and touches no production: build the image locally and run it
with `LITESTREAM_BUCKET` unset and the `ENTRYPOINT` active — the exact configuration that crashed.
If it serves `/health`, the cause is Railway-specific and that narrows it a long way. If it fails,
it has been found without risking anything.

### What the greenlight is not gated on

Features. Phases 9, 10 and the whole of 7 can land before or after it. Conflating "the app is
finished" with "the app is safe to hold other people's data" is how the second one never happens.

## 2. What is left, in the order worth doing it

Nothing below is started. Sizes are the plans' own where they gave one.

1. **Gate 1 — the Start Command investigation.** Not a phase, and the highest-value hour available.
   See above.
2. **Phase 7 — Playwright.** PLAN-V2 §5. The largest item and the one whose value depends most on
   being done early: every defect that reached production in V1 was invisible to the unit suites and
   was caught by a person clicking, or not at all. Being pre-greenlight is the argument for it, not
   against it.
3. **Phase 6 steps 1–2 — Terraform skeleton and import.** PLAN-V2 §4, as revised by the 2026-08-17
   review. Adopted on David's forward-looking argument that future integrations will make
   infrastructure-as-code pay off; recorded in PLAN-V2 §7 as a bet rather than a reason, because no
   integration is named yet and Resend — this app's most configuration-heavy dependency — has no
   provider at all. Steps 1–2 open no one-way doors. **Needs a Railway token and a Cloudflare
   account**; roughly an hour once they exist.
4. **Phase 9 — geocode on import.** PLAN-V3 §2 step 2. Blocked on choosing a provider and pricing
   it, which is the load-bearing unknown rather than the work.
5. **Phase 6 step 5 — DNS to Cloudflare.** The only genuinely dangerous item on any plan, and
   nothing above depends on it. The honest default is to leave it undone until something needs it.
6. **Phase 10 — suggestions.** Gated on a values question that belongs to David, not to a document:
   is *quiet* worth more than *helpful*? PLAN-V3 §3 argues against it more than for it.

## 3. Standing risks

Live conditions of the running system, not work items.

- **The Railway volume is the only copy of every account and trip.** No replica, and the restore
  path has never been exercised. Accepted deliberately; see the gate.
- **A custom Start Command overrides the image `ENTRYPOINT`**, so `entrypoint.sh` and therefore
  Litestream never run. Harmless while no bucket is set, and precisely why backups cannot simply be
  switched on. `npm run check-drift` turns this from invisible into a hard failure the moment a
  bucket appears.
- **Registration is open** to anyone with the URL — rate-limited, but no invite gate or allowlist.
  Judged an acceptable risk on 2026-08-18.

## 4. Decisions still owed

Each gates something above. Full context in the section named.

- **The LLM spend cap** (PLAN.md §13). The per-user import cap bounds the damage but no number was
  ever chosen and no billing alert is set. On the paid tier the exposure is money, not a quota.
- **Trip deletion, and account deletion** (PLAN.md §13). Hard delete, soft delete, or blocked while
  others are members? Account deletion is covered nowhere in any plan, and for an app whose stated
  audience includes a dev portfolio its absence is conspicuous.
- **`tzdata` refresh policy** (PLAN.md §13). The UTC instant is derived and must be recomputed when
  zone rules change; the container's data is pinned at image build. Only matters for trips booked
  months ahead.
- **Is *quiet* worth more than *helpful*?** (PLAN-V3 §5). Decides Phase 10 outright.
- **Do PLAN-V2 and PLAN-V3 still need their adversarial review?** PLAN-V2 was reviewed on
  2026-08-17. PLAN-V3 still says "draft, not started" in its header and asks for `plan-review`
  before anything is built from it, while phases 8, 11 and 12 have all shipped from it. Either run
  it or record that it was consciously skipped.

## 5. Candidates, not commitments

Ideas with no home in any plan yet, kept here so they are argued with rather than rediscovered. The
first two follow the pattern that has worked twice — a feature that falls out of the architecture
instead of being bolted onto it, which is what conflict detection and segments both were.

- **Calendar export (`.ics`) with a correct `TZID` per event.** Most travel apps get this wrong;
  Waypoint already holds the local-plus-zone truth needed to emit it. No API, no cost, generatable
  offline, and it puts the itinerary where family already look.
- **A "next up" view.** The timeline answers *what is the plan*; nothing answers *what do I do now*.
  One screen, the next event, its countdown, in that event's own zone.
- **Data export and account deletion.** Closes the §4 gap above rather than adding surface.
- **Past and upcoming trips, separated.** Small, and necessary rather than nice once there are more
  than a handful.
- **Per-event reminder overrides.** Deferred once already, on the reasoning that sensible defaults
  matter more than a setting nobody opens. Revisit only if a default has actually annoyed someone on
  a real trip.

### Named and rejected

**Live flight status and delay tracking.** The most obvious missing travel-app feature and the one
users would ask for first — which is exactly why the rejection is written down rather than left to
be re-proposed every few months. It needs a metered third-party API, it breaks the offline promise
on the screen that must work offline, and it puts a recurring line item against a $10/month budget.
Three of the project's non-negotiables, one feature.
