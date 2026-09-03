# Cost model

> **`finance-officer` is the only agent that edits this file.** Everyone else feeds it with
> `COST IMPACT:` blocks. Every figure carries its source and the date it was obtained, because a
> number with neither is a rumour that will be quoted back as fact in three weeks.
>
> **Status: unbuilt.** The figures below are the founding plan's, and the review found three of them
> wrong. They are recorded here as *claims to correct*, not as a model.

## How a figure is qualified

| Tag | Means |
|---|---|
| `MEASURED` | We ran it and observed it. Date and method recorded. |
| `QUOTED` | A vendor's published or written price. Source and date recorded. |
| `ESTIMATE` | Constructed from category norms. **Never load-bearing without saying so at the point of use.** |

The founding plan's failure was letting all three sit in one table looking alike, then leaning on the
`ESTIMATE` rows in the milestone schedule and the phase ordering as though they were `QUOTED`.

## Open corrections — carried from the 2026-09-03 review

| # | Claim | Status |
|---|---|---|
| 1 | Household tier contributes **$57.35**/user/yr | **Wrong.** Never deducts the ~$27 cost of the included credit book. Nearer **$7.50**. Blocks: the tier's viability, and the plan's only recurring revenue line. |
| 2 | AI assembly "only fires when a user actually builds a book" | **Wrong.** Phase 2 runs it for the free digital album. Free users go from **+$0.35 to −$1.45**/yr. |
| 3 | No CAC line exists | **Missing.** Model assumes $0 paid acquisition and never says so. Add the row with an explicit $0 and the sentence naming what breaks above it. |
| 4 | "~25 books/month covers a $600 infra bill" | Mixes scales — $600 is a ~1,000 MAU figure, not a beta one. |
| 5 | Cloudflare Images free tier | Beta volumes are ~40,000 transforms/month against a 5,000 free tier. Small money; the estimate was never multiplied out. |

## Claude model rates — `QUOTED` 2026-09-03

| Model | ID | Input $/MTok | Output $/MTok |
|---|---|---|---|
| Opus 5 | `claude-opus-5` | $5.00 | $25.00 |
| Sonnet 5 | `claude-sonnet-5` | $2.00 | $10.00 |
| Haiku 4.5 | `claude-haiku-4-5` | $1.00 | $5.00 |

Prompt caching cuts repeated-prefix input by ~90%; Batch is ~50%. **`MEASURED` 2026-09-03:** the
three founding reviews cost 127k + 127k + 185k = 439k tokens, roughly **$3 total** at Opus rates.

## Infrastructure — all `ESTIMATE` until `platform-engineer` returns real figures

Cloudflare R2 $0.015/GB-month standard, $0.01 infrequent access, **zero egress**, Class B reads
$0.36/million. Railway Hobby $5–25/month. Apple $99/year, Google Play $25 one-time.

Closed-beta target ~$40/month. **Unvalidated**, and correction 5 above already dents it.

## Blocked on

Gates 1 and 2 in `ROADMAP.md` — a Prodigi account and real rate cards. **Every per-book figure in
BUSINESS-PLAN §8 is a guess until those land**, and the whole retail price rests on them.
