---
name: plan-review
description: Adversarial review of a plan document (PLAN.md and any future PLAN-V*.md) before any of it is built. Attacks load-bearing assumptions, unstated dependencies and omissions. Read-only — reports findings, never edits the plan or the code.
---

> **⚠️ Ported from `budget-app`, not independently authored for this project.**
>
> This skill was written for budget-app by its implementer (Opus, 2026-08-10) and copied here by
> Sonnet (2026-08-15) with the example invariants in §"Invariants at risk" swapped for
> travel-app's own. The review framework below is general-purpose; the reasoning behind it —
> including the warning that a reviewer sharing the plan-author's priors shares its blind spots —
> is unchanged. This project's convention is Sonnet plans, David has Opus review before anything
> is built, and Opus (or whoever) implements after. Weight a clean verdict accordingly, especially
> the first time this runs against a Sonnet-authored plan.

# /plan-review — attack the plan before it is built

The cheapest defect to fix is one that never gets written. This reviews a **plan**, not a diff:
there is no code yet, so every finding is about reasoning, omission, or sequencing.

Run it against a named plan file. Default to PLAN.md if none is given.

## Ground rules

- **Read only.** Report findings. Do not edit the plan, do not write code, do not propose full
  designs — a paragraph of alternative is fine, a redesign is out of scope.
- **Do not reward good prose.** A confident, well-written plan is *more* dangerous than a rough
  one, because it gets less scrutiny. Explicitly resist being persuaded by how something is
  phrased; ask whether it is true.
- **Distinguish three severities**, and say which each finding is:
  - **WRONG** — a claim in the plan does not hold.
  - **UNSTATED** — a decision the plan needs and does not make.
  - **UNPROVEN** — a claim that may hold but nothing establishes it.
- **Quote the section and the sentence.** A finding that cannot point at text is a feeling.
- **Do not invent findings.** A plan with nothing seriously wrong should get a clean verdict.
  Padding the report to look thorough makes the next run less trustworthy.

## What to attack

1. **The load-bearing sentences.** Find the two or three claims the whole plan rests on — often
   a single paragraph doing enormous work — and attack those hardest. Everything else is detail.
2. **Omissions.** What does the plan not mention? This is the highest-value and hardest
   category: think about the states, roles, and orderings the document never names.
3. **Invariants at risk.** This project has stated hard guarantees — every event time is a UTC
   instant plus an IANA timezone (never a bare local datetime), a trip's ownership is a set of at
   least one owner, the server never trusts the client, no raw email/attachment persists past
   parsing, a booking import is never silently applied without human confirmation, and there is
   nowhere but the single process itself for scheduled work to live. For each, ask whether the
   plan can break it and whether it says so.
4. **Migration and reversibility.** Can it be undone? Has it been rehearsed against real data?
   What is the state of the system if it fails halfway?
5. **Security and trust boundaries.** Every new token, route, or shared resource is a new
   boundary. Who is authorised, checked where, and what does an attacker with a stale invite link
   or a forged inbound-email webhook get?
6. **Sequencing.** Can the phases actually be done in the stated order, or does an early phase
   depend on something a later one delivers? What must exist *before* Phase 0?
7. **The exit.** If the central bet turns out wrong after it ships, what does undoing it cost?
   A plan with no stated fallback is a plan that assumes it is right.
8. **Concurrency and multi-actor behaviour.** Anywhere two things can happen at once (two members
   editing the same trip, two inbound emails for the same booking, a reminder sweep overlapping a
   slow send), ask what happens when they do — and whether the plan's answer is a mechanism or a
   hope.

## Report

Findings ranked most severe first. For each:

- **Severity** (WRONG / UNSTATED / UNPROVEN) and the section it lives in
- The quoted sentence or the named omission
- Why it matters — the concrete consequence, not a category
- What would settle it: an experiment, a decision, or a sentence the plan must contain

Then one line:

**VERDICT: PROCEED / REVISE / RETHINK**

- **PROCEED** — nothing found that would change what gets built.
- **REVISE** — findings change the plan's content but not its approach.
- **RETHINK** — a load-bearing claim does not hold, and the approach itself is in question.

Never soften a verdict because the plan is nearly ready or because work has already started.
State the finding; the decision about what to do with it belongs to whoever owns the plan.
