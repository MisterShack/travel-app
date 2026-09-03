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

## Owed — see ROADMAP §6 for the full statements and recommendations

| # | Decision | Recommendation | Cost of getting it wrong |
|---|---|---|---|
| 1 | **The October deadline** | Kill it. §13 puts public launch in Q1 2027, so there is no 2026 season to catch, and the date is the origin of most of the compression | Four phases in four weeks, and the first printed book through an unvalidated colour pipeline |
| 2 | **Concierge test before code** | Run it. ~$1,200, no code, answers the existential question months before the product could | Committing the hardest engineering in the plan before knowing anyone buys |
| 3 | Path B only for the beta | Tied to #1; decide together | — |
| 4 | Household tier pricing, given the corrected arithmetic | Rebuild §8 with the credit book as a cost line first | The only recurring revenue line is ~8× overstated |
| 5 | Face scoring: detection or cross-image matching | Specify explicitly before Phase 2 is scoped | BIPA carries statutory damages and a private right of action |
| 6 | Gate 0 (legal) before the first beta upload | Add it | 50 real families' photographs in a system with no lawful basis |
| 7 | HEIC transcode: device or server | Device, pending measurement | Server-side re-encode is where EXIF stripping lives |
| 8 | Retention clock for a collaborator's uploads | Owner's tier governs the trip; uploader keeps a personal copy | It is the expiry job's `WHERE` clause |
| 9 | Registration open or invite-only for beta | Invite-only | Open registration plus plus-addressing defeats every per-account cap |
