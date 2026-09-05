#!/usr/bin/env bash
#
# Restore a backup archive produced by the "Back up now" button.
#
#   scripts/restore.sh backups/media-server-<timestamp>.tar.gz --yes
#
# This REPLACES the current database. Everything presently in it is lost, so
# the --yes argument is required rather than a prompt you can hold enter on.
#
# Deliberately a script rather than a UI action: the server runs migrations at
# import with no retry, so it has to be stopped while its database is swapped
# underneath it.
#
# Restoring an older backup onto newer code is fine and expected. The dump
# carries drizzle's bookkeeping table at whatever position it was taken, so on
# the next boot the migrator replays exactly the migrations recorded since.
set -euo pipefail

ARCHIVE="${1:-}"
CONFIRM="${2:-}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE="docker compose -f docker/docker-compose.yml -f docker/docker-compose.dev.yml"

if [[ -z "$ARCHIVE" || ! -f "$ARCHIVE" ]]; then
  echo "usage: scripts/restore.sh <backup.tar.gz> --yes" >&2
  echo >&2
  echo "available backups:" >&2
  ls -1t "$REPO_ROOT"/backups/media-server-*.tar.gz 2>/dev/null | sed 's/^/  /' >&2 || echo "  (none)" >&2
  exit 1
fi

if [[ "$CONFIRM" != "--yes" ]]; then
  echo "This will REPLACE the current database with the contents of:" >&2
  echo "  $ARCHIVE" >&2
  echo >&2
  echo "Everything currently in the library — including anything added since that" >&2
  echo "backup — will be lost. Re-run with --yes to proceed." >&2
  exit 1
fi

ARCHIVE="$(cd "$(dirname "$ARCHIVE")" && pwd)/$(basename "$ARCHIVE")"
cd "$REPO_ROOT"

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

echo "==> unpacking"
tar xzf "$ARCHIVE" -C "$WORK_DIR"
[[ -f "$WORK_DIR/db.sql" ]] || { echo "archive has no db.sql — is this a backup?" >&2; exit 1; }

# Postgres stays up (it's the thing being restored into); only the app stops,
# so it can't run migrations or serve requests against a half-restored state.
echo "==> stopping the app"
$COMPOSE stop app >/dev/null

echo "==> restoring the database"
# The dump was taken with --clean --if-exists, so it drops and recreates each
# object itself. ON_ERROR_STOP turns a partial restore into a loud failure
# rather than a database that looks fine and isn't.
$COMPOSE exec -T postgres psql -v ON_ERROR_STOP=1 -U media -d media < "$WORK_DIR/db.sql" >/dev/null

echo "==> restoring uploaded images"
# The app container is stopped, so a throwaway container mounts the named
# volume directly. Volume name is <project>_app-data; the project is the
# compose directory name.
VOLUME="$(basename "$REPO_ROOT")_app-data"
if ! docker volume inspect "$VOLUME" >/dev/null 2>&1; then
  VOLUME="docker_app-data" # compose project defaults to the docker/ dir
fi
docker run --rm \
  -v "$VOLUME":/app-data \
  -v "$WORK_DIR/uploads":/uploads:ro \
  alpine:3 sh -c '
    mkdir -p /app-data/item-thumbnails /app-data/performer-images
    cp -R /uploads/item-thumbnails/. /app-data/item-thumbnails/ 2>/dev/null || true
    cp -R /uploads/performer-images/. /app-data/performer-images/ 2>/dev/null || true
  '

echo "==> starting the app"
$COMPOSE start app >/dev/null

echo
echo "Restored from $(basename "$ARCHIVE")."
echo "Posters and preview clips were not in the backup by design — run a scan"
echo "from the app to regenerate them from your video files."
