#!/usr/bin/env bash
# Copies Caddy's Let's Encrypt certificate for the domain to ./pg-certs so the
# db serves TLS with a certificate Power BI Service trusts (SL-133). Postgres
# needs the key owned by its user (uid 999) with mode 600. `deploy` has no
# sudo, so the chown runs in a throwaway container of the db image. Run from
# any directory, as `deploy`:
#   - once, BEFORE approving the deploy that publishes 5432 (ssl=on fails
#     without the files and the release rolls back);
#   - weekly from cron, to follow renewals (the db reloads it, no restart).
# ponytail: a new cert is read on reload only; weekly is plenty for 60-day renewals.
set -euo pipefail

cd "$(dirname "$0")/.."
domain=$(sed -n 's/^DOMAIN=//p' .env.prod)
compose="docker compose --env-file .env.prod -f docker-compose.prod.yml"
src="/data/caddy/certificates/acme-v02.api.letsencrypt.org-directory/${domain}/${domain}"

mkdir -p pg-certs
# Files owned by uid 999 from a previous run: the directory is ours, so rm works.
rm -f pg-certs/server.crt pg-certs/server.key
$compose cp "proxy:${src}.crt" pg-certs/server.crt
$compose cp "proxy:${src}.key" pg-certs/server.key
docker run --rm --user root -v "$PWD/pg-certs:/c" --entrypoint sh postgres:16 \
  -c 'chown 999:999 /c/server.crt /c/server.key && chmod 600 /c/server.key && chmod 644 /c/server.crt'

# First run: the db is not using TLS yet, or not up; nothing to reload.
$compose exec -T db psql -U postgres -d slomp -c "SELECT pg_reload_conf()" 2>/dev/null || true
