# Deploying travel-app

Railway, Dockerfile build, one instance, SQLite on a volume, Litestream to object storage.
This is budget-app's runbook adapted — the gotchas below are its hard-won ones, not
hypotheticals, and each has already cost real time once.

PLAN.md §11 puts deployment at **Phase 1**, before auth and before any real trip exists. That
ordering is deliberate: this is the cheapest moment to get the infrastructure wrong.

## 1. Railway service

- New project → Deploy from repo. `railway.json` selects the Dockerfile builder and points the
  healthcheck at `/health`.
- **Watch Paths: clear them entirely.** A commit touching only unwatched paths is marked
  *skipped*, not failed — the deploy never happens and the site keeps serving the previous
  build, with nothing anywhere reporting a problem. This cost budget-app a day. If you must set
  them, cover `app/**`, `server/**`, `shared/**`, `deploy/**`, `Dockerfile`, `railway.json`,
  `package.json`, `package-lock.json`.

## 2. The volume

- Attach a volume and mount it at **`/data`**. Not `/app/data`, not anywhere else.
- Mounted anywhere else, SQLite happily writes to the container filesystem. Everything works.
  Every account and every trip is discarded on the next deploy, silently.

## 3. Environment variables

| Variable | Value | Notes |
|---|---|---|
| `DATABASE_URL` | `file:/data/travel.db` | Set by the Dockerfile; override only to move the file |
| `PUBLIC_URL` | `https://<your-domain>` | Used to build links in email |
| `APP_ORIGIN` | `https://<your-domain>` | Cross-origin allow-list; must include the scheme |
| `TRUST_PROXY` | `true` | Railway terminates TLS in front of the app |
| `LITESTREAM_*` | see §4 | Four variables; without them there is no backup |

Mail (`RESEND_API_KEY`, `MAIL_FROM`) is added in Phase 2 with the mailer. `MAIL_FROM` must be an
address on a domain verified with Resend — the provider's `@resend.dev` test sender accepts the
send and delivers only to the account owner, so every invitation would silently reach nobody.

## 4. Litestream — do this in Phase 1, not later

Four variables and a redeploy:

```
LITESTREAM_BUCKET=travel-backups
LITESTREAM_ENDPOINT=https://<s3-compatible-endpoint>
LITESTREAM_ACCESS_KEY_ID=...
LITESTREAM_SECRET_ACCESS_KEY=...
```

`deploy/entrypoint.sh` restores from the replica when `/data/travel.db` is absent, then runs the
server under `litestream replicate -exec`. With `LITESTREAM_BUCKET` unset it prints a warning and
starts anyway — read the logs on first deploy and confirm you are not seeing it.

**Then run the restore drill.** PLAN.md §11 makes Phase 1 complete only when a restore has
actually been rehearsed, not merely configured. budget-app deferred this, ran live with real user
data and no backup, and its own notes say: do not treat the restore drill as pending, treat it as
impossible until you have done it once.

## 5. Two things that break silently

- **`VITE_API_URL` is a build-time value.** `/` means same-origin, which is the deployed shape.
  Unset, the build succeeds, the page loads, and there is no sign-in at all. The Dockerfile sets
  it and `app/src/config.test.ts` pins it.
- **`tsx` is a runtime dependency of `@travel/server`, not a dev one.** The image runs
  `npm prune --omit=dev` and the server executes TypeScript directly. Moving `tsx` to
  `devDependencies` makes the container delete its own loader and fail to boot.

## 6. The Linux-binary lockfile trap

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

## 7. Testing the image locally

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

`--platform linux/amd64` matters: Railway runs x86_64, and the `optionalDependencies` in §6 pin
x64 binaries only. Building without it produces an arm64 image whose `npm ci` cannot find a
matching Rolldown binding.

Two caveats when running the amd64 image on an Apple Silicon machine:

- It runs under QEMU emulation and is **slow** — allow a few minutes for a build, and several
  seconds for the container to answer.
- Emulated Go binaries occasionally crash with `fatal error: receive on synctest channel from
  outside bubble` from esbuild. That is a QEMU artifact, not a defect in the image; it does not
  reproduce on native x86_64.

What this verified, all of which §5 and §6 exist to protect:

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

## 8. DNS (Phase 4)

Inbound booking email needs a subdomain (e.g. `trips.<domain>`) with Resend's inbound MX record,
at the **lowest priority value** or mail will not route to Resend. Keep it distinct from the
outbound sending domain.
