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

Nothing below is started. Sizes are the plans' own where they gave one.

1. **Gate 1 — the Start Command investigation.** Not a phase, and the highest-value hour available.
   See above.
2. **Phase 7 — Playwright. Started 2026-08-24, and the harness is done.** PLAN-V2 §5. Steps 1, 2, 4
   and 5 are in: the `@playwright/test` harness with both servers and a throwaway database, the auth
   fixture, `@axe-core/playwright` on every screen in both themes, and the repo's first GitHub
   Actions workflow. `audit.mjs` is deleted as the plan asked; `drive.mjs` keeps its screenshot role.
   19 specs, green.

   **Step 3 is half done — these journeys are still to write:**

   - adding each timeline entity type to a trip — segment, lodging and activity. **The timezone
     assertion is done** (`timezone.spec.ts`): the browser is pinned to `America/Chicago` and the
     trip to `Europe/Lisbon`, which is the scenario `EventForm.tsx` names in a comment, and the spec
     guards its own premise so it cannot pass vacuously if the two ever coincide
   - invite and redeem, across two accounts
   - import review and apply
   - offline read, which is the app's central claim and the one PLAN.md §4 puts in writing

   The fixtures and the ports are settled, so each of these is now a spec file rather than a
   project. Note the registration rate limit — 10 per 15 minutes per IP — bounds how many accounts a
   run can create; the invite journey needs a second one, which is still well inside it.
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
- **`railway.json` is deprecated, and it is load-bearing.** Railway sunsets Config as Code on
  **2026-12-01**; the CLI warns on every command. It currently supplies `numReplicas: 1`, and the
  single-writer guarantee that PLAN.md §4 and §7 are built around rests on it — after the date the
  effective value falls back to the dashboard, where it is unset. Either set the replica count
  explicitly on the service or migrate to `.railway/railway.ts`. This also weakens PLAN-V2 §2a's
  reasoning for rejecting Terraform, which partly rested on `railway.json` covering this.
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
