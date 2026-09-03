# Wayleaf — roadmap and the launch gates

> **This document owns two things and links out for everything else.** It owns the **gates** below,
> which no other document records, and the **order of what is left**. The build detail lives in
> PLAN.md; the strategy lives in BUSINESS-PLAN.md; what carries over from Waypoint lives in
> PORTING.md; status of what shipped lives in CLAUDE.md.
>
> Written 2026-09-03. Nothing is built yet.

## 1. The date that drives everything

**BUSINESS-PLAN §9: the ordering flow must ship no later than early October, or a full gifting
season is lost.** Photo book demand spikes hard in November–December, and a product that misses it
waits a year for the next one.

Today is **2026-09-03**. That is roughly four weeks to Phase 3, for two people.

This is the constraint the phase ordering is built around, and it is why PLAN §1a recommends the
closed beta ship **Path B only** — retroactive trips, no email ingestion. Ingestion is proven code
sitting in Waypoint and it will port confidently; it is simply not on the critical path to a
printed object, and the four weeks do not have room for anything that is not.

**If that recommendation is rejected, the October date goes with it.** Those are the same decision
and should be made once, together, rather than discovered in five weeks.

## 2. Gates

These are not a backlog. Each one blocks something specific, and the "blocks" column is the point.

| # | Gate | Blocks | Status |
|---|---|---|---|
| 1 | **Prodigi account open, real rate cards pulled** | Every number in BUSINESS-PLAN §8 — print cost, shipping, the 46% margin, the $59 price. Pricing, not building | Not started |
| 2 | **Prodigi's print specification in hand** — page sizes, bleed, colour profile, DPI minimum, spine calculation | Phase 3 — **and therefore the October date.** The PDF generator cannot be written against a guess | Not started, **and this is the schedule's real dependency** — see §5 |
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
3. **Phase 1 — Trips and photos (Path B).** EXIF, zone resolution, clustering. The hardest genuinely
   novel work in the product, and it is deliberately early because a wrong answer here invalidates
   Phases 2 and 3 rather than delaying them.
4. **Phase 2 — The digital album.** Dedupe, best-of-cluster, itinerary-grounded captions, chapters,
   editing.
5. **Phase 3 — The book and fulfilment. ⟵ the October gate.** PDF to spec, DPI floor, Stripe, the
   order state machine, Prodigi behind an interface.
6. **Phase 4 — Mobile (Expo, iOS).** After the book, because the book is what is date-constrained
   and the web client can carry a 50-household beta. **This is a real cost, stated:** the web upload
   path is a worse experience than the native one for the exact interaction the product is about,
   so the beta measures the funnel through a handicapped version of it. Read Phase 4's numbers as a
   floor, not a baseline.
7. **Phase 5 — Ingestion (Path A).** Ported from Waypoint, and its acceptance criterion re-proves
   the zone oracle rather than only the import.
8. **Phase 6 — Household tier and storage tiering.**
9. **Phase 7 — v1.5.** Suggestions, preference memory, calendar write-out, extra print SKUs.

## 5. Standing risks

Beyond BUSINESS-PLAN §12, which stands as written. These are the ones the build surfaces.

- **The October date is very tight.** Four weeks to a printed book, through three phases, two of
  which contain genuinely unsolved work. The de-scope lever is Path B only (PLAN §1a); the next
  lever after that is a single fixed book format with no layout editing, ordered from one vendor.
  **Decide the levers now, in advance, rather than in week three.**
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
- **The October date depends on a gate we do not control, and nobody has timed it.** Gate 2 blocks
  Phase 3, and Phase 3 *is* the deadline. If Prodigi takes three weeks to open an account and
  release a specification to a pre-revenue applicant, then PLAN §1a's de-scope buys four weeks for
  work that cannot start anyway, and the lever pulled was the wrong one. **This is the cheapest
  unknown on the list to close and the most expensive to discover in week three.** One email,
  today, before any code is written.
- **A shipped book is not revertible.** Every other bug in this product can be fixed with a deploy.
  A print run cannot, which is what puts the DPI floor and order idempotency in the
  non-negotiables rather than in a hardening pass.

## 6. Decisions owed

1. **Path B only for the closed beta?** PLAN §1a. Tied to the October date; decide both at once.
2. **HEIC transcode on device or server?** Recommended on device. Needs a real measurement.
3. **Web-first beta, or wait for mobile?** The sequence above assumes web-first. The cost is in §4.6.
4. **How long may a grounded Google Maps result be cached?** Inherited unanswered from Waypoint; the
   API docs carry no retention statement at all, so the silence is confirmed rather than assumed.
   Gates Phase 7 only.
5. **Whose retention clock governs a photo a collaborator uploaded?** (plan-review finding 3.) A
   Household member uploads 200 photos to a free-tier owner's trip; at 12 months the expiry job
   comes for the originals. The uploader's tier or the owner's? Deleting a paying member's
   originals breaks what they bought; keeping them because *one* member pays makes the tier
   bypassable by inviting yourself. **Recommendation: the trip owner's tier governs the trip's
   originals, and an uploader whose own tier is higher keeps a personal full-resolution copy of
   their own uploads.** That preserves both promises without making the trip the loophole — but it
   is a product and possibly a legal call, and PLAN §2e's "never consult a collaborator's plan" is
   deliberately silent here, because retention is the one place where it must be consulted.
6. **What happens to an album edit whose cluster no longer exists after a re-cluster?**
   (plan-review finding 4.) PLAN §3 requires clusters be rebuilt whenever the itinerary changes,
   and requires a user's layout edits to survive regeneration. Phase 5 forces the collision: a
   Path B album, edited, then corrected by a late import. **Recommendation: album edits pin to
   photo ids, never to cluster ids, and a re-cluster that would move an edited page is *offered*
   rather than applied** — "your itinerary changed; 3 pages can be improved" with a preview. The
   alternative, silently reflowing an album someone spent an hour on, is the same class of harm as
   losing the photos.
7. **Is the pricing fallback still reachable after §2e is built?** (plan-review finding 6.)
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
8. **Registration open, or invite-only for the beta?** Waypoint judged open registration an
   acceptable risk for a personal app. A beta that is 50 hand-held households and is accumulating
   irreplaceable data is a different calculation, and the answer is probably invite-only until
   public launch — but it should be decided rather than inherited.
9. **Does the Household tier's book credit expire?** BUSINESS-PLAN §7 assumes breakage as a revenue
   line without saying so. It changes the liability and it changes how the tier is described.
