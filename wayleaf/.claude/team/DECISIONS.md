# Decisions

> **David decides. This is the record.** The orchestrator appends; nobody else writes here.
> A decision that is not in this file has not been made, whatever a document implies.
>
> Every entry: the date, the decision, the reasoning in one or two lines, and what it forecloses.
> The last part matters most — Waypoint's documents are full of decisions whose cost nobody wrote
> down, and the cost is what someone re-litigates six months later.

## Made

| Date | Decision | Reasoning | Forecloses |
|---|---|---|---|
| 2026-09-03 | **Wayleaf is a new repository; Waypoint is frozen** | A clean slate on Postgres/R2 without legacy deploy state; the port is deliberate and ledgered in `PORTING.md` | Reusing Waypoint's live deployment, database or domain |
| 2026-09-03 | **Plan documents before code** | The repo's own convention; a spec reviewed before it is built is the cheapest defect to fix | Nothing — code follows |
| 2026-09-03 | **Independent review over self-review** | The self-review passed a plan three cold reviewers rejected, and cost ~$3 to disprove | Trusting a single reviewer that shares the author's priors |
| 2026-09-03 | **The October deadline is killed** | People travel year-round and the retroactive angle sells year-round; §13 already put public launch in Q1 2027, so the deadline bought a season the plan does not sell into. Stable beats early | Optimising for the 2026 gifting spike. Seasonality is real and this trades a demand peak for stability — a deliberate trade, made once |
| 2026-09-03 | **Both entry paths ship in v1** | Follows from the above. The Path B-only de-scope cut ~3 days of proven ported code and kept the hardest unsolved problem, and it left the moat half unbuilt | Nothing — only the order remains open (§6.4) |
| 2026-09-03 | **Display type is Fraunces, text is Inter; the mark is the leaf-as-open-book** | Fraunces' SOFT/WONK axes give letterpress warmth without pastiche; Inter stays neutral in the app because photographs supply the character. The mark was picked from four candidates rendered at 16–120px in both themes | Fraunces in app chrome — it is a marketing-surface face only |
| 2026-09-03 | **`wayleaf.app` is the primary domain; `wayleaf.ca` 301s to it** | `.app` is HSTS-preloaded at the TLD level, so HTTPS is enforced by browsers with no opt-out, and it is already what `astro.config.mjs` declares. `.ca` is defensive | Changing the primary later — it would invalidate every indexed URL, social card and shared link |
| 2026-09-03 | **`site/` deploys to Cloudflare Pages, not the API origin** | Free static host on infrastructure already in use for R2; automatic SSL; a copy tweak no longer triggers an API deploy against live data | Serving marketing from Railway |
| 2026-09-03 | **Mobile-first; web is a landing page first and an album editor later** | Photos originate on the phone, camera-roll permission is the product, push exists nowhere else. The web's launch job is to explain the product and host the policies | A web-carried beta — that option is gone, so mobile moves into Phase 1. Adds an App Store review cycle upstream of the beta, and puts counsel's turnaround on the critical path via the privacy policy URL |

## Owed — see ROADMAP §6 for the full statements and recommendations

| # | Decision | Recommendation | Cost of getting it wrong |
|---|---|---|---|
| 1 | **Concierge test before code** | Run it. ~$1,200, no code, answers the existential question before the product could. With no deadline there is no argument left against it | Committing the hardest engineering in the plan before knowing anyone buys |
| 2 | **Does ingestion move ahead of the album?** | Yes. Phase 5's criterion is the only test that proves §2c, and the album should be built once against final clusters | Building edit-preservation twice, or finding the re-cluster conflict late |
| 3 | **Does `hello@wayleaf.app` exist?** | Create it before the page is announced, via Cloudflare Email Routing | It is printed on the page twice and is the only route a person has to ask for their address to be deleted |
| 4 | **Grab `wayleaf.com`?** | Yes if still free at retail. Redirect it the same way as `.ca` | The customer is 30–50 buying a physical object; `.com` carries trust with that person. BUSINESS-PLAN §11 assumed it was taken and it appears not to be |
| 4 | Household tier pricing, given the corrected arithmetic | Rebuild §8 with the credit book as a cost line first | The only recurring revenue line is ~8× overstated |
| 5 | Face scoring: detection or cross-image matching | Specify explicitly before Phase 2 is scoped | BIPA carries statutory damages and a private right of action |
| 6 | Gate 0 (legal) before the first beta upload | Add it | 50 real families' photographs in a system with no lawful basis |
| 7 | HEIC transcode: device or server | Device, pending measurement | Server-side re-encode is where EXIF stripping lives |
| 8 | Retention clock for a collaborator's uploads | Owner's tier governs the trip; uploader keeps a personal copy | It is the expiry job's `WHERE` clause |
| 9 | Registration open or invite-only for beta | Invite-only | Open registration plus plus-addressing defeats every per-account cap |
