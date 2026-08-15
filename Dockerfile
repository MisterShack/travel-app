# syntax=docker/dockerfile:1

# Debian slim rather than Alpine: @libsql/client and @node-rs/argon2 (arriving
# in Phase 2) ship prebuilt glibc binaries, and on musl they would fall back to
# building from source — or fail. Node 24 to match development.
FROM node:24-slim AS build

WORKDIR /app

# Manifests first, so a dependency install is cached until they actually change.
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY app/package.json app/
COPY server/package.json server/

# `npm ci` works here only because the root package.json declares the Linux
# native binaries as optionalDependencies — npm records only the *current*
# platform's optional packages (npm/cli#4828), so a lockfile generated on macOS
# describes only macOS. Without them this build fails on a missing
# @rollup/rollup-linux-x64-gnu. See DEPLOY.md.
RUN npm ci

COPY . .

# The client is built here and served by the server at runtime: one origin, so
# no CORS and no cross-site cookie questions in production.
#
# `/` means same-origin (see app/src/config.ts). It must be set: unset builds a
# client with no sign-in at all, which looks like a working deploy right up
# until someone tries to log in.
ENV VITE_API_URL=/
RUN npm run build --workspace @travel/app

# Drop everything only needed to build. tsx stays — the server runs TypeScript
# directly, so it is a runtime dependency of this image, not a dev tool.
RUN npm prune --omit=dev

# ---------------------------------------------------------------------------

FROM node:24-slim AS runtime

# Litestream streams the SQLite file to object storage continuously, so trips
# survive losing the machine and its volume. ca-certificates is needed for both
# the Resend API and the replica endpoint.
ARG LITESTREAM_VERSION=0.3.13
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates wget \
  && wget -q "https://github.com/benbjohnson/litestream/releases/download/v${LITESTREAM_VERSION}/litestream-v${LITESTREAM_VERSION}-linux-amd64.deb" \
  && dpkg -i "litestream-v${LITESTREAM_VERSION}-linux-amd64.deb" \
  && rm "litestream-v${LITESTREAM_VERSION}-linux-amd64.deb" \
  && apt-get purge -y wget \
  && apt-get autoremove -y \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/shared ./shared
COPY --from=build /app/server ./server
COPY --from=build /app/app/dist ./app/dist

COPY deploy/litestream.yml /etc/litestream.yml
COPY deploy/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# The volume is mounted here; the database and its WAL live inside. Anywhere
# else and SQLite writes to the container filesystem, which works perfectly and
# silently discards every trip on each deploy.
ENV DATABASE_URL=file:/data/travel.db
ENV STATIC_DIR=/app/app/dist
ENV PORT=8080
EXPOSE 8080

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
