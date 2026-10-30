#!/usr/bin/env bash
# Nightly backup of the production stack, kept on the VPS itself: the
# PostgreSQL database and the Azurite volume (templates, PDF queues, bulk
# ZIPs). Keeps 7 daily and 4 weekly backups (Sunday's).
#
# Run by cron as the `deploy` user, from the repository on the VPS:
#   0 7 * * * /home/deploy/slomp/ops/backup.sh >> /home/deploy/backups/backup.log 2>&1
# (07:00 UTC is 02:00 in Bogotá, which has no daylight saving time.)
#
# These copies live on the same server: they cover a mistake, a broken
# migration or damaged data, not the loss of the VPS itself.
set -euo pipefail

OPS_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(dirname "$OPS_DIR")"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups}"
COMPOSE_FILE="${COMPOSE_FILE:-$REPO_DIR/docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-$REPO_DIR/.env.prod}"
DB_NAME="${DB_NAME:-slomp}"
KEEP_DAILY="${KEEP_DAILY:-7}"
KEEP_WEEKLY="${KEEP_WEEKLY:-4}"
# Optional: a heartbeat URL of the uptime service, called after a successful
# run, so a night without a backup raises an alert too.
HEARTBEAT_URL="${HEARTBEAT_URL:-}"

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

log() {
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $*"
}

fail() {
  log "ERROR: $*"
  exit 1
}

# The date in the name is Bogotá's, although the server runs on UTC.
STAMP="$(TZ=America/Bogota date +%Y-%m-%d)"
WEEKDAY="$(TZ=America/Bogota date +%u)" # 7 = Sunday
DAILY_DIR="$BACKUP_DIR/daily"
WEEKLY_DIR="$BACKUP_DIR/weekly"
DB_FILE="slomp-db-$STAMP.dump"
STORAGE_FILE="slomp-storage-$STAMP.tar.gz"

# Backups hold taxpayers' data: only `deploy` can read them.
umask 077
mkdir -p "$DAILY_DIR" "$WEEKLY_DIR"
chmod 700 "$BACKUP_DIR" "$DAILY_DIR" "$WEEKLY_DIR"

log "database: pg_dump of $DB_NAME"
compose exec -T db pg_dump -U postgres -d "$DB_NAME" -Fc >"$DAILY_DIR/$DB_FILE.part"
# A dump pg_restore can't read is not a backup.
compose exec -T db pg_restore --list <"$DAILY_DIR/$DB_FILE.part" >/dev/null ||
  fail "the database dump is not readable"
mv "$DAILY_DIR/$DB_FILE.part" "$DAILY_DIR/$DB_FILE"

# Azurite keeps part of its metadata in memory and writes it when it stops,
# so it is stopped for the copy: a few seconds at night, with no PDF
# generation going on.
log "storage: copying the Azurite volume"
STORAGE_CONTAINER="$(compose ps -aq azurite)"
[ -n "$STORAGE_CONTAINER" ] || fail "no azurite container"
compose stop azurite >/dev/null
trap 'compose start azurite >/dev/null' EXIT
# Streamed out, so the file belongs to `deploy` with the umask above, not to
# the container's root.
docker run --rm --volumes-from "$STORAGE_CONTAINER" alpine:3.20 \
  tar czf - -C /data . >"$DAILY_DIR/$STORAGE_FILE.part"
compose start azurite >/dev/null
trap - EXIT
tar tzf "$DAILY_DIR/$STORAGE_FILE.part" >/dev/null || fail "the storage archive is not readable"
mv "$DAILY_DIR/$STORAGE_FILE.part" "$DAILY_DIR/$STORAGE_FILE"

# Sunday's backup is also a weekly one.
if [ "$WEEKDAY" = 7 ]; then
  cp -p "$DAILY_DIR/$DB_FILE" "$DAILY_DIR/$STORAGE_FILE" "$WEEKLY_DIR/"
fi

# Keeps the newest N of each kind, by the date in the name.
prune() {
  local dir="$1" keep="$2" prefix
  for prefix in slomp-db- slomp-storage-; do
    find "$dir" -maxdepth 1 -name "${prefix}*" ! -name '*.part' | sort -r |
      tail -n +"$((keep + 1))" | xargs -r rm -f
  done
  # Leftovers of a run that failed half way.
  find "$dir" -maxdepth 1 -name '*.part' -mmin +60 -delete
}
prune "$DAILY_DIR" "$KEEP_DAILY"
prune "$WEEKLY_DIR" "$KEEP_WEEKLY"

if [ -n "$HEARTBEAT_URL" ]; then
  curl -fsS -m 10 --retry 3 "$HEARTBEAT_URL" >/dev/null || log "heartbeat failed"
fi
log "done: $DB_FILE ($(du -h "$DAILY_DIR/$DB_FILE" | cut -f1)) and $STORAGE_FILE ($(du -h "$DAILY_DIR/$STORAGE_FILE" | cut -f1))"
