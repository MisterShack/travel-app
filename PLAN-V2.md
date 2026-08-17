# Waypoint — Plan V2: infrastructure as code, and browser testing

> **Status: reviewed 2026-08-17, partly built.** Authored by Opus on 2026-08-15 from a scoping
> request by David. Provider capabilities in §2 were checked against the registries and
> repositories on that date rather than assumed — see §2a for what that check found, because it
> changes the plan's shape.
>
> **`plan-review` was run on 2026-08-17 and returned REVISE**, before any HCL was written and after
> Phase 6 step 3 had shipped. Ten findings; the four that changed this document most:
>
> 1. §3 forbade secrets in state while §4 step 2 imported the variables — which is exactly how
>    secrets get into state. §3 wins; variables are no longer imported.
> 2. Terraform managing variables plus an R2 bucket made the DEPLOY.md §5 catastrophe a one-line
>    diff. It is now forbidden outright while a custom Start Command exists.
> 3. "`apply` must not be capable of destroying the service" was a procedure, not a mechanism.
>    `prevent_destroy` is now required.
> 4. Clearing the Start Command was assigned to step 3, which only observes it. Nobody owned the
>    one task actually blocking backups. It is **step 0** now.
>
> Findings are resolved **into this document**; the sections below are the revised text, not the
> originals. Phase 7 was not reviewed in this pass and is unchanged.

PLAN.md §11 phases 0–5 are shipped and live. This covers two follow-on phases that were
deliberately deferred: putting the infrastructure under version control, and turning the ad-hoc
browser drivers into a real test suite.

## 1. Why these two, and why now

Both address the same weakness from opposite ends. Every defect that reached production in V1 —
the volume mount, the missing mail key, the Start Command overriding the image, six UI defects, a
push control that never rendered — was invisible to the 118 tests and to code review, and was
caught either by a person clicking, or not at all until it broke.

- **Terraform** makes the infrastructure describable and reviewable, so a change to it is a diff
  rather than a memory of which toggle got flipped.
- **Playwright** makes the journeys assertable, so a screen that never renders fails a build
  instead of waiting for someone to open it.

Neither is urgent. The app works. This is about the second time round.

## 2. What Terraform can actually manage here

Checked 2026-08-15 against the registries and provider repositories.

| Surface | Provider | Status | Covers |
|---|---|---|---|
| Railway | `terraform-community-providers/railway` | Community, 42★, 24 open issues, last push 2026-04-21 | `project`, `environment`, `service`, `variable`, `shared_variable`, `variable_collection`, `custom_domain`, `service_domain`, `tcp_proxy` |
| DNS | `namecheap/namecheap` | Vendor-published | Records — but see §2b |
| DNS (alternative) | `cloudflare/cloudflare` | **Official**, 1.3k★, actively pushed | Zones, records |
| Object storage | `cloudflare/cloudflare` | Official | R2 buckets |
| GitHub | `integrations/github` | Official | Repo settings, branch protection |
| Resend | — | **None** | Nothing. Five abandoned GitHub attempts, the most-starred at 7★ and untouched since 2024 |

### 2a. The finding that changes the plan

**The Railway provider has no `volume` resource.**

That matters more than any other line in this document. The `/data` volume mount is the single
most dangerous piece of this deployment — DEPLOY.md §2 warns that mounting it anywhere else works
perfectly and silently discards every account and trip on each deploy. It is the thing we
deliberately verified by signing in after a redeploy.

Terraform cannot manage it. Nor can it manage the **Start Command**, which we found overriding the
image's `ENTRYPOINT` and silently disabling Litestream, nor **Watch Paths**, which cost budget-app
a day of silently-skipped deploys.

So the honest summary is uncomfortable: **the three pieces of this deployment that have actually
gone wrong are precisely the three Terraform cannot own.** It would codify the project, the
service, the variables and the domain — the parts that have never broken — and leave the
dangerous parts exactly as manual as they are today, while adding the impression that the
infrastructure is now under control.

That is not an argument against doing it. It is an argument against believing it did more than it
did, and it makes §4's drift check the more valuable half of this phase rather than a nice-to-have.

### 2b. Namecheap is the wrong place to keep DNS under code

The Namecheap provider needs API access enabled, needs the calling IP whitelisted (IPv4 only), and
**production API access requires a $50 account balance or 20 or more domains**. For a one-domain
personal project on a $10/month budget, that is a poor trade, and the IP whitelist makes running
`apply` from CI awkward — a known, open complaint on the provider.

**Proposal:** move DNS hosting to Cloudflare while leaving the domain registered at Namecheap.
Nameservers point at Cloudflare; records live in Terraform through the official provider; no
whitelisting, no balance requirement, free. It also puts the R2 bucket for Litestream in the same
provider and account, which collapses two problems into one.

The cost is a migration of live records — `waypoint.myze.ca`, budget-app's `ledger.myze.ca`, the
Resend DKIM and inbound MX — and a nameserver cutover that is briefly all-or-nothing. That is the
riskiest single action in this plan and it is not reversible in seconds.

## 3. Non-negotiables

- **Terraform never holds a secret — and therefore never manages a secret variable.** No API keys,
  no VAPID private key, no Litestream credentials in `.tfvars` or in state. State files leak; a
  repo that is public leaks faster.

  **This rules out importing the service's variables, which an earlier draft of §4 step 2 asked
  for.** `terraform import` records the remote object's attributes in state — that is what import
  *is* — so importing `railway_variable` for this service would write `RESEND_API_KEY`,
  `GEMINI_API_KEY` and the VAPID private key into state in plaintext. The two rules were in direct
  contradiction and this one wins. Secret variables stay manual, named in a comment per the rule
  below. Only variables that are not secrets may ever be managed.
- **State is remote and locked before the first resource**, not "later" and not "from the first
  commit" — the skeleton may be committed before the backend exists, but nothing is imported into
  local state. A personal project with local state is one lost laptop away from an unmanageable
  deployment, and importing a live service into fresh state by hand is worse than never having
  used Terraform.
- **The state bucket is not the Litestream bucket.** They share a provider and nothing else. Making
  them one item coupled remote state to a backup decision that is now deferred indefinitely (§4
  step 4), which would have forced either local state or an indefinite wait. The state bucket is
  created at step 1 and treated as a secret store: private, encrypted, and never referenced from a
  public artifact.
- **Terraform describes what it can and says what it cannot.** Any resource that must stay manual
  gets a comment in the code naming it and pointing at the DEPLOY.md section that covers it. A
  `main.tf` that silently omits the volume teaches the next reader that there isn't one.
- **The existing deployment is imported, never recreated — and the guarantee is a mechanism, not a
  procedure.** Every resource starts as an `import` block with a plan that shows **no changes**
  before anything else happens. That protects the *first* apply. What protects the twentieth is
  `lifecycle { prevent_destroy = true }` on the service and on anything whose replacement would
  interrupt the running deployment: a community provider marking one attribute `RequiresReplace` is
  otherwise all it takes for a routine plan to propose destroying the service that holds every
  trip. A plan proposing replacement is a stop-and-read, never an `-auto-approve`.
- **Terraform may not turn on backups.** `LITESTREAM_BUCKET` is never Terraform-managed while a
  custom Start Command exists on the service. Setting it under that condition produces the exact
  state DEPLOY.md §5 calls the worst kind of failure — every variable present, the dashboard
  configured, the app healthy, nothing replicating — and Terraform would make that a one-line diff,
  which is easier to do by accident than the dashboard is. `npm run check-drift` already computes
  this precise condition; it is the one rule it grades rather than asserts.
- **`apply` runs from a developer machine, not from CI**, until there is a reason otherwise. The
  token that can apply can also delete the project, and state holds the R2 credentials that reach
  every backup. Neither belongs in a CI secret store for a one-service personal project. Each
  provider gets the narrowest token scope that works, recorded in `infra/README.md`.
- **Playwright tests must not need a human to seed them.** A suite that depends on scraping a
  verification token out of a log file is a suite that breaks the first time logging changes.
- **A flaky test is deleted or fixed the day it flakes.** A suite people have learned to re-run is
  worse than no suite, because it launders real failures.

## 4. Phase 6 — Terraform

Ordered so that the least reversible step comes last, and each step leaves the system working.

0. **Clear the Start Command, or find out why it cannot be cleared.** Not originally a step at all
   — it was a parenthetical in step 4 that assigned the work to step 3, which only ever observed it.
   Step 3 has now shipped and detects the override; nothing clears it, and nothing else in either
   plan owns it. It is the long pole for backups, not a footnote to them: clearing it crashed the
   deploy on 2026-08-15 and the cause is still unknown, so its size is genuinely unknown too.
   Cheapest first move is local: build the image and run it with `LITESTREAM_BUCKET` unset and the
   `ENTRYPOINT` active — the configuration that crashed. If it serves `/health` locally the cause is
   Railway-specific, which narrows it a long way; if it fails locally it is found without touching
   production. Capture the crash logs on any retry rather than guessing (DEPLOY.md §5).

1. **Skeleton and remote state.** `infra/` with the Railway and Cloudflare providers pinned to
   exact versions. Remote state in an R2 bucket created *for state* — not the Litestream bucket,
   see §3. No resources yet.

   **Prove the locking before building on it.** "R2 via the S3 backend, with locking" was asserted
   flatly in an earlier draft and is not obvious: the S3 backend's traditional lock used DynamoDB,
   which R2 does not have, so locking depends on Terraform's newer lockfile mechanism and on R2
   supporting conditional writes. It likely works, and the backend also needs several `skip_*`
   flags and has known checksum friction. Half an hour: stand it up, run two concurrent plans,
   confirm the second blocks. That belongs *in* this step rather than being discovered inside it.

2. **Import the Railway project and service. Not the variables.** `import` blocks only, with
   `prevent_destroy` set from the outset. The step is done when `terraform plan` reports no changes
   against the live deployment — the point is to describe what exists, not to change it. Secret
   variables stay manual and get a comment naming them (§3).

   **Decide `railway.json`'s standing first.** It already declares `healthcheckPath`,
   `restartPolicyType`, `restartPolicyMaxRetries` and `numReplicas`, and the drift check asserts
   `numReplicas` independently. If the provider's service resource also models any of those, one
   value has three declarations in the repo with no stated winner. Pick an owner per setting and
   write it down. Worth confirming whether `railway.json` also supports `watchPatterns` — if it
   does, one of §2a's three unownable settings is already ownable in-repo today, which sharpens
   §2a's point rather than blunting it.
3. **The drift check — done 2026-08-17**, and built *first* rather than third. Queries the Railway
   API and asserts the things Terraform cannot own: volume mount path is `/data`, Start Command is
   empty so the image's `ENTRYPOINT` runs, Watch Paths are empty, `numReplicas` is 1. Exits
   non-zero with the specific discrepancy. **This is the part that covers the failures we have
   actually had**, and it should be built even if the rest of the phase is abandoned — so it was,
   before anything committed this project to Terraform. Steps 1, 2 and 4–6 remain open, and §7's
   question about whether they are worth it is now answerable without having spent anything.

   Three things came out differently from this plan's sketch, each for a reason worth keeping:

   - **`.mjs`, not `.sh`.** A shell script needs `curl` and `jq`; this repo is now developed from a
     Windows desktop as well as a macOS laptop, and a check that will not run on one of the two
     machines is a check that will not be run. Node ships `fetch` and JSON, so it needs neither.
   - **A third exit code.** `0` clean, `1` drift, and `2` **could not check** — no token, no
     network, or the API schema moved. Collapsing `2` into either of the others is how a checker
     starts saying "OK" about something it never looked at, which is worse than not having one.
   - **The Start Command assertion could not be flat.** The deployment violates it deliberately
     today (§5's boxed warning), so a flat assertion would fail from its first run and be ignored
     by its third. It is a warning while `LITESTREAM_BUCKET` is unset and a failure once a bucket
     is set — which is exactly when it stops being harmless. This is the same "false positives are
     the design constraint" reasoning PLAN-V3 §4 records for conflict detection.

   The rules are pure functions in `infra/drift.mjs` with the network in `infra/check-drift.mjs`,
   so they are tested against fixtures with no token and no network — the same split the Svix
   webhook uses. 20 tests, run by `npm test`.
4. **R2 bucket for Litestream**, in Terraform — **gated on the greenlight**, since backups are
   deferred until the app stops being dev. Creating the bucket is safe at any time; what is not
   safe is Terraform setting `LITESTREAM_BUCKET` while step 0 is unresolved (§3). The bucket and
   the variable are separate decisions and only the first one belongs to Terraform.
5. **DNS to Cloudflare.** Zone and records in Terraform, then the nameserver cutover. Records are
   created and verified against the Cloudflare zone *before* the nameservers move, so the cutover
   is a switch rather than a rebuild. Rollback is switching the nameservers back, which is minutes
   of propagation, not seconds — plan a low-traffic window and have the old record set written
   down. **Nothing above depends on this**, and R2 does not require Cloudflare to host the DNS, so
   the honest default is to leave it undone until something actually needs it.
6. **GitHub repo settings**, if the rest has proved itself. The lowest value and the lowest risk;
   a reasonable place to stop.

**Exit, per step, because it is not uniform.** An earlier draft claimed "nothing in the running
deployment depends on Terraform existing", which is true of steps 1–2 and false after that.

- **Steps 1–2 are a clean exit.** If the community Railway provider proves unmaintained or wrong,
  delete `infra/railway.tf` and keep the drift check, which is the part carrying the weight.
  Nothing in the running deployment depends on them.
- **Step 4 is nearly clean** — an orphaned empty bucket costs nothing.
- **Step 5 is a one-way door.** Once `waypoint.myze.ca`, budget-app's `ledger.myze.ca`, the Resend
  DKIM and the inbound MX are Cloudflare zone records created by Terraform, abandoning Terraform
  orphans live, load-bearing records into an unmanaged state. Recoverable, but it is not deleting a
  file, and it should not be entered on the assumption that the phase's exit applies to it.

## 5. Phase 7 — Playwright

`app/e2e/drive.mjs` and `app/e2e/audit.mjs` already drive the real app and have found nine defects
between them. They are scripts a human reads, not tests a machine fails on. This turns them into
both.

1. **Harness.** `@playwright/test` with a `webServer` block starting the API and Vite, a
   throwaway SQLite file per run, and `channel: 'chrome'` locally to avoid a browser download.
2. **Auth fixture that does not scrape logs.** A worker-scoped fixture that registers through the
   API and completes verification by reading the token straight from the test database, then
   reuses the storage state. Log-scraping is fine for a script a person is watching and wrong for
   a suite.
3. **Journey specs**, one per thing a user actually does: sign up and verify; create a trip and
   add each entity type; invite and redeem; import review and apply; offline read.
4. **Accessibility assertions.** `@axe-core/playwright` on every screen, plus the checks axe cannot
   make that `audit.mjs` already makes — that a control is reachable and operable by keyboard, that
   focus moves on navigation, that status messages are announced. Keep the
   `web-accessibility-reviewer` agent for judgement; automate the parts that are mechanical.
5. **CI.** GitHub Actions on pull requests: typecheck, lint, unit tests, then Playwright with
   browsers cached. Playwright's own container image avoids the system-dependency problem.
6. **Fold in the drivers.** `drive.mjs` keeps its screenshot role for looking at the app; `audit.mjs`
   is superseded by the assertions and is deleted rather than left to rot.

**Exit:** the suite is per-spec, so an unreliable area can be deleted without touching the rest.

## 6. What this does not cover

- **Docker/Railway build settings** beyond what `railway.json` already holds in the repo.
- **Multi-environment** (staging). One instance is a stated constraint of this app (PLAN.md §4);
  a staging environment is a different plan with a different cost line.
- **budget-app.** It has the same shape and the same traps, and a shared module is the obvious
  temptation. Resist until this has worked once here; a premature abstraction across two projects
  is how both become harder to change.

## 7. Open questions

- **Is the Railway provider maintained enough to depend on?** 42 stars, 24 open issues and a last
  push four months old is not abandoned, but it is one person's side project standing between this
  repo and its deployment. Read the open issues before step 2 and decide deliberately.
- **Does the DNS migration earn its risk?** It is the only genuinely dangerous step here, and its
  payoff is DNS-as-code plus a free R2 bucket. Doing step 4 without step 5 is possible — R2 does
  not require Cloudflare to host the DNS.
- ~~**Where does remote state live before R2 exists?**~~ **Settled 2026-08-17.** The chicken-and-egg
  only existed because one item created both buckets. They are separate now (§3): a state bucket at
  step 1, the Litestream bucket at step 4 behind the greenlight. Neither waits on the other.
- ~~**Is Phase 6 worth it at all, given §2a?**~~ **Decided 2026-08-17, by David, on a different
  argument than this document evaluated.** §2a weighed Terraform against *today's* infrastructure —
  one service, one domain — where it can only describe the parts that have never broken. The
  decision rests instead on a forward-looking case: future integrations will make
  infrastructure-as-code pay off, and adopting it before the surface grows is cheaper than
  retrofitting it after. That is a reasonable bet and this document never weighed it.

  **It is recorded as a bet rather than as a reason, because the plan cannot check it.** No future
  integration is named, and §2's own table holds the counter-example: Resend — this app's most
  configuration-heavy dependency, with a verified domain, DKIM, inbound MX, webhook endpoints and
  signing secrets — **has no provider at all**. If the integrations that arrive look like Resend,
  Terraform covers none of them and the bet does not pay. If they look like Cloudflare, GitHub or
  object storage, it pays well. Worth revisiting once two or three of them are actually named.

- **Is Terraform still the right tool once `railway.json` is counted?** Raised by the 2026-08-17
  review and not yet answered. Railway's config-as-code file is already in the repo, already
  version-controlled, already reviewed as a diff — which is most of what §1 claims Terraform buys.
  It is not a reason to abandon Phase 6, but "what does Terraform add over `railway.json`" deserves
  a real answer before step 2 rather than after it.
