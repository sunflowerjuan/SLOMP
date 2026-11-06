#!/usr/bin/env bash
# Puts one commit in production on the VPS (SL-148). Run as `deploy`:
#   ~/slomp/ops/deploy.sh <commit-hash>
# The deploy workflow calls it, and it is also the manual rollback: pass the
# hash of an earlier commit. Images are pulled only if the VPS lacks them (the
# last two of each service are kept). If /health doesn't answer 200 in 2 min
# it goes back to the previous commit and exits 1. Database migrations are
# never reverted (restore from the SL-147 backup instead).
set -euo pipefail

cd "$(dirname "$0")/.."
git fetch -q origin
sha=$(git rev-parse --verify "${1:?usage: ops/deploy.sh <commit-hash>}^{commit}")
# Compose file and this script must be the ones of that commit; re-exec so
# bash doesn't keep running the old text.
if [ "$(git rev-parse HEAD)" != "$sha" ]; then
  git checkout -q "$sha"
  exec "$0" "$sha"
fi

export IMAGE_REPO=${IMAGE_REPO:-ghcr.io/sunflowerjuan/slomp} IMAGE_TAG=$sha
state=$HOME/.slomp-deployed
dc() { docker compose --env-file .env.prod -f docker-compose.prod.yml "$@"; }

wait_health() {
  local domain; domain=$(sed -n 's/^DOMAIN=//p' .env.prod)
  for _ in $(seq 24); do
    curl -fsS -o /dev/null --max-time 5 "https://$domain/api/health" && return 0
    sleep 5
  done
  return 1
}

release() {
  dc pull --policy missing || return 1
  dc run --rm migrate || return 1
  dc up -d --no-build --remove-orphans || return 1
  wait_health
}

if release; then
  echo "$sha" > "$state"
  # Keep the two newest images of each service; running ones can't be removed.
  for s in backend migrate pdf proxy; do
    docker images --format '{{.Repository}}:{{.Tag}}' "$IMAGE_REPO-$s" | tail -n +3 | xargs -r docker rmi || true
  done
  echo "Deployed $sha"
  exit 0
fi

prev=$(cat "$state" 2>/dev/null || true)
echo "Release $sha failed its health check" >&2
if [ -n "$prev" ] && [ "$prev" != "$sha" ] && [ -z "${NO_ROLLBACK:-}" ]; then
  echo "Rolling back to $prev" >&2
  NO_ROLLBACK=1 "$0" "$prev" || echo "Rollback to $prev failed too" >&2
else
  echo "No previous release recorded: nothing to go back to" >&2
fi
exit 1
