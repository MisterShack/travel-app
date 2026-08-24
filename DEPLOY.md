# Deploying travel-app

Railway, Dockerfile build, one instance, SQLite on a volume, Litestream to object storage.
This is budget-app's runbook adapted — the gotchas below are its hard-won ones, not
hypotheticals, and each has already cost real time once.

```
browser ──https──▶ Railway edge ──▶ node (Hono)          ┌──────────────┐
                                     ├─ /auth/*  API      │ /data/       │
                                     ├─ /trips/* API      │  travel.db   │
                                     └─ /*       client   └──────┬───────┘
                                            │                    │
                                            └──── litestream ────┘
                                                        │
                                                  object storage
```

The volume is a cache; the replica is the backup.

PLAN.md §11 puts deployment at **Phase 1**, before auth and before any real trip exists. That
ordering is deliberate: this is the cheapest moment to get the infrastructure wrong. Phase 1 is
not complete until §6's restore drill has actually been run.

> **Status: deferred, 2026-08-15.** Everything here needs the Railway and Namecheap dashboards,
> which David cannot reach while away. Phase 2 is being built locally in the meantime. The
> ordering rationale is unchanged and the constraint that protects it is simply restated: **no
> real data goes into a deployed instance until this runbook has been completed through §6.**
> Building Phase 2 locally costs nothing, because nothing is at risk until something is live.

---

## 0. Before the first deploy

You need four things. The first two are quick; the third stops the deploy dead if missing, and
the fourth is the one people skip.

1. **A GitHub repo.** Railway deploys from it and auto-builds on push.
2. **A Railway account** with this repo connected.
3. **A Resend API key**, and a domain verified in that Resend account. The server will not start
   in production without the key — see §3.
4. **An S3-compatible bucket** for Litestream, plus an access key and secret.
   **Cloudflare R2** and **Backblaze B2** both have free tiers far beyond what a family's trips
   use. Both want a payment method on the account, so if that is the blocker, come back to it —
   but come back, and read §5 before deciding it can wait.

> **Note:** budget-app's runbook lists the same two candidates but never recorded which was
> chosen, because its backups were deferred and (as of its own CLAUDE.md) never configured.
> There is no working configuration to copy from it. Pick one here and write the answer down.

---

## 1. Create the service

New project → **Deploy from GitHub repo** → this repo. `railway.json` selects the Dockerfile
builder and points the healthcheck at `/health`; nothing needs configuring in the UI for the
build itself.

**Watch Paths: clear them entirely.** A commit touching only unwatched paths is marked
*skipped*, not failed — the deploy never happens, the site keeps serving the previous build, and
nothing anywhere reports a problem. This cost budget-app a day: its watch path was `server/**`,
so three consecutive client-only commits shipped nothing. The dangerous one here is `shared/**`,
where a Zod schema change is the most correctness-critical edit in the repo.

If you must set them, cover `app/**`, `server/**`, `shared/**`, `deploy/**`, `Dockerfile`,
`railway.json`, `package.json`, `package-lock.json`.

---

## 2. Add the volume

Service → **Variables/Volumes** → attach a volume, mount path **`/data`**.

Not `/app/data`, not anywhere else. Mounted anywhere else, SQLite writes happily to the container
filesystem, everything works perfectly, and every account and every trip is discarded on the next
deploy — silently, with no error in any log.

The Dockerfile sets `DATABASE_URL=file:/data/travel.db`, so the mount path and the URL have to
agree. Change one, change the other.

---

## 3. Environment variables

| Variable | Value | Notes |
|---|---|---|
| `PUBLIC_URL` | `https://<your-domain>` | Used to build links in email |
| `APP_ORIGIN` | `https://<your-domain>` | Cross-origin allow-list. **Needs the scheme** — a bare host is rejected at boot, because `new URL('example.com')` parses as scheme `example.com:` and would match no real Origin header |
| `TRUST_PROXY` | `true` | Railway terminates TLS in front of the app; without this the rate limiter (Phase 2) keys every request to one bucket |
| `RESEND_API_KEY` | `re_…` | **Required.** The server refuses to boot in production without it |
| `MAIL_FROM` | `Trips <no-reply@mail.myze.ca>` | Must be a domain verified in Resend |
| `RESEND_WEBHOOK_SECRET` | `whsec_…` | From Resend's webhook settings. **Without it the inbound route rejects everything** — see below |
| `GEMINI_API_KEY` | from Google AI Studio | Paid tier (PLAN.md §6.7). Absent means heuristics only |
| `INBOUND_ADDRESS` | `waypoint@mail.myze.ca,trips@mail.myze.ca` | Comma-separated. Only mail to one of these is imported; everything else at the domain is discarded |
| `VAPID_PUBLIC_KEY` | see below | Optional. Without a pair, reminders go by email only |
| `VAPID_PRIVATE_KEY` | see below | Must be set together with the public key, or boot fails |
| `VAPID_SUBJECT` | `mailto:no-reply@mail.myze.ca` | Contact URI for the push service |
| `LITESTREAM_*` | see §5 | Four variables; without them there is no backup |

Set by the Dockerfile, override only deliberately: `DATABASE_URL`, `STATIC_DIR`, `PORT`,
`NODE_ENV`. **Do not add a `PORT` variable here** — a dashboard variable overrides the
Dockerfile's `ENV PORT=8080`, and a mismatch shows up only as a healthcheck that never passes.

> **`RESEND_API_KEY` is required for the very first production deploy**, not a later addition.
> `env.ts` throws on boot without it, so the container exits before it can answer `/health` and
> Railway reports a **healthcheck failure** with no other clue. That is the guard working — an app
> that boots happily and silently delivers no verification or invite email is worse — but it does
> mean mail setup is a prerequisite of deploying at all, not a Phase 2 task. An earlier version of
> this runbook said otherwise and cost one failed deploy.
>
The inbound webhook **refuses every request** when `RESEND_WEBHOOK_SECRET` is unset, rather than
accepting unsigned ones. That is deliberate: an endpoint that takes unsigned requests, fetches
provider messages by an id the caller chose, and writes rows is not a degraded feature — it is a
hole. A missing secret disables import; it never weakens it.

Web push is optional by design: email is the default reminder channel (PLAN.md §7), so a missing
VAPID pair degrades a feature rather than breaking the app. Generate a pair with
`npx web-push generate-vapid-keys`. Setting only one half fails at boot rather than at the moment
someone tries to subscribe.

> `MAIL_FROM` must be an address on a domain verified with Resend. The provider's `@resend.dev`
> test sender accepts the send and delivers only to the account owner, so every invitation would
> silently reach nobody; `env.ts` refuses to start on one.

---

## 4. Point the domain at it

The domain is **`waypoint.myze.ca`** (decided 2026-08-15), the parallel to budget-app's
`ledger.myze.ca`. So `APP_ORIGIN` and `PUBLIC_URL` are both `https://waypoint.myze.ca`.

Service → **Settings** → **Networking** → **Custom Domain**. Railway shows a CNAME target like
`xyz.up.railway.app`; add it at Namecheap:

| Type | Name | Value |
|---|---|---|
| `CNAME` | `trips` | the target Railway shows you |

TLS is issued automatically once the record resolves.

> **Do not touch the MX or TXT records.** Resend delivers budget-app's mail from `mail.myze.ca`
> and there may be SPF/DMARC records at the apex. A new CNAME sits alongside them; removing
> anything else breaks mail and verification emails stop arriving. Phase 4 adds an MX record for
> inbound booking email on a *separate* subdomain — see §11, and note the CNAME/MX conflict
> described there.

---

## 5. Backups

**Skip this only if you accept that losing the volume loses every trip.** The app starts without
it and prints a warning; that is so a misconfigured secret cannot take the site down, not because
it is optional.

Create a bucket and an access key, then set:

| Variable | Value |
|---|---|
| `LITESTREAM_BUCKET` | your bucket name |
| `LITESTREAM_ENDPOINT` | R2: `https://<account-id>.r2.cloudflarestorage.com`<br>B2: `https://s3.<region>.backblazeb2.com` |
| `LITESTREAM_ACCESS_KEY_ID` | access key |
| `LITESTREAM_SECRET_ACCESS_KEY` | secret key |

`deploy/litestream.yml` reads all four from the environment and names no provider, so nothing in
the repo changes when you switch stores. That is what made budget-app's host migration a config
change rather than a rewrite; keep it that way.

`deploy/entrypoint.sh` restores from the replica when `/data/travel.db` is absent, then runs the
server under `litestream replicate -exec`. With `LITESTREAM_BUCKET` unset it prints
`WARNING: LITESTREAM_BUCKET is not set` and starts anyway. **Read the logs on the first deploy
and confirm you are not seeing that line.**

> ### ⚠ A custom Start Command silently disables replication
>
> As deployed on 2026-08-15 the Railway service has a **custom Start Command**
> (`npm run start --workspace @travel/server`, running from `/app/server`) which overrides the
> image's `ENTRYPOINT`. The app runs correctly that way — but `entrypoint.sh` never executes, so
> **Litestream never starts**.
>
> Today that costs nothing, because no bucket is configured. The moment `LITESTREAM_BUCKET` is
> set it becomes the worst kind of failure: the variables are present, the dashboard looks
> configured, the app is healthy, and **nothing is being replicated**. You would stop worrying
> about backups precisely when you had none.
>
> **Before enabling backups, clear the Start Command** so the image's `ENTRYPOINT` runs, and
> confirm from the deploy logs that the `WARNING: LITESTREAM_BUCKET is not set` line appears
> *before* you set the bucket — that line is proof the entrypoint is executing. Once the bucket is
> set, prove it again with `litestream snapshots` (§6); an empty result means replication is not
> running no matter what the variables say.
>
> Clearing it was attempted on 2026-08-15 and the deploy crashed, so it was rolled back and the
> custom command left in place. **The cause is not yet known.** The entrypoint itself is not at
> fault: the same command shape (`node --import tsx server/src/index.ts` from `/app`) starts and
> serves `/health` correctly both natively and in the image, and the entrypoint's own WARNING line
> printed before the failure. Capture the crash logs when retrying rather than guessing.
>
> #### What has been eliminated (2026-08-18 by reading, 2026-08-23 by exercise)
>
> The two boot paths differ in exactly one respect that could plausibly matter: the **working
> directory** of the node process. The Start Command runs the script with cwd `/app/server` (npm
> sets a workspace script's cwd to its own package); the `ENTRYPOINT` runs it with cwd `/app`.
> Everything else — the script, the interpreter, the environment — is identical.
>
> That is the most promising lead, because this repo has already been bitten by a path resolved
> against cwd (`STATIC_DIR`, §"the app served nothing"). **It does not survive contact with the
> code.** Nothing in `server/src` resolves a path against cwd:
>
> - `MIGRATIONS_FOLDER` is `fileURLToPath(new URL('../../drizzle', import.meta.url))` — anchored to
>   the module, so it is `/app/server/drizzle` from either cwd.
> - `STATIC_DIR` is set absolute in the Dockerfile *and* `env.ts` rejects a relative value with a
>   Zod `refine`. It cannot silently become wrong.
> - `--import tsx` resolves from either cwd: `tsx` is declared in `server/package.json` but hoisted
>   to `/app/node_modules/tsx`, which is on the lookup path from `/app` and from `/app/server`.
> - The Start Command's extra `--env-file-if-exists=.env.local` is a no-op in the image:
>   `.dockerignore` excludes `**/.env.*` and `**/*.local`, so no such file is ever present.
>
> So the cwd difference has **no known mechanism**. Treat "it must be the working directory" as
> already tried.
>
> **The cheapest remaining check needs no deploy and no Docker — read the current logs.** If the
> line `WARNING: LITESTREAM_BUCKET is not set` appears in the *running* service's boot output, then
> `entrypoint.sh` is executing today and the premise of this whole box is wrong: the Start Command
> would be being passed as arguments to the entrypoint, which ignores them, rather than replacing
> it. That would dissolve most of gate 1. If the line is absent, the premise holds. Either way it is
> a thirty-second answer that decides where the next hour goes, and it should be done before
> anything is rebuilt.
>
> #### The local experiment was run on 2026-08-23. The entrypoint path works.
>
> Built from the unmodified repo and run in the exact configuration that crashed —
> `LITESTREAM_BUCKET` unset, `ENTRYPOINT` active, no command override. It **boots and serves**:
> the three WARNING lines, then `Waypoint API listening` within a couple of seconds, `/health` 200,
> `/trips/<id>` 200 HTML, `/api/trips` 401 JSON, `/data/travel.db` created and surviving a restart.
> The Start Command path was run in the same image and behaved identically.
>
> So **the cause is Railway-side.** Eliminated by exercise, not by reading: the working directory
> (both paths serve every route identically), `--env-file-if-exists` (logged as not found), memory
> (the entrypoint path uses *less* — 328 MiB against 591 MiB — and survived a 512 MiB cap that
> OOM-killed the Start Command path), cold start (4.2s against 5.4s, both far inside
> `healthcheckTimeout: 60`), an injected `PORT`, and volume persistence across a restart.
>
> **`entrypoint.sh` ignores any command passed to it** — it never references `"$@"`. Confirmed by
> running the image with the Start Command as CMD args: it printed the WARNING and ran node itself.
> That is what makes the log check below decisive.
>
> **The WARNING line proves only that node started.** Dropping `RESEND_API_KEY` under the entrypoint
> reproduces the recorded 2026-08-15 symptom shape exactly — WARNING lines, then
> `Error: RESEND_API_KEY is required in production`, exit 1. "The warning printed, then it failed"
> therefore implicates nothing after `exec`, and should not be read as evidence about the entrypoint.
>
> **The leading hypothesis is now that the crashed deploy and the healthy one were not the same
> build.** Clearing the Start Command triggers a redeploy, and the repo was moving hourly that day
> (service recorded live at 17:18, the crash at 17:28, Phase 5 committed at 17:41). It is the only
> hypothesis that explains why a rollback restored health while an identical environment was in
> play. **Check it read-only:** open the crashed deployment in Railway's deploy history and compare
> its commit SHA with the healthy one. If they differ, gate 1 is a non-issue.
>
> Two further facts, both true and neither previously written down:
>
> - **Nothing in `server/src` handles `SIGTERM`** — no `process.on` anywhere. Under the `ENTRYPOINT`
>   node is PID 1, so on Railway it is SIGKILLed at every shutdown rather than closing down
>   cleanly. The Start Command path is killed too. It is not a difference between them, but it does
>   mean an in-flight request is cut at every deploy.
> - Do not trust signal or timing behaviour measured under emulation. On Apple Silicon, QEMU
>   installs its own handlers and manufactured a clean exit that does not happen natively; it also
>   produced non-deterministic esbuild crashes (§10) that are pure emulation artefacts. Re-test any
>   signal-level claim on a native arch before believing it.

---

## 6. Verify the backup — the Phase 1 gate

An untested backup is not a backup. PLAN.md §11 makes Phase 1 complete only when this has been
run, not merely configured. budget-app deferred this, went live with real financial data, and its
own notes say: do not treat the restore drill as pending, treat it as impossible until you have
done it once.

Get a shell with `railway run bash` or the Railway web terminal:

```sh
# 1. There is a replica, and it has generations.
litestream snapshots -config /etc/litestream.yml /data/travel.db

# 2. Restore it somewhere harmless. This does not touch the live database.
litestream restore -config /etc/litestream.yml -o /tmp/restored.db /data/travel.db

# 3. The restored copy is a valid database.
apt-get update && apt-get install -y --no-install-recommends sqlite3
sqlite3 /tmp/restored.db "PRAGMA integrity_check;"
sqlite3 /tmp/restored.db ".tables"

rm /tmp/restored.db
```

`integrity_check` must print `ok`. **If step 1 prints nothing, replication is not running** — no
amount of the rest matters until that is fixed.

In Phase 1 there are no tables yet, so `.tables` is legitimately empty; the drill is proving the
replication path, not the content. Re-run it at the end of Phase 2, when `users` and `trips`
exist, and check the row counts.

**Record every drill here:**

| Date | Who | Result |
|------|-----|--------|
|      |     |        |

### Real recovery

If the volume is lost, a new one restores automatically — `entrypoint.sh` runs
`litestream restore -if-replica-exists` whenever `/data/travel.db` is absent. Redeploy and the
database comes back.

> ### ⚠ A wrong bucket credential takes the site down on exactly the deploy that needs the restore
>
> Verified locally 2026-08-23, in the image. The restore path and the steady-state path fail in
> opposite directions, and only one of them is loud:
>
> - **Bucket set, endpoint or key wrong, `/data/travel.db` already present.** The app boots and
>   serves `/health` normally. Litestream logs `level=ERROR msg="monitor error"` on every sync and
>   nothing else says a word. **A broken replica is invisible from outside** — this is precisely why
>   §5 insists on `litestream snapshots` rather than on the dashboard looking right.
> - **Bucket set, endpoint or key wrong, `/data` empty.** `litestream restore` fails, and under
>   `set -eu` the entrypoint **exits 1 before node ever starts**. The container never serves. That is
>   the fresh-volume case — so a bad credential is silent for as long as the volume survives and
>   then takes the site down at the exact moment you are relying on the restore.
>
> Test a new bucket credential against a *populated* volume first, and confirm with
> `litestream snapshots` before you ever need the restore path.
>
> Note also that first replication flips the database from `journal_mode=delete` to `wal` and
> creates `/data/.travel.db-litestream`, `-wal` and `-shm`. That is a one-way change to the live
> file; it is normal and expected, but it is not reversible by unsetting the bucket.

To roll back to a point in time instead, stop the service first so nothing writes, then:

```sh
mv /data/travel.db /data/travel.db.bak
litestream restore -config /etc/litestream.yml \
  -timestamp 2026-08-01T12:00:00Z /data/travel.db
```

Restart. Keep the `.bak` until you have confirmed the restored data is what you wanted.

---

## 7. Smoke test

From outside, once the domain resolves:

```sh
curl -sS https://<your-domain>/health
curl -sSI https://<your-domain>/ | grep -iE '^(HTTP|content-type)'
curl -sS -o /dev/null -w '%{http_code}\n' https://<your-domain>/trips/anything
curl -sS -o /dev/null -w '%{http_code}\n' https://<your-domain>/api/trips/anything
```

Expect JSON, an HTML content type, `200` (the SPA fallback), and `401` — the
last one matters. The API is mounted under `/api` precisely so the client's
`/trips/:id` page and the API's `/trips/:id` endpoint stop being the same URL;
if the third command returns JSON, the prefix has been lost and every deep link
into a trip serves the API instead of the app.

Phase 1 checklist — there is no auth or data yet, so this is deliberately short:

- [ ] `/health` returns `{"status":"ok",...}` over a valid certificate.
- [ ] `/` serves the client shell.
- [ ] A deep link like `/trips/anything` serves the shell, while
      `/api/trips/anything` returns 401 JSON.
- [ ] Deploy logs do **not** contain `LITESTREAM_BUCKET is not set`.
- [ ] `litestream snapshots` lists a generation (§6).
- [ ] **Redeploy, then check `/health` again.** Confirms the volume survives a deploy — this is
      the check that catches a mis-mounted volume, and the only one that catches it before it
      matters.

The data-survives-redeploy check has to wait for Phase 2, when there is something to write.

---

## 8. Two things that break silently

- **`VITE_API_URL` is a build-time value.** `/` means same-origin, which is the deployed shape.
  Unset, the build succeeds, the page loads, and there is no sign-in at all. The Dockerfile sets
  it and `app/src/config.test.ts` pins it.
- **`tsx` is a runtime dependency of `@travel/server`, not a dev one.** The image runs
  `npm prune --omit=dev` and the server executes TypeScript directly. Moving `tsx` to
  `devDependencies` makes the container delete its own loader and fail to boot.

### 8a. The drift check

Four of this runbook's settings are dashboard state that no file in this repo can pin, and each
fails quietly: the volume mount path (§2), the Start Command (§5), the Watch Paths, and
`numReplicas`. `railway.json` declares `numReplicas` but the live service can still differ.

```sh
RAILWAY_API_TOKEN=... RAILWAY_PROJECT_ID=... npm run check-drift
```

Exits `0` for clean, `1` for drift naming the specific setting, and `2` for **could not check** —
which is never reported as clean. See `infra/README.md`. Worth running before and after any change
in the Railway dashboard, and before turning backups on.

It is the part of PLAN-V2's Terraform phase that carries the weight, and it was built first
deliberately: Terraform cannot own any of these three, so the check covers the failures that have
actually happened while the question of whether to adopt Terraform at all stays open.

**Expect one warning today** — the custom Start Command of §5. The check grades that rather than
failing on it, and turns it into a failure the moment `LITESTREAM_BUCKET` is set.

---

## 9. The native-binary lockfile trap

npm records only the *current* platform's optional native packages (npm/cli#4828), so a lockfile
generated on macOS describes only macOS and `npm ci` on any other platform fails on a missing
binary. Root `optionalDependencies` declares the missing builds explicitly so they land in the
lockfile. Each carries an `os` field, so declaring one never installs it anywhere it does not
belong — a `linux` entry is inert on a developer machine and a `win32` entry is inert in the
image. They are declared to be *recorded*.

**This was measured on 2026-08-15, not assumed.** Regenerating `package-lock.json` with the
`optionalDependencies` block removed drops the Linux entries from 22 to **zero**. The bug is
still live on npm 11.17.0; it is not something budget-app worked around historically and has
since been fixed.

**It bites the deploy target and the developer machine alike (2026-08-17).** A fresh `npm ci` of
this macOS-generated lockfile on a Windows desktop installed no Rolldown and no LightningCSS
binding, and `vitest` died at startup on `Cannot find native binding` before running a single
test. Same bug, opposite direction. Only these two packages are affected: `esbuild`, `@libsql`,
`@node-rs/argon2` and `@rollup` all record every platform in the lockfile already, so they need
nothing.

Currently declared, at the versions this repo actually resolves:

| Package | Version | Why |
|---|---|---|
| `@rolldown/binding-linux-x64-gnu` | 1.2.4 | Vite 8 bundles with **Rolldown**, not Rollup |
| `@rolldown/binding-win32-x64-msvc` | 1.2.4 | The same, for the Windows development machine |
| `@esbuild/linux-x64` | 0.28.2 | Vite's dependency-prebundling and TS transform |
| `lightningcss-linux-x64-gnu` | 1.33.0 | Vite's CSS pipeline |
| `lightningcss-win32-x64-msvc` | 1.33.0 | The same, for the Windows development machine |

Note that budget-app pins `@rollup/rollup-linux-x64-gnu`, and that is **not** the right pin here:
Vite 8 replaced Rollup with Rolldown, and `rollup` is not in this dependency tree at all. Copying
budget-app's list verbatim would leave the real binaries unpinned while pinning one nothing uses.

Rules for keeping this correct:

- **Versions are exact, not ranges** — each must match the package it backs, and a platform pair
  must move together. After any bump of `vite`, re-read the resolved versions and update all five:
  ```sh
  node -p "require('./node_modules/rolldown/package.json').version"
  node -p "require('./node_modules/esbuild/package.json').version"
  node -p "require('./node_modules/lightningcss/package.json').version"
  ```
- **To verify the lockfile still describes every platform**, check all five are present:
  ```sh
  node -e "const p=require('./package-lock.json').packages; for (const n of ['@rolldown/binding-linux-x64-gnu','@esbuild/linux-x64','lightningcss-linux-x64-gnu','@rolldown/binding-win32-x64-msvc','lightningcss-win32-x64-msvc']) console.log(('node_modules/'+n in p)?'OK  ':'MISS', n)"
  ```
- **The Linux entries cover linux-x64 only**, which is what Railway runs and what the Dockerfile's
  Litestream download assumes. Building the image on an arm64 machine needs the `-arm64-` variants
  added.
- **A new development machine may need its own pair added**, by the same rule: run `npm ci`, run
  `npm test`, and if the bundler cannot find a native binding, declare that platform's Rolldown and
  LightningCSS builds here rather than installing them by hand. A hand-installed binary disappears
  at the next `npm ci` and the next person re-discovers this section.
- **Phase 2 adds `@libsql/client` and `@node-rs/argon2`**, and their `linux-x64-gnu` builds must be
  added here at the same time. Only the bundler failure is loud: without the other two the image
  builds happily and the server crashes at runtime on database open and password hashing.

---

## 10. Testing the image locally

The image was built and run successfully for `linux/amd64` on 2026-08-15, before any deploy.
Local Docker here is **Colima**, not Docker Desktop: it needs no admin password, installs entirely
under `~/.local`, runs on Apple's Virtualization framework, and the whole VM is one command to
delete.

```sh
colima start --vm-type vz --mount-type virtiofs --cpu 4 --memory 6 --disk 40
docker build --platform linux/amd64 -t travel-app:phase0 .
docker run --rm -p 8090:8080 -v travel-data:/data travel-app:phase0
colima stop     # when finished; `colima delete` removes the VM entirely
```

`--platform linux/amd64` matters: Railway runs x86_64, and the `optionalDependencies` in §9 pin
x64 binaries only. Building without it produces an arm64 image whose `npm ci` cannot find a
matching Rolldown binding.

Two caveats when running the amd64 image on an Apple Silicon machine:

- It runs under QEMU emulation and is **slow** — allow a few minutes for a build, and several
  seconds for the container to answer.
- Emulated Go binaries occasionally crash with `fatal error: receive on synctest channel from
  outside bubble` from esbuild. That is a QEMU artifact, not a defect in the image; it does not
  reproduce on native x86_64.

What this verified, all of which §8 and §9 exist to protect:

- `npm ci` inside the Linux image resolves the pinned Linux binaries — `@rolldown/binding-linux-x64-gnu`
  and `@esbuild/linux-x64` are the ones present in the image, with no `*darwin*` package anywhere.
- `tsx` survives `npm prune --omit=dev`, so the container still has its loader.
- `VITE_API_URL=/` is baked into the client bundle at build time.
- `/health` answers JSON while `/` and `/trips/abc` both serve the SPA shell — the API is not
  shadowed by the static handler.
- `entrypoint.sh` prints the "NOT being backed up" warning and starts anyway when
  `LITESTREAM_BUCKET` is unset.

**`.dockerignore` is load-bearing, not a speed optimisation.** The Dockerfile runs `npm ci` to
install the Linux binaries and then `COPY . .`. Without `.dockerignore` excluding `node_modules`,
that copy drops the host's macOS binaries on top of them and the image ships
`@rolldown/binding-darwin-arm64` to a Linux container. It also keeps `.env*` files out of an image
layer.

---

## 11. DNS for inbound email (Phase 4)

Inbound goes on **`mail.myze.ca`** — the domain already verified in Resend for sending. Confirmed
2026-08-15 that this works with a one-domain plan: the DKIM record is at
`resend._domainkey.mail.myze.ca` (a subdomain), and `mail.myze.ca` itself holds no MX, CNAME or A
record, so there is nothing to collide with.

| Type | Name | Value | Priority |
|---|---|---|---|
| `MX` | `mail` | the target Resend gives you | lowest number present |

> **It cannot go on `waypoint.myze.ca`** — that name is a CNAME to Railway, and DNS forbids a CNAME
> coexisting with any other record type. This is not a preference; the record would be rejected or
> silently break the site.

> **Adding this MX makes `mail.myze.ca` receive mail at every address**, including
> `no-reply@mail.myze.ca`, which is the From address on every email the app sends. Replies to a
> reminder will therefore arrive at the webhook. That is handled in code — the webhook processes
> only mail addressed to one of the `INBOUND_ADDRESS` entries and discards the rest (PLAN.md
> §6.1) — but it is the
> reason that filter exists, so do not remove it.

Verify the domain's inbound setup in Resend's dashboard before pointing the webhook at it. PLAN.md
§6 covers what happens to the mail once it arrives.

---

## Routine operations

| Task | How |
|------|-----|
| Logs | Service → **Deployments** → the active one |
| Shell | Railway web terminal, or `railway run bash` |
| Redeploy | `git push` — Railway builds `main` automatically |
| Roll back | **Deployments** → an earlier build → **Redeploy** |
| Variables | Service → **Variables** (a change triggers a restart) |

### Deploying a new version

Migrations run at boot (Phase 2 onward), so a deploy applies them automatically. There is one
instance and one database file, so there is never a window where two versions disagree about the
schema — but it does mean a deploy is a brief restart, not a zero-downtime rollout. That is the
intended trade for an application this size.

### A migration that changes existing rows

Migration `0005` is the first one that rewrites data rather than only adding to the schema: it
copies every existing `flights.seat` into the new `passengers` JSON column and then drops `seat`.

**Roll back is a redeploy of the old image, which does not undo a migration.** The old code would
find no `seat` column and fail. With `LITESTREAM_BUCKET` unset (§5) the Railway volume is the only
copy of the database, so there is nothing to restore from either.

Before deploying a migration in this class, take a copy of the database first:

```bash
railway run cp /data/travel.db /data/travel-before-0005.db
```

That copy lives on the same volume, so it does not protect against losing the volume — it protects
against the migration itself being wrong, which is the failure this step is for. Delete it once the
deploy has been verified.

**`numReplicas` stays 1.** Two processes would mean two writers on one SQLite file, two
independent in-memory rate limiters, and — most importantly — two reminder sweeps racing to send
the same notification. PLAN.md §4 and §7 both depend on there being exactly one.
