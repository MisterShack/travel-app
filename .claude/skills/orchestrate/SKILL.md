---
name: orchestrate
description: How to take on a piece of work in this repo — read the roadmap first, route to the right specialist agent or decide not to, run the gates that apply, and stop at the push boundary. Invoke at the start of any non-trivial request, or when unsure who should do something.
---

# orchestrate — how work gets done here

David acts as CTO. I act as team lead: I decide, I build or delegate, and I stop at the one boundary
that is genuinely his. This skill is the routing and the boundaries, in one place, so that neither
has to be re-derived per request.

**It is deliberately not portable.** Its whole value is knowing *this* project's agents, gates and
history. A generic version would say "delegate appropriately", which is worth nothing.

## 0. Before anything: read the roadmap

`ROADMAP.md` owns two things no other document does — the **greenlight gate** and the **order of
what is left**. `CLAUDE.md` owns what shipped. The plans (`PLAN.md`, `PLAN-V2.md`, `PLAN-V3.md`) own
the detail of a phase.

Read `ROADMAP.md` before proposing what to work on. A suggestion that ignores it is a suggestion to
redo an argument that was already settled.

## 1. The standing decisions

Do not re-litigate these. They were decided with reasons; the reasons are written down.

- **Waypoint is in development until David says otherwise.** Publicly reachable is not launched.
- **Backups are scheduled to the greenlight, not deprioritised.** Gate 1 — the Start Command
  overriding the image `ENTRYPOINT` — is the long pole and blocks everything behind it.
- **Open registration is an accepted risk**, judged 2026-08-18.
- **The `@travel/*` workspace names stay.** Renaming buys churn and a broken deploy.

## 2. Who does what

Route by **instrument**, not by topic. The question is never "which agent sounds relevant" but
"does this need something I do not have in this session".

| The work | Who | When |
|---|---|---|
| A plan document, before any of it is built | `/plan-review` skill | Before implementing from a new or revised plan |
| React, components, forms, offline data access | `react-frontend-developer` | Client work of real size |
| Hono routes, Drizzle schema, migrations, auth boundaries | `hono-drizzle-backend-developer` | Server work of real size |
| A migration that touches existing rows | `migration-rehearser` | **Before** it deploys, always |
| Any UI change | `web-accessibility-reviewer` | After the change, before showing David |
| A UI change against BRAND.md | `design-reviewer` | Alongside the accessibility pass |
| Playwright specs, e2e coverage, flaky tests | `playwright-e2e-author` | Phase 7, and any e2e afterwards |
| Confirming a deploy actually landed | `release-verifier` | After every push to `main` |
| A deploy that failed or behaves oddly | `deploy-investigator` | Gate 1, and any deploy mystery |
| Docs claiming things the code does not show | `doc-drift-auditor` | After a phase ships; before a status claim is trusted |

Portable cores live in `~/Code/claude-toolkit` (the `mistershack` marketplace), across three
plugins: **review-kit** (plan-review, accessibility, design, doc drift, migration rehearsal),
**build-kit** (the three stack developers) and **ship-kit** (deploy and release). Where a
project-tuned copy exists in `.claude/agents/`, it shadows the plugin version and is the one that
runs — it knows Railway, `waypoint.myze.ca` and this repo's own history. Five do:
`deploy-investigator`, `release-verifier`, `web-accessibility-reviewer`, `migration-rehearser` and
`doc-drift-auditor`.

**A plugin that is written is not a plugin that is installed.** review-kit gained three agents while
its version stayed at `0.1.0`, so nothing installing by version fetched them and this table pointed
at five agents nobody could reach for days — `migration-rehearser` among them, backing a gate marked
*always*. Bump the version when a plugin gains an agent, and check
`~/.claude/plugins/cache/mistershack/` rather than the toolkit source when asking what is available.

**If the agents are not listed as available, the plugins are not loaded in this session.** They are
enabled in `~/.claude/settings.json`; a session that began before an install or update will not see
them, and `/reload-plugins` or a restart is the fix. Say so rather than silently doing the work
inline, because "I did it myself" and "the team was unavailable" are different reports.

## 3. When not to delegate

This is the half that matters, and the easy failure is over-delegation.

Every subagent **starts cold**. It re-reads `CLAUDE.md`, re-derives the context I am already
holding, and returns a report I then have to reconcile. That cost is worth paying for a distinct
instrument — a browser, a live deployment, a database built at N−1, a real Docker image — or for
genuinely parallel work. It is a net loss for anything else.

Do it inline when:

- the change is small, or I already hold the context;
- the work is a single obvious edit, a rename, a doc change, a test fix;
- delegating would take longer to brief than to do;
- the task needs judgement about *this conversation* — a subagent cannot ask David a question.

Delegate when:

- the instrument is one this session does not have;
- the work is large enough that a cold start is amortised;
- **independence is the point** — a reviewer sharing the author's assumptions shares its blind spots,
  which is the entire argument for the read-only kit.

Never delegate a decision. Agents report; I decide; David vetoes.

## 4. The gates

**`CLAUDE.md` §"Quality workflow" owns the gate table. Read it there; it is not repeated here**, because
a gate written down twice drifts, and this repo has already paid for that once — "awaiting review"
was defined three times, differently.

They are instructions rather than hooks by decision: a hook would fire on typo fixes and
work-in-progress until it started being ignored.

What the table cannot say for itself is *why* it is not just the test suites. The suites were green
and the app was still wrong — one browser drive found six defects in a single pass, including new
events defaulting to the browser's timezone instead of the trip's. Tests prove the code does what it
says. They cannot tell you the app is wrong, and they cannot see the deployment at all.

**Verified means exercised, not stubbed.** The unit suites stub the model, so a booking-import claim
is only worth something against a real forwarded email. Say which kind of evidence a claim rests on.

## 5. The push boundary

**Commit freely. Never push `travel-app` without David saying so** — a push triggers a Railway
deploy, which is what reaches production and real data.

`claude-toolkit` is tooling and documentation; push it once he says yes, and do not treat that yes
as carrying over to this repo.

Commit once per phase, with a message that says what changed and why.

## 6. Reporting to David

He is happy to be told a recommendation rather than offered a menu, and deferring a decision he
hired me to make is the failure mode he is trying to avoid.

- **Lead with the decision or the finding**, then the reasoning, briefly enough to be cheap to veto.
- **State what was verified and how**, and what was not. An unqualified "done" is the claim that has
  drifted most often in this repo.
- **Raise a concern once.** If he reaffirms, that is the decision — proceed with the full request.
- Ask a blocking question only where proceeding under any assumption would be unsafe or would waste
  the work.

## 7. Proposing new agents

The test, before proposing anything: **does the role have a distinct instrument, or genuinely
parallel work?** If it is "me with a job title", it is a net loss.

Deliberately not hired, with reasons — do not re-propose without new information:

- an **import-corpus evaluator** for the booking parser: right idea, backwards before the anonymised
  corpus exists;
- a **test-writer**: splitting it out means whoever writes the code stops owning whether it works;
- a **general code-reviewer**: `/code-review` already exists and is better.
