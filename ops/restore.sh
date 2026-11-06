#!/usr/bin/env bash
# Restores a backup made by ops/backup.sh into the production stack of this
# machine: the PostgreSQL database and the Azurite volume. Overwrites both.
# Steps and checks: Confluence, "Respaldos y restauración".
#
#   ops/restore.sh ~/backups/daily/slomp-db-DATE.dump ~/backups/daily/slomp-storage-DATE.tar.gz
set -euo pipefail

[ $# -eq 2 ] || {
  echo "usage: $0 <slomp-db-DATE.dump> <slomp-storage-DATE.tar.gz>" >&2
  exit 2
}
DB_BACKUP="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
STORAGE_BACKUP="$(cd "$(dirname "$2")" && pwd)/$(basename "$2")"

OPS_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(dirname "$OPS_DIR")"
COMPOSE_FILE="${COMPOSE_FILE:-$REPO_DIR/docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-$REPO_DIR/.env.prod}"
DB_NAME="${DB_NAME:-slomp}"

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

log() {
  echo "$(date -u +%H:%M:%S) $*"
}

log "stopping the services that use the data"
compose stop proxy backend pdf 2>/dev/null || true

log "starting only the database and the storage"
compose up -d --wait db azurite

log "restoring the database"
compose exec -T db pg_restore -U postgres -d "$DB_NAME" --clean --if-exists \
  --no-owner --exit-on-error <"$DB_BACKUP"

log "restoring the storage volume"
STORAGE_CONTAINER="$(compose ps -aq azurite)"
compose stop azurite >/dev/null
docker run --rm --volumes-from "$STORAGE_CONTAINER" \
  -v "$(dirname "$STORAGE_BACKUP"):/backup:ro" alpine:3.20 sh -c \
  "find /data -mindepth 1 -delete && tar xzf '/backup/$(basename "$STORAGE_BACKUP")' -C /data"

log "starting the whole stack"
compose up -d --wait
log "done: check /api/health and the templates in the panel"
