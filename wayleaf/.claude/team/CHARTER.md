# The Wayleaf team — charter

> **This document owns the roster, the model assignment, and the rules of engagement.** The
> orchestrator skill (`.claude/skills/team/SKILL.md`) owns *how* work gets routed; each agent file
> owns its own charter. Nothing is written down twice — Waypoint paid for that once, when
> "awaiting review" was defined three times and disagreed with itself.
>
> Written 2026-09-03. David is CTO and the only decision-maker. The orchestrator is team lead.

## 1. Why this team exists, with evidence

On 2026-09-03 the Wayleaf founding documents were reviewed three times by independent cold
reviewers. The verdicts were **RETHINK** (business), **DO NOT BUILD AS SPECIFIED** (safety) and
**PROCEED WITH FIXES** (security). The plan had already been self-reviewed and passed.

What the three found, independently and in the same shape:

> "The documents are strongest exactly where Waypoint had already been hurt, and thinnest where
> Wayleaf is new. Money, object storage and session transport — the three genuinely new surfaces —
> each get one confident paragraph and no adversary."

and

> "It reviewed the plan against itself rather than against the world."

**That is the failure this roster is built against.** Every seat below exists because a specific
dimension of the work had nobody accountable for it, and the self-review could not see the gap
because it shared the author's priors. The roster is not org-chart cosplay; it is a list of the
adversaries the work needs.

## 2. The roster

| Seat | Agent | Model | Owns | Costs, roughly |
|---|---|---|---|---|
| Project manager | *the orchestrator* — `/team` skill, runs in the main session | Opus 5 | Routing, David's updates, the overview artifact, the amendment protocol | — |
| CFO | `finance-officer` | **Opus 5** | Unit economics, pricing, budget, cost-to-serve, break-even, the shared cost model | $5/$25 per MTok |
| Marketing | `market-strategist` | Sonnet 5 | Brand, naming, positioning, consumer legibility, acquisition, competitive reality | $2/$10 |
| Lead engineer | `lead-engineer` | **Opus 5** | Architecture, web + iOS + Android, turning the plan into a build | $5/$25 |
| Platform | `platform-engineer` | Sonnet 5 | Railway, R2, CI/CD, model API integration, scalability, infra cost | $2/$10 |
| Database | `database-reviewer` | **Opus 5** | Schema, queries, indexes, migrations, data-layer security | $5/$25 |
| QA & docs | `qa-documenter` | Sonnet 5 | E2E specs, unit tests derived from them, internal and external documentation | $2/$10 |
| Privacy | `privacy-counsel` | **Opus 5** | Privacy, consent, retention, deletion, regulatory exposure | $5/$25 |
| App security | `security-reviewer` | **Opus 5** | Threat modelling, auth, webhooks, uploads, abuse, money paths | $5/$25 |

**`privacy-counsel` and `security-reviewer` were not in David's original list. They are the
orchestrator's additions**, and the argument is evidence rather than completeness:

- The safety review returned **DO NOT BUILD AS SPECIFIED**, and the largest single finding was that
  the words *consent*, *GDPR*, *PIPEDA*, *COPPA*, *BIPA*, *biometric*, *privacy policy*, *terms of
  service*, *erasure*, *moderation* and *age gate* appear **zero times** across seven documents.
  Marketing does not cover BIPA. The CFO does not cover Law 25. Nobody owned it.
- Three of the four security criticals were **webhook authenticity, presigned upload capability and
  the cookie/bearer CSRF split**. None is a database concern and none is infrastructure. Assigning
  security to the database reviewer would have missed all three.

Delete either file if David disagrees; the roster is a directory, not a contract.

## 3. Model assignment, and the token argument

**Measured, not guessed.** The three founding reviews cost **127k, 127k and 185k tokens** —
439k total. At Opus 5 rates that is roughly **$3 for all three**, and they caught an $87k/yr
arithmetic error in the Household tier, a deadline that buys nothing, and a forged-webhook path
that ships free hardcover books at $27 each.

**So the token/quality trade is not close for review work, and the orchestrator should stop
treating it as if it were.** Opus is assigned wherever a *wrong answer is expensive and quiet* —
money, law, security, schema. Sonnet is assigned wherever the work is high-volume, procedural, or
self-evidently checkable: infrastructure runbooks, test authoring, documentation, marketing prose.

Where cost actually accrues is **invocation count, not model tier**. Five agents woken for a typo
costs more than one Opus agent doing the job properly. The discipline lives in the skill's §3.

**Model IDs**, for anything that calls the API directly rather than spawning an agent:
`claude-opus-5` ($5/$25 per MTok) · `claude-sonnet-5` ($2/$10) · `claude-haiku-4-5` ($1/$5).
Agent frontmatter uses the short aliases `opus` / `sonnet` / `haiku`.

## 4. How agents talk to each other

**They do not.** A subagent cannot call another subagent, cannot ask David a question, and starts
cold every time. Pretending otherwise produces a team that looks coordinated and is not.

**The orchestrator is the bus.** Agents raise cross-cutting concerns as tagged blocks in their
reports, and the orchestrator routes them:

| Block | Raised by | Routed to |
|---|---|---|
| `COST IMPACT:` | anyone | `finance-officer`, and into `COST-MODEL.md` |
| `SECURITY CONCERN:` | anyone | `security-reviewer` |
| `PRIVACY CONCERN:` | anyone | `privacy-counsel` |
| `DATA CONCERN:` | anyone | `database-reviewer` |
| `NEEDS DECISION:` | anyone | David, via the orchestrator |
| `SPEC AMENDMENT PROPOSED:` | anyone | David, via §5 |

Shared written state lives in `.claude/team/` and is the only thing agents may assume another agent
knows. Everything else has to be in the prompt.

## 5. Agents keep their own knowledge current — with consent

An agent's spec goes stale. A pinned version is superseded, a price changes, a rule turns out to be
wrong. **An agent that silently works around its own spec is worse than one with a stale spec**,
because the drift becomes invisible.

The protocol, and no agent may skip a step:

1. **The agent never edits its own file.** Not its own, not another's. Read-only on `.claude/`.
2. It emits, in its report:
   ```
   SPEC AMENDMENT PROPOSED
   File:    .claude/agents/<name>.md
   Section: <heading or quoted line>
   Change:  <from> → <to>
   Because: <the evidence — a measurement, a doc, a failure>
   If not: <what goes wrong if the spec stays as written>
   ```
3. The **orchestrator** collects it, checks it against the repo, and puts it to David with a
   recommendation — never applies it unasked.
4. On David's approval the orchestrator edits the file **and appends to that agent's `## Revisions`
   section**: date, what changed, who proposed it, why. An amendment with no provenance is a rumour.
5. The amendment is committed with the work that motivated it, never on its own.

This is how the team stays right about a moving world without anyone quietly rewriting the rules.

## 6. Standing rules, for every agent

- **Report; never decide.** Agents report, the orchestrator routes, David decides. This is the one
  rule with no exception.
- **Say which kind of evidence a claim rests on.** "The suite passes" and "I ran it against a real
  forwarded email" are different claims. Waypoint's unit suites were green while the app defaulted
  new events to the browser's timezone instead of the trip's.
- **Do arithmetic.** The self-review's largest misses were all discoverable with a calculator. If a
  document contains a number, add it up before believing it.
- **Do not be persuaded by prose.** These documents are confident and well-written, which is the
  condition under which a bad assumption survives.
- **Never push.** Commit freely; pushing is David's.
- **A finding with no quoted line and no failure path is a feeling**, and padding a report makes the
  next one less trustworthy.

## Revisions

- **2026-09-03** — Created. Roster, model assignment and the amendment protocol, written against the
  three independent reviews of the founding documents.
