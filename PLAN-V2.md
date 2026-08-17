# Waypoint — Plan V2: infrastructure as code, and browser testing

> **Status: draft, not started.** Authored by Opus on 2026-08-15 from a scoping request by David.
> Provider capabilities in §2 were checked against the registries and repositories on that date
> rather than assumed — see §2a for what that check found, because it changes the plan's shape.
>
> **Run `/review-kit:plan-review PLAN-V2.md` against this before building any of it.** That skill
> exists in this project's own history for a reason: the last plan it reviewed had three
> load-bearing problems, and this one rests on third-party provider coverage, which is exactly the
> class of claim it is written to attack.

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

- **Terraform never holds a secret.** No API keys, no VAPID private key, no Litestream
  credentials in `.tfvars` or in state. Secrets are set out of band and referenced, or the
  variable is declared without a value and populated in the provider's own UI. State files leak;
  a repo that is public leaks faster.
- **State is remote and locked from the first commit**, not "later". A personal project with local
  state is one lost laptop away from an unmanageable deployment, and importing a live service into
  fresh state by hand is worse than never having used Terraform.
- **Terraform describes what it can and says what it cannot.** Any resource that must stay manual
  gets a comment in the code naming it and pointing at the DEPLOY.md section that covers it. A
  `main.tf` that silently omits the volume teaches the next reader that there isn't one.
- **The existing deployment is imported, never recreated.** `terraform apply` must not be capable
  of destroying and rebuilding the service that holds real trips. Every resource starts as an
  `import` block with a plan that shows **no changes** before anything else happens.
- **Playwright tests must not need a human to seed them.** A suite that depends on scraping a
  verification token out of a log file is a suite that breaks the first time logging changes.
- **A flaky test is deleted or fixed the day it flakes.** A suite people have learned to re-run is
  worse than no suite, because it launders real failures.

## 4. Phase 6 — Terraform

Ordered so that the least reversible step comes last, and each step leaves the system working.

1. **Skeleton and remote state.** `infra/` with the Railway and Cloudflare providers pinned to
   exact versions. Remote state in Cloudflare R2 via the S3 backend, with locking. No resources
   yet.
2. **Import the Railway project, service and variables.** `import` blocks only. The phase is done
   when `terraform plan` reports no changes against the live deployment — the point is to describe
   what exists, not to change it.
3. **The drift check** (`infra/check-drift.sh`). Queries the Railway API and asserts the things
   Terraform cannot own: volume mount path is `/data`, Start Command is empty so the image's
   `ENTRYPOINT` runs, Watch Paths are empty, `numReplicas` is 1. Exits non-zero with the specific
   discrepancy. **This is the part that covers the failures we have actually had**, and it should
   be built even if the rest of the phase is abandoned.
4. **R2 bucket for Litestream**, in Terraform. Backups are currently off by decision; this makes
   turning them on a variable change rather than a dashboard session. Ordering note: enabling
   backups requires clearing the Start Command first (DEPLOY.md §5), which is step 3's business.
5. **DNS to Cloudflare.** Zone and records in Terraform, then the nameserver cutover. Records are
   created and verified against the Cloudflare zone *before* the nameservers move, so the cutover
   is a switch rather than a rebuild. Rollback is switching the nameservers back, which is minutes
   of propagation, not seconds — plan a low-traffic window and have the old record set written
   down.
6. **GitHub repo settings**, if the rest has proved itself. The lowest value and the lowest risk;
   a reasonable place to stop.

**Exit:** if the community Railway provider proves unmaintained or wrong, the exit is deleting
`infra/railway.tf` and keeping the drift check, which is the part carrying the weight. Nothing in
the running deployment depends on Terraform existing.

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
- **Where does remote state live before R2 exists?** Chicken and egg: step 1 wants remote state,
  step 4 creates the bucket. Either bootstrap the bucket by hand and import it, or start with local
  state and migrate once — both are defensible, neither should be discovered mid-phase.
- **Is Phase 6 worth it at all, given §2a?** A defensible reading of this document is: build the
  drift check, skip the rest, and spend the time on Phase 7 instead. That reading should be
  considered honestly rather than dismissed because Terraform is the more interesting technology.
