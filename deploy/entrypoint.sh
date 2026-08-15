#!/bin/sh
set -eu

# Restore before starting, then run the server under Litestream so every write
# is replicated continuously.
#
# The restore is what makes the volume disposable: on a fresh machine the
# database is rebuilt from object storage before anything serves traffic. It is
# a no-op when the file already exists, so a normal restart is unaffected.

DB_PATH="${DB_PATH:-/data/travel.db}"

if [ -z "${LITESTREAM_BUCKET:-}" ]; then
  echo "WARNING: LITESTREAM_BUCKET is not set — trips are NOT being backed up." >&2
  echo "Losing the volume would lose every account and every trip. See DEPLOY.md." >&2
  echo "Starting without replication." >&2
  exec node --import tsx server/src/index.ts
fi

if [ -f "$DB_PATH" ]; then
  echo "Database present at $DB_PATH; skipping restore."
else
  echo "No database at $DB_PATH; attempting restore from replica."
  # -if-replica-exists so a genuinely first deploy starts empty rather than
  # failing; migrations then create the schema.
  litestream restore -if-replica-exists -config /etc/litestream.yml "$DB_PATH"
fi

# `litestream replicate -exec` supervises the process: if the server exits,
# Litestream exits too, so the machine restarts rather than sitting there
# replicating a database nothing is writing to.
exec litestream replicate -config /etc/litestream.yml -exec "node --import tsx server/src/index.ts"
