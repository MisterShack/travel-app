# Wayleaf — roadmap and the launch gates

> **This document owns two things and links out for everything else.** It owns the **gates** below,
> which no other document records, and the **order of what is left**. The build detail lives in
> PLAN.md; the strategy lives in BUSINESS-PLAN.md; what carries over from Waypoint lives in
> PORTING.md; status of what shipped lives in CLAUDE.md.
>
> Written 2026-09-03. Nothing is built yet.

## 1. There is no date. There is a bar.

**Decided 2026-09-03: the October deadline is dead.** BUSINESS-PLAN §9 argued the ordering flow had
to ship by early October or lose a gifting season. David's call: people take trips all year, the
retroactive angle works all year, and Christmas is not worth the compression. **The priority is
stable, not early.**

That was the right call and the evidence was already in this document. §13 of the business plan puts
public launch in **Q1 2027**, so the only thing that would have shipped into the 2026 season was
≤20 beta books — roughly $540 of contribution margin, with no marketing and no public signup
running. The deadline was buying a season the plan does not sell into, and paying for it with four
phases compressed into four weeks and a first printed book rushed through an unvalidated colour
pipeline.

### What replaces it

A deadline is a forcing function, and removing one without replacing it is how a project drifts for
a year. **The replacement is a release bar: a set of conditions that are either met or not.** Not a
date, and not a feeling that it seems ready.

Wayleaf is ready for its first outside household when **all** of these are true:

| # | Condition | Why it is on the list |
|---|---|---|
| 1 | The restore drill has passed **twice, on different dates** — Postgres *and* R2 together, every row resolving to an object, no orphan surviving that should have been deleted | One passing drill proves the script ran. Two prove the process exists |
| 2 | **Deletion is designed, built and proven in that drill** — including that a restore does not resurrect erased data | Currently structurally impossible; §3 |
| 3 | Every **CRITICAL and HIGH** from the security review is closed, and a re-review confirms it | Webhook forgery ships free physical objects; presigned uploads are an unbounded write |
| 4 | **Gate 0 is complete** — entity, policies live on `site/`, privacy labels accurate, iOS binary accepted | It gates the binary, so it gates everything |
| 5 | A **real printed book** of a real trip is in a hand, and it is good | The one artefact a deploy cannot fix |
| 6 | **30 consecutive days** of the founders using it on their own real trips with no data incident | Time-in-use, which is the honest replacement for a date-on-a-calendar |
| 7 | Each phase's own acceptance criterion in PLAN §4 is met — **exercised, not stubbed** | Waypoint's suites were green while the app was wrong |

**Condition 6 is the one doing the work a deadline used to do.** It cannot be shortened by effort,
it cannot be argued with, and it converts "stable" from an adjective into something with a date
attached that nobody chose.

### What this changes, and what it does not

**Changes:** the phase compression is gone; Path A returns to v1 (PLAN §1a); print round trips are
affordable, so the first book can be corrected rather than shipped as-is; Prodigi's response time
stops being a schedule risk; and the beta can run calmly, which is what a 50-household hand-held
beta needs to be worth anything.

**Does not change:** seasonality is still real. Photo book demand does spike in November–December,
and a launch that lands in, say, February is trading a demand peak for stability. That is a
deliberate trade, made once, recorded here so nobody re-discovers it as a surprise. The `year in
travel` book (BUSINESS-PLAN §9 Phase 3) remains the natural December hook whenever we are ready for
one.

## 2. Gates## 2. Gates

These are not a backlog. Each one blocks something specific, and the "blocks" column is the point.

| # | Gate | Blocks | Status |
|---|---|---|---|
| 1 | **Prodigi account open, real rate cards pulled** | Every number in BUSINESS-PLAN §8 — print cost, shipping, the 46% margin, the $59 price. Pricing, not building | Not started |
| 2 | **Prodigi's print specification in hand** — page sizes, bleed, colour profile, DPI minimum, spine calculation | Phase 3. The PDF generator cannot be written against a guess | Not started. No longer a schedule risk, but still a hard block on the book |
| 3 | **Sample books ordered from three vendors and judged side by side** | Vendor choice. §12 rates print-quality complaints High and says print quality *is* the product | Not started |
| 4 | **The restore drill run — database and bucket together** | Beta. See §3 | Blocked on Phase 0 |
| 5 | **Book attach rate instrumented** | Everything downstream of launch. It is the one metric §8 says the business lives or dies on, and it cannot be measured retroactively | Phase 0 deliverable |
| 6 | **CIPO trademark filed** | The **first production print run**, not launch. §11 is explicit that a rename after a run costs an order of magnitude more | Not started |
| 7 | **`wayleaf.ca` secured** and redirected | Nothing, but it is cheap and gets more expensive the moment the name appears anywhere public | Not started |
| 8 | **Railway's current PITR offering verified** | How much of the backup pipeline we carry ourselves — never *whether* | Not started |
| 9 | **A second fulfilment vendor integrated** | Public launch. Not the beta | Blocked on 3 |

Gates 1, 2, 3, 6 and 7 need no code and can all start today. **They are the long poles**, because
they involve other companies' response times, and the code cannot overtake them.

## 3. The standing decision that inverts Waypoint's

**Backups are a hard requirement here, from the first row.** They are not a gate, not a phase, and
not deferred.

Waypoint deferred backups by an explicit, recorded decision, restated twice, with instructions not
to re-propose them. That decision was right *there*: the app was personal, the worst case was David
re-entering his own trips, and writing the deferral down was worth more than doing the work.

**It does not transfer, and this line exists so that nobody ports the reasoning along with the
code.** From the first beta household onward, the worst case is destroying photographs that cannot
be re-obtained at any price. There is no version of that which is acceptable, and no apology that
covers it.

Gate 4 therefore restores **both halves** — Postgres from `pg_dump`, and R2 — and checks that every
restored row still resolves to an object. A drill that only proves the database came back proves
the cheaper half. PLAN §1c has the argument.

The second, likelier way to lose a honeymoon is **our own deletion code**: the free tier expires
print-resolution originals after 12 months (§7), which is scheduled irreversible destruction run on
a timer. Dry-run first, always, read by a human, with a warning email and a grace period. Phase 6,
and the dry run is built before the real one.

## 4. What is left, in the order worth doing it

Phase detail and acceptance criteria are in PLAN.md §4. This is the sequence and why it is this
sequence.

1. **Gates 1, 2, 3, 6, 7 — start now, in parallel with everything.** They gate other phases and they
   run on other companies' clocks.
2. **Phase 0 — Foundation.** Postgres, R2, auth ported, the events table, the backup pipeline. The
   restore drill runs here, on the smallest dataset there will ever be, which is the only
   comfortable time to run it.
3. **Phase 1 — Capture: the phone, trips and photos (Path B).** The Expo app, camera roll,
   background upload, EXIF, zone resolution, clustering. The hardest genuinely novel work in the
   product, and it is deliberately early because a wrong answer here invalidates Phases 2 and 3
   rather than delaying them. **Mobile is here rather than after the book** — decided 2026-09-03,
   see §4a below.
4. **Phase 2 — The digital album.** Dedupe, best-of-cluster, itinerary-grounded captions, chapters,
   editing.
5. **Phase 3 — The book and fulfilment.** PDF to spec, DPI floor, Stripe, the
   order state machine, Prodigi behind an interface.
6. **Phase 4 — The web surface.** Two things at two times, neither of them the product: `site/`
   (the public page and the policies) and, later, `web/` (signed-in album editing). **`site/` ships
   during Phases 0–1 despite its number** — see §4a.
7. **Phase 5 — Ingestion (Path A).** Ported from Waypoint, and its acceptance criterion re-proves
   the zone oracle rather than only the import.
8. **Phase 6 — Household tier and storage tiering.**
9. **Phase 7 — v1.5.** Suggestions, preference memory, calendar write-out, extra print SKUs.

### 4a. Mobile moved earlier, and what that reverses

**Decided 2026-09-03: the product is mobile-first, the web is second, and the first web thing is a
landing page rather than an app.**

This reverses what this document said a day earlier. The previous sequence put mobile at Phase 4,
*after* the book, on the reasoning that "the web client can carry a 50-household beta" — with the
cost stated honestly as a handicapped funnel. **That option no longer exists**, because there is no
web app in v1 to carry anything. So mobile moves into Phase 1, which is also where it always
belonged: a browser upload path built to carry a beta would have been thrown away, and it would have
spent the time that should go into the background-upload path that *is* the product.

**Two consequences that change this table rather than merely annotating it:**

- **`site/` runs as a parallel track from Phase 0, not as Phase 4.** BUSINESS-PLAN §10's launch
  motion opens "waitlist → 50 hand-held beta households", and there is nowhere to collect a waitlist
  without a page. Pass one is static and cheap and can be built any time after the brand is settled.
- **The policies are now on the critical path, and a lawyer's turnaround is inside it.** App Store
  Connect refuses a binary with no privacy policy URL and rejects on inaccurate privacy labels. So:
  counsel → policy on `site/` → binary accepted → beta starts. **This is the argument for Gate 0
  being a gate.** Until 2026-09-03 the legal work read as a compliance obligation that could be
  chased in parallel; it is a build dependency, and it is the one dependency that no amount of
  engineering effort can shorten.

**What has not changed:** the book is still the date-constrained thing, and Phase 3 is still the
gate. Mobile moving earlier does not buy schedule — it removes a throwaway surface and adds an App
Store review cycle, which is a different shape of risk and should be estimated as one.

## 5. Standing risks

Beyond BUSINESS-PLAN §12, which stands as written. These are the ones the build surfaces.

- **With no deadline, the risk inverts: drift.** A project with no date and two part-time founders
  can stay 80% done indefinitely, and "stable" is exactly the kind of goal that recedes as you
  approach it. §1's release bar is the mitigation, and condition 6 — thirty consecutive days of real
  use — is the part that cannot be argued with. **Re-read the bar at every phase boundary and say
  which conditions moved.** A bar nobody checks is a deadline nobody set.
- **Clustering quality is the product and cannot be unit-tested into existence.** Synthetic EXIF
  fixtures contain none of the things that break it: screenshots, messaging-app copies with metadata
  stripped, the photo at 01:30 that belongs to the previous evening, the camera whose clock is
  forty minutes out. Phase 1's acceptance criterion is a real camera roll for exactly this reason.
- **HEIC is unaddressed in the business plan** and is on the critical path — no browser displays it,
  every iPhone shoots it by default, and every display derivative needs a transcode. PLAN §4 Phase 1
  recommends doing it on device; that recommendation needs measuring against a real 400-photo
  upload before it is settled.
- **Path B has no timezone oracle**, which is the asymmetry the business plan glosses when it says
  Path B "reuses the same clustering machinery." The clustering is the same; the zone resolution is
  not. PLAN §2c.
- **Gates 1–3 still run on Prodigi's clock, and nothing starts them but us.** They no longer
  threaten a date, which removes the urgency and therefore the prompt — that is the new failure
  mode. Every per-book number in BUSINESS-PLAN §8 is a guess until the rate card lands, and Phase 3
  cannot be written against a guessed print spec. **Send the email anyway.** It costs nothing and it
  is the longest-lead item on the list.
- **App Store review is a queue we do not control, and it is now upstream of the beta.** A
  rejection on privacy labels or on photo-library purpose strings costs a review cycle, and the
  first submission is the one most likely to be rejected. Submit a skeleton build early, before the
  app is finished, purely to learn what the review process says about this product.
- **A shipped book is not revertible.** Every other bug in this product can be fixed with a deploy.
  A print run cannot, which is what puts the DPI floor and order idempotency in the
  non-negotiables rather than in a hardening pass.

## 6. Decisions owed

1. ~~**The October deadline**~~ **Decided 2026-09-03: killed.** Stable beats early; §1 replaces it
   with a release bar. This resolved most of what was downstream of it.
2. **HEIC transcode on device or server?** Recommended on device. Needs a real measurement.
3. **The concierge test** — 20 households, hand-made books, ~$1,200, no code. **Recommendation: run it.** With no deadline there is no argument left against answering the existential question before building for it.
4. **Does ingestion (Path A) move ahead of the album?** Both paths are in v1 either way — that was
   settled when the deadline died (PLAN §1a). This is only about order. **Recommendation: yes, move
   it.** Phase 5's acceptance criterion is the only test that actually proves §2c, the product's
   central technical claim; and building the album against clusters a later import will re-derive
   means either building the edit-preservation machinery twice or finding the conflict late. The
   cost is that the album — the thing that makes the product feel real — arrives later.
5. ~~**Web-first beta, or wait for mobile?**~~ **Decided 2026-09-03: mobile-first.** The web's first
   job is a landing page and the policies; signed-in album editing is a later addition. §4a records
   what that reversed and what it puts on the critical path.
6. **How long may a grounded Google Maps result be cached?** Inherited unanswered from Waypoint; the
   API docs carry no retention statement at all, so the silence is confirmed rather than assumed.
   Gates Phase 7 only.
7. **Whose retention clock governs a photo a collaborator uploaded?** (plan-review finding 3.) A
   Household member uploads 200 photos to a free-tier owner's trip; at 12 months the expiry job
   comes for the originals. The uploader's tier or the owner's? Deleting a paying member's
   originals breaks what they bought; keeping them because *one* member pays makes the tier
   bypassable by inviting yourself. **Recommendation: the trip owner's tier governs the trip's
   originals, and an uploader whose own tier is higher keeps a personal full-resolution copy of
   their own uploads.** That preserves both promises without making the trip the loophole — but it
   is a product and possibly a legal call, and PLAN §2e's "never consult a collaborator's plan" is
   deliberately silent here, because retention is the one place where it must be consulted.
8. **What happens to an album edit whose cluster no longer exists after a re-cluster?**
   (plan-review finding 4.) PLAN §3 requires clusters be rebuilt whenever the itinerary changes,
   and requires a user's layout edits to survive regeneration. Phase 5 forces the collision: a
   Path B album, edited, then corrected by a late import. **Recommendation: album edits pin to
   photo ids, never to cluster ids, and a re-cluster that would move an edited page is *offered*
   rather than applied** — "your itinerary changed; 3 pages can be improved" with a preview. The
   alternative, silently reflowing an album someone spent an hour on, is the same class of harm as
   losing the photos.
9. **Is the pricing fallback still reachable after §2e is built?** (plan-review finding 6.)
   BUSINESS-PLAN §12 names "flip to Model B faster" as the response if attach rate disappoints.
   Model B is a paywall before value — and PLAN §2e instructs that the membership module be
   written so a plan check has *nowhere to go* on participation paths, which is precisely what
   Model B needs. The plan builds a commitment against its own stated fallback and does not say so.
   **Recommendation: accept the commitment and write the cost down rather than hedging it.** A seam
   kept open "in case" is a seam nobody tests and a paywall nobody notices creeping back in; the
   collaborator loop is the cheapest acquisition channel in the business and half-committing to it
   gets its downside without its upside. But the cost is real — reversing means reopening the
   membership module and every participation path — and it should be a decision rather than a
   discovery.
10. **Registration open, or invite-only for the beta?** Waypoint judged open registration an
   acceptable risk for a personal app. A beta that is 50 hand-held households and is accumulating
   irreplaceable data is a different calculation, and the answer is probably invite-only until
   public launch — but it should be decided rather than inherited.
11. **Does the Household tier's book credit expire?** BUSINESS-PLAN §7 assumes breakage as a revenue
   line without saying so. It changes the liability and it changes how the tier is described.
