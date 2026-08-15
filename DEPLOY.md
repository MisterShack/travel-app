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

You need three things. The first two are quick; the third is the one people skip.

1. **A GitHub repo.** Railway deploys from it and auto-builds on push.
2. **A Railway account** with this repo connected.
3. **An S3-compatible bucket** for Litestream, plus an access key and secret.
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
| `LITESTREAM_*` | see §5 | Four variables; without them there is no backup |

Set by the Dockerfile, override only deliberately: `DATABASE_URL`, `STATIC_DIR`, `PORT`,
`NODE_ENV`.

Mail (`RESEND_API_KEY`, `MAIL_FROM`) arrives in Phase 2 with the mailer. `MAIL_FROM` must be an
address on a domain verified with Resend — the provider's `@resend.dev` test sender accepts the
send and delivers only to the account owner, so every invitation would silently reach nobody.
budget-app's `env.ts` refuses to boot in production if it sees one; port that guard with the
mailer.

---

## 4. Point the domain at it

The domain is **`trips.myze.ca`** (decided 2026-08-15), the parallel to budget-app's
`ledger.myze.ca`. So `APP_ORIGIN` and `PUBLIC_URL` are both `https://trips.myze.ca`.

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
```

Expect JSON, an HTML content type, and `200` (the SPA fallback) respectively.

Phase 1 checklist — there is no auth or data yet, so this is deliberately short:

- [ ] `/health` returns `{"status":"ok",...}` over a valid certificate.
- [ ] `/` serves the client shell.
- [ ] A deep link like `/trips/anything` serves the shell rather than 404ing.
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

---

## 9. The Linux-binary lockfile trap

npm records only the *current* platform's optional native packages (npm/cli#4828), so a lockfile
generated on macOS describes only macOS and `npm ci` inside the Linux image fails on a missing
binary. Root `optionalDependencies` declares the Linux builds explicitly so they land in the
lockfile. They are never installed locally — the `os` field excludes them — they exist purely to
be *recorded*.

**This was measured on 2026-08-15, not assumed.** Regenerating `package-lock.json` with the
`optionalDependencies` block removed drops the Linux entries from 22 to **zero**. The bug is
still live on npm 11.17.0; it is not something budget-app worked around historically and has
since been fixed.

Currently declared, at the versions this repo actually resolves:

| Package | Version | Why |
|---|---|---|
| `@rolldown/binding-linux-x64-gnu` | 1.2.4 | Vite 8 bundles with **Rolldown**, not Rollup |
| `@esbuild/linux-x64` | 0.28.2 | Vite's dependency-prebundling and TS transform |
| `lightningcss-linux-x64-gnu` | 1.33.0 | Vite's CSS pipeline |

Note that budget-app pins `@rollup/rollup-linux-x64-gnu`, and that is **not** the right pin here:
Vite 8 replaced Rollup with Rolldown, and `rollup` is not in this dependency tree at all. Copying
budget-app's list verbatim would leave the real binaries unpinned while pinning one nothing uses.

Rules for keeping this correct:

- **Versions are exact, not ranges** — each must match the package it backs. After any bump of
  `vite`, re-read the resolved versions and update all three together:
  ```sh
  node -p "require('./node_modules/@rolldown/binding-darwin-arm64/package.json').version"
  node -p "require('./node_modules/esbuild/package.json').version"
  node -p "require('./node_modules/lightningcss/package.json').version"
  ```
- **To verify the lockfile still describes the image**, check all three are present:
  ```sh
  node -e "const p=require('./package-lock.json').packages; for (const n of ['@rolldown/binding-linux-x64-gnu','@esbuild/linux-x64','lightningcss-linux-x64-gnu']) console.log(('node_modules/'+n in p)?'OK  ':'MISS', n)"
  ```
- **These cover linux-x64 only**, which is what Railway runs and what the Dockerfile's Litestream
  download assumes. Building the image on an arm64 machine needs the `-arm64-` variants added.
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

Inbound booking email needs its own subdomain with Resend's inbound MX record, at the **lowest
priority value** or mail will not route to Resend.

> **It cannot be the same name the app is served from.** DNS forbids a CNAME coexisting with any
> other record type on the same name, so if the app is at `trips.myze.ca` via CNAME (§4), that
> name cannot also carry an MX record. Use a distinct label — `inbox.myze.ca`, or
> `mail-in.myze.ca` — and keep it separate from `mail.myze.ca`, which budget-app already uses for
> *outbound* sending.

| Type | Name | Value | Priority |
|---|---|---|---|
| `MX` | `inbox` | the target Resend gives you | lowest number present |

Verify the domain in Resend's dashboard before pointing the webhook at it. §6 of PLAN.md covers
what happens to the mail once it arrives.

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

**`numReplicas` stays 1.** Two processes would mean two writers on one SQLite file, two
independent in-memory rate limiters, and — most importantly — two reminder sweeps racing to send
the same notification. PLAN.md §4 and §7 both depend on there being exactly one.
