# Spec amendments

> The log of every change made to an agent's own specification, and who asked for it.
> The protocol is `CHARTER.md` §5. **No agent edits its own file**; the orchestrator applies an
> amendment only after David approves it, and appends here and to the agent's own `## Revisions`.
>
> This exists so the team can stay right about a moving world without anyone quietly rewriting the
> rules. An amendment with no provenance is a rumour, and a spec that drifts silently is worse than
> one that is stale — the drift becomes invisible.

## Why an agent proposes rather than edits

An agent that works around its own spec has made a decision. Agents do not make decisions. The
proposal format forces the reasoning into the open where David can see it, and the log means a rule
can always be traced back to the evidence that changed it.

## Format

```
SPEC AMENDMENT PROPOSED
File:    .claude/agents/<name>.md
Section: <heading or quoted line>
Change:  <from> → <to>
Because: <the evidence — a measurement, a vendor doc, an observed failure>
If not:  <what goes wrong if the spec stays as written>
```

## Log

| Date | File | Change | Proposed by | Approved | Evidence |
|---|---|---|---|---|---|
| — | — | *No amendments yet. The team was created 2026-09-03.* | — | — | — |
