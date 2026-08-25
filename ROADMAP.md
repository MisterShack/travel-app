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
| 1 | The Start Command no longer overrides the image `ENTRYPOINT`, **or** the reason it cannot be cleared is understood | DEPLOY.md §5, PLAN-V2 §4 step 0 | **DONE 2026-08-24** — cleared, `entrypoint.sh` runs, deployment `55d5f6e2` clean with no downtime |
| 2 | `LITESTREAM_BUCKET` set and replication proven with `litestream snapshots` | DEPLOY.md §5 | Unblocked by gate 1, and **deliberately not scheduled** — see below |
| 3 | The restore drill actually run — this is Phase 1's own acceptance criterion | DEPLOY.md §6, PLAN.md §11 | Never run — blocked on 2, and read §6's boxed warning first |
| 4 | `npm run check-drift` passes against production with a real token | DEPLOY.md §8a, `infra/README.md` | **Done 2026-08-24** — exits `0` with two accurate warnings. The first run also found two defects in the checker, both fixed |
| 5 | `VAPID_*` set, if web push should work at launch | DEPLOY.md §3 | **Already set** — `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` are all present in production (confirmed 2026-08-24). Decided by action; what is unverified is whether push actually delivers |
| 6 | Registration gate reconsidered, or the decision restated deliberately | — | Judged an acceptable risk 2026-08-18 |

**Gate 1 was the long pole and it is now done** (2026-08-24). What it cost is the useful part: the
crash that justified nine days of caution was the missing `RESEND_API_KEY`, misattributed to the
Start Command by a write-up made twenty minutes later without the logs. The fix itself was one
setting.

**Gates 2 and 3 are not scheduled, and that is a decision rather than a backlog.** Restated by
David on 2026-08-24: Waypoint is a personal project until he says otherwise, and being publicly
reachable does not change that. Backups are not a priority at this scale, and the cost of losing
the volume is still him re-entering his own trips.

**Do not re-propose them.** They come back onto the table when David indicates the project is no
longer personal — that indication is the trigger, and it is his to give. Gate 1 was worth doing
anyway because it was cheap, it is now impossible for backups to *look* configured while silently
doing nothing, and the landmine is defused whenever the decision does change.

**That local experiment was run on 2026-08-23 and the image is exonerated.** Built unmodified and
run in the exact configuration that crashed, it boots and serves `/health`, the SPA and a 401 from
`/api` — and so does the Start Command path, in the same image. The working directory, the memory
ceiling, cold-start timing, an injected `PORT` and volume persistence are all eliminated by exercise
rather than by reading. The cause is Railway-side. DEPLOY.md §5 has the detail.

**The boot-log check confirmed the override is real:** the running deployment's first lines are
npm's workspace banner and a *relative* `src/index.ts`, with no `LITESTREAM_BUCKET` warning
anywhere. `entrypoint.sh` has never executed in production and Litestream has never run.

**And the crash that blocked this for eight days was a misattribution.** The deploy history shows a
single failure on 2026-08-15, at 17:08, which commit `29d8a17` diagnosed at 17:10:27 as the missing
`RESEND_API_KEY`. The Start Command was blamed for the same crash at 17:28. The "entrypoint's own
WARNING printed before the failure" detail — offered as evidence of the mystery — is exactly what a
cleared Start Command plus an unset mail key produces, and it reproduces in the image. The WARNING
was the change *working*. DEPLOY.md §5 has the full account.

`RESEND_API_KEY` has been set ever since, so **there is no known reason clearing the Start Command
should fail today.** It is a routine change rather than an experiment.

Do it at a moment when nothing else is changing — any deploy that reaches node runs migrations
against the live volume and there are no backups, which is the circularity this gate exists to
break. Expect the three WARNING lines then `Waypoint API listening` within a couple of seconds.
**Capture the logs before rolling back if it does fail** — that is what was not done in 2026-08-15,
and it is what cost the eight days.

Railway project `9953e26c-f283-4cca-ad08-b32283f28dfa`, service `6fd08928-a910-4500-a81e-8cdf56fbb9de`
— gate 4's `check-drift` needs the project id and a token, and the id is now known.

### What the greenlight is not gated on

Features. Phases 9, 10 and the whole of 7 can land before or after it. Conflating "the app is
finished" with "the app is safe to hold other people's data" is how the second one never happens.

## 2. What is left, in the order worth doing it

Sizes are the plans' own where they gave one.

**The first two entries are done.** They are kept in place rather than deleted because the order
was the argument, and a list that silently loses its finished items reads as though nothing was
ever sequenced. The next actually-open item is 3.

1. ~~**Gate 1 — the Start Command investigation.**~~ **DONE 2026-08-24** — see §1, which owns the
   gate. It was the highest-value hour available and it cost one setting.
2. **Phase 7 — Playwright. DONE 2026-08-24.** PLAN-V2 §5. All five steps are in: the
   `@playwright/test` harness with both servers and a throwaway database, the auth fixture, every
   step-3 journey, `@axe-core/playwright` on every screen in both themes, and the repo's first
   GitHub Actions workflow. `audit.mjs` is deleted as the plan asked; `drive.mjs` keeps its
   screenshot role. **31 specs, green three runs running.**

   **Step 3's journeys, and what each one is actually for:**

   - **adding each timeline entity type** (`timeline.spec.ts`) — flight, train, stay and activity.
     Each asserts the **stored UTC instant**, not that the event appeared: the instant is derived
     and never rendered, so a timeline that reads perfectly and a database an hour out are
     indistinguishable on screen. The flight runs four distinct zones — browser Chicago, trip
     Toronto, endpoints Lisbon and Paris — so every fallback bug produces a wrong number. Lisbon
     and London would have proved nothing, because they never differ
   - **the timezone default** (`timezone.spec.ts`) — browser pinned to `America/Chicago`, trip to
     `Europe/Lisbon`, the scenario `EventForm.tsx` names in a comment; guards its own premise so it
     cannot pass vacuously if the two ever coincide
   - **invite and redeem** (`invite.spec.ts`) — two signed-in contexts at once rather than signing
     one out and the other in, which would pass even if sessions leaked. Includes the security
     property: a forwarded invitation joins nothing, asserted against the membership table
   - **import review and apply** (`imports.spec.ts`) — including the multi-leg case, where a return
     trip must stay in the queue until *both* legs are added. That is a defect this repo already
     shipped and fixed, and it is invisible to a single-leg test
   - **offline read** (`offline.spec.ts`) — the app's central claim (PLAN.md §4). Covers the
     IndexedDB read-through cache by client-side navigation, plus the honest refusal of an offline
     *write*. It does **not** cover the service worker: it is disabled in dev, so a reload offline
     has no shell to load. That needs the production build and is a separate question

   The registration rate limit — 10 per 15 minutes per IP — bounds how many accounts a run can
   create. The suite uses two: one per worker, plus one the invite journey registers. Well inside
   it, but it is the ceiling any new multi-account spec has to respect.
3. ~~**Phase 6 steps 1–2 — Terraform skeleton and import.**~~ **CLOSED 2026-08-24, by David.**
   The community Railway provider — 42 stars, 24 open issues, one person's side project — was
   judged an unacceptable dependency for a live deployment, which ends steps 1–2 on its own.
   Asked at the same time to name the future integrations the whole bet rested on (PLAN-V2 §7),
   the answer was that there are none yet: so there is also nothing for Terraform to manage.

   **What replaced it**, serving the goals Terraform was standing in for:

   - **`check-drift` grew to seven rules** (2026-08-24) — healthcheck path, builder and restart
     policy on top of the original four. This is the "stop clicking dashboards from memory" half,
     and it is the half PLAN-V2 §2a says Terraform structurally *could not* have done
   - **`.railway/railway.ts`** owns `numReplicas` before the 2026-12-01 sunset — see §4 below,
     which is now a dated task rather than an open question

   **Not reopened without new information.** The trigger is a named integration with a mature
   official provider — Cloudflare, GitHub, object storage. Another Resend-shaped dependency is not
   one, and neither is a tidier version of this argument.
4. **Phase 9 — geocode on import.** PLAN-V3 §2 step 2. Blocked on choosing a provider and pricing
   it, which is the load-bearing unknown rather than the work.
5. **Phase 6 step 5 — DNS to Cloudflare.** The only genuinely dangerous item on any plan, and
   nothing above depends on it. The honest default is to leave it undone until something needs it.
6. **Phase 10 — "what's nearby". Decided 2026-08-25 and ready to build**, bar one gate. PLAN-V3 §3
   holds the design. Asked for directly — from an activity, "what restaurants are nearby", "where
   is the nearest metro" — which is both the answer to the values question and the test §3 set for
   whether anyone wanted it at all.

   Gemini's **Grounding with Google Maps**, so no new vendor: `GEMINI_API_KEY` exists and is on the
   paid tier. **5,000 grounded prompts a month free, then $14/1,000** — the cost objection that
   gated this phase does not survive the actual number. Fixed intent chips on the event's own page,
   cached per place and readable offline, with the import's per-user daily cap.

   **The gate:** how long a grounded Maps result may be cached is undocumented, and the cache *is*
   the cost strategy. Maps attribution is also contractual — citations and their links must render
   with the answer — so that is a design constraint rather than a polish pass.

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
  **Phase 10 adds a second metered surface** on an app anyone can register for, bounded by the same
  per-user cap. The number is still unchosen and the alert still unset.
- ~~**`railway.json` is deprecated, and it is load-bearing.**~~ **DONE 2026-08-24.** The five
  settings it supplied are now on the service itself and the file is deleted, so the 2026-12-01
  sunset no longer threatens anything. DEPLOY.md §8b records the sequence, why Infrastructure as
  Code was rejected, and the two things that made it awkward: Config as Code locks the dashboard
  fields it owns (broken with `serviceInstanceUpdate`, which writes underneath the file), and
  `builder` was never the field selecting the Dockerfile — `dockerfilePath` is.
- **Trip deletion, and account deletion** (PLAN.md §13). Hard delete, soft delete, or blocked while
  others are members? Account deletion is covered nowhere in any plan, and for an app whose stated
  audience includes a dev portfolio its absence is conspicuous.
- **`tzdata` refresh policy** (PLAN.md §13). The UTC instant is derived and must be recomputed when
  zone rules change; the container's data is pinned at image build. Only matters for trips booked
  months ahead.
- ~~**Is *quiet* worth more than *helpful*?**~~ **Answered 2026-08-25: helpful when asked, quiet
  otherwise.** Nothing is volunteered, so no character is spent. PLAN-V3 §3.
- **How long may a grounded Maps result be cached?** The new load-bearing unknown, and the only
  thing blocking Phase 10's cache — which is the whole cost strategy. Maps Platform terms have
  historically restricted retention of Places content. Answer it against the service terms before
  building that half; everything else in the phase can proceed while it is open.
- **Do PLAN-V2 and PLAN-V3 still need their adversarial review?** PLAN-V2 was reviewed on
  2026-08-17. PLAN-V3 still says "draft, not started" in its header and asks for `plan-review`
  before anything is built from it, while phases 8, 11 and 12 have all shipped from it — and
  Phase 10 is now decided from it too, which raises the stakes. Either run it or record that it was
  consciously skipped.

## 5. Candidates, not commitments

Ideas with no home in any plan yet, kept here so they are argued with rather than rediscovered. The
first two follow the pattern that has worked twice — a feature that falls out of the architecture
instead of being bolted onto it, which is what conflict detection and segments both were.

- **Calendar export (`.ics`) with a correct `TZID` per event.** Most travel apps get this wrong;
  Waypoint already holds the local-plus-zone truth needed to emit it. No API, no cost, generatable
  offline, and it puts the itinerary where family already look.
- **A "next up" view.** The timeline answers *what is the plan*; nothing answers *what do I do now*.
  One screen, the next event, its countdown, in that event's own zone.
- **`source` is a column with one value.** `segments`, `lodging` and `activities` each declare
  `source: 'manual' | 'import'`, and `TimelineItem` carries it through to the client — but the
  create helpers hardcode `'manual'`, nothing ever writes `'import'`, and nothing reads it. So an
  applied import is indistinguishable from a typed-in row. Found 2026-08-24 while writing
  `imports.spec.ts`, which deliberately does not assert the field rather than pin a distinction the
  app does not make. Either set it when an import is applied — "added from your Air Canada email"
  is genuinely useful on a review screen and in a conflict explanation — or drop the enum to one
  value and stop implying a distinction exists. Small either way; the wrong move is leaving it
  looking implemented.
- **Data export and account deletion.** Closes the §4 gap above rather than adding surface.
- **Past and upcoming trips, separated.** Small, and necessary rather than nice once there are more
  than a handful.
- **Per-event reminder overrides.** Deferred once already, on the reasoning that sensible defaults
  matter more than a setting nobody opens. Revisit only if a default has actually annoyed someone on
  a real trip.
- **The commit SHA in the `/health` payload.** `/health` currently answers
  `{"status":"ok","version":"0.0.0"}` — the package version, which is the same string on every build
  ever deployed and therefore identifies nothing. Observed 2026-08-18 while checking a push landed.
  It means no deploy can be confirmed from outside as *the commit you intended*: a correct deploy and
  a skipped build are indistinguishable, which is one of the failures gate 4 exists to catch. A few
  lines in the Dockerfile to inject the SHA at build time turns every future deploy from "probably
  fine" into checkable. Not urgent enough to push alone; fold it into the next change that touches
  the server. The Account screen's build stamp covers the client and has no server-side equivalent.

### Named and rejected

**Live flight status and delay tracking.** The most obvious missing travel-app feature and the one
users would ask for first — which is exactly why the rejection is written down rather than left to
be re-proposed every few months. It needs a metered third-party API, it breaks the offline promise
on the screen that must work offline, and it puts a recurring line item against a $10/month budget.
Three of the project's non-negotiables, one feature.
