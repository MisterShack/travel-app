# infra

There is no Terraform here, and that is the finding rather than an omission.

PLAN-V2 §2a checked what the community Railway provider can manage and found that it has **no
`volume` resource**, and no way to own the **Start Command** or the **Watch Paths**. Those are
precisely the three settings on this deployment that have actually gone wrong:

| Setting | What happens when it is wrong | Terraform |
|---|---|---|
| Volume mount path | Mounting anywhere but `/data` works perfectly and silently discards every account and trip on each deploy | Cannot manage |
| Start Command | A custom one overrides the image's `ENTRYPOINT`, so `entrypoint.sh` never runs and Litestream never starts | Cannot manage |
| Watch Paths | Railway silently skips deploys; the push succeeds and the running code stays as it was | Cannot manage |
| `numReplicas` | Two writers on one SQLite file, and two reminder sweeps racing to send the same notification | `railway.json` declares it, but the live service can still differ |

So Terraform would codify the project, the service, the variables and the domain — the parts that
have never broken — while leaving the dangerous parts exactly as manual as they are today, and
adding the impression that the infrastructure is now under control. PLAN-V2 §7 asks openly whether
that is worth it. This directory is the answer that survives either verdict: **build the check that
covers the failures we have really had, and decide about Terraform separately.**

## Running it

```sh
RAILWAY_API_TOKEN=... RAILWAY_PROJECT_ID=... npm run check-drift
```

| Variable | |
|---|---|
| `RAILWAY_API_TOKEN` | An account or team token (railway.com → Account → Tokens). Or `RAILWAY_TOKEN` for a project token. |
| `RAILWAY_PROJECT_ID` | The project's UUID, from its dashboard URL. |
| `RAILWAY_ENVIRONMENT_NAME` | Optional, defaults to `production`. |
| `RAILWAY_SERVICE_NAME` | Optional, defaults to `travel-app`. |

Exit codes carry the meaning, and the third one is the reason this is worth writing carefully:

| Code | |
|---|---|
| `0` | Every assertion held. Warnings may still be printed. |
| `1` | Drift. The output names the setting, what it costs, and which document explains it. |
| `2` | **The check could not run** — no token, no network, or the API's schema has moved. |

`2` is never reported as `0`. A checker that says "OK" when it inspected nothing converts an
unknown into a false assurance, which is worse than having no checker at all.

## Layout

- `drift.mjs` — the rules and the GraphQL queries. Pure functions, no I/O.
- `check-drift.mjs` — the runner: env, network, exit codes.
- `drift.test.mjs` — the rules against fixtures, via `node --test`. No dependency, no network.

The split is the same one the Svix webhook uses: the logic is testable without a network, so the
rules can be proved right on a machine that has no Railway token. `npm test` runs them.

## Expect one warning today

The production service has a custom Start Command, deliberately — clearing it crashed the deploy
on 2026-08-15, the cause is still unknown, and it was rolled back (DEPLOY.md §5). The check grades
that finding rather than failing on it, because a check that fails from its first run is one people
learn to ignore, and this project has already written down what that costs.

It is a **warning** while `LITESTREAM_BUCKET` is unset and becomes a **failure** the moment a bucket
is set — which is exactly when it stops being harmless, because every variable would be present,
the dashboard would look configured, the app would be healthy, and nothing would replicate.

## What has been verified

All three GraphQL queries were sent to the live API on 2026-08-17 and validate against its schema:
GraphQL checks the whole document before executing, and the errors returned were `Project not
found` and `Not Authorized` rather than `Cannot query field`. Every field and argument named here
exists.

Not yet verified, because the machine this was written on has no Railway token: the runtime shape
of the responses, and that an account token carries the permissions these queries need. **The first
run with a real token is still the one that proves it works** — but it either passes or exits `2`
telling you what to fix. It cannot quietly succeed.
