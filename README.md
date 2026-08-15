# travel-app

A personal/family travel agent — flights, lodging, and activities merged into one timeline per
trip, with reminders and (later) restaurant/attraction suggestions.

- **PLAN.md** — the spec. Read this first.
- **CLAUDE.md** — project guide and non-negotiables for anyone (human or model) working here.
- **DEPLOY.md** — the Railway/Litestream runbook.

**Live at <https://trips.myze.ca>**

## Status

Phases 0–3 are shipped: auth, shared trips, the merged timeline, and an installable PWA that
still shows your itinerary with no network. 84 tests; `typecheck` and `lint` clean.

The `linux/amd64` image also **builds and runs**: `/health` answers JSON while `/` and
`/trips/abc` serve the client, `tsx` survives the prune, and only Linux native binaries are inside.
Local Docker is Colima (`colima start`), not Docker Desktop — see DEPLOY.md §7.

## Working on this

```sh
npm install
npm run typecheck && npm run lint && npm test
npm run dev:server    # http://localhost:8787/health
npm run dev           # http://localhost:5173
```

To exercise the deployed shape locally — one process serving both the client and the API:

```sh
VITE_API_URL=/ npm run build
STATIC_DIR="$PWD/app/dist" npm run start --workspace @travel/server
```

`STATIC_DIR` must be **absolute**. A relative path resolves against the process cwd, so it works
from the repo root and silently 404s the whole client when the workspace script runs it from
`server/`. The server now refuses to start rather than boot into that state.

`npm install` prints a warning that `esbuild`'s postinstall script was not run. That is npm 11
declining to run install scripts by default, and it is fine to leave: the platform binary comes
from `optionalDependencies`, and the build works without it. Do not approve it just to silence
the warning.

## Layout

| Path | What |
|---|---|
| `shared/` | `@travel/shared` — Zod schemas, imported verbatim by client and server |
| `app/` | `@travel/app` — Vite/React PWA client |
| `server/` | `@travel/server` — Hono API |
