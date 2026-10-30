#!/usr/bin/env bash
# Shows the log settings Docker applied to each container of the production
# stack. Every one should be json-file with max-size 10m and max-file 5
# (docker-compose.prod.yml); one that isn't would fill the disk.
set -euo pipefail

OPS_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(dirname "$OPS_DIR")"
COMPOSE_FILE="${COMPOSE_FILE:-$REPO_DIR/docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-$REPO_DIR/.env.prod}"

status=0
for id in $(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps -aq); do
  line="$(docker inspect -f '{{.Name}} {{.HostConfig.LogConfig.Type}} max-size={{index .HostConfig.LogConfig.Config "max-size"}} max-file={{index .HostConfig.LogConfig.Config "max-file"}}' "$id")"
  echo "$line"
  case "$line" in
  *" json-file max-size=10m max-file=5") ;;
  *) status=1 ;;
  esac
done
if [ "$status" = 0 ]; then
  echo "OK: every container rotates its logs"
else
  echo "WARNING: some container does not rotate its logs"
fi
exit "$status"
