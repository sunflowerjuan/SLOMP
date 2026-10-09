#!/bin/sh
# Uploads apps/frontend/dist to the Storage static website ($web) with the
# cache policy of the site (see vite.config.ts): hashed files under assets/ for
# a year, everything else revalidated. Order matters: assets go first and
# index.html last, so a visitor never gets an index that points to files that
# are not there yet.
#
#   STORAGE_ACCOUNT=stfrontendpredialdev pnpm --filter frontend run deploy:static
#   DRY_RUN=1 ...   prints the commands instead of running them
set -eu

: "${STORAGE_ACCOUNT:?set STORAGE_ACCOUNT to the static website account}"
DIST="${DIST:-dist}"
IMMUTABLE="public, max-age=31536000, immutable"
REVALIDATE="no-cache"
SHORT="public, max-age=3600"

run() {
  if [ -n "${DRY_RUN:-}" ]; then printf '%s\n' "$*"; else "$@"; fi
}

[ -f "$DIST/index.html" ] || { echo "No $DIST/index.html: run the build first." >&2; exit 1; }

run az storage blob upload-batch --auth-mode login --overwrite \
  --account-name "$STORAGE_ACCOUNT" --destination '$web' --source "$DIST" \
  --pattern 'assets/*' --content-cache-control "$IMMUTABLE"

# Not hashed: icons change rarely but not never.
for file in "$DIST"/*; do
  name=$(basename "$file")
  [ -f "$file" ] && [ "$name" != index.html ] || continue
  run az storage blob upload --auth-mode login --overwrite \
    --account-name "$STORAGE_ACCOUNT" --container-name '$web' \
    --file "$file" --name "$name" --content-cache-control "$SHORT"
done

run az storage blob upload --auth-mode login --overwrite \
  --account-name "$STORAGE_ACCOUNT" --container-name '$web' \
  --file "$DIST/index.html" --name index.html --content-cache-control "$REVALIDATE"
