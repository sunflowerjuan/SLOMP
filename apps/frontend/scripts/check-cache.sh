#!/bin/sh
# Checks the cache headers a site actually serves:
#   sh scripts/check-cache.sh http://localhost:4173     (after `vite preview`)
#   sh scripts/check-cache.sh https://<static website endpoint>
# index.html must be revalidated and every hashed file under /assets/ must be
# immutable.
set -eu

BASE="${1:?usage: check-cache.sh <base-url>}"
BASE="${BASE%/}"
status=0

header() { curl -sI "$1" | tr -d '\r' | grep -i '^cache-control:' | cut -d' ' -f2- || true; }

expect() { # label url pattern
  got=$(header "$2")
  if printf '%s' "$got" | grep -Eq "$3"; then
    printf 'ok    %-28s %s\n' "$1" "$got"
  else
    printf 'FAIL  %-28s %s (wanted /%s/)\n' "$1" "${got:-<no Cache-Control>}" "$3"
    status=1
  fi
}

expect "index.html" "$BASE/" 'no-cache|max-age=0'
assets=$(curl -s "$BASE/" | grep -o '/assets/[^"]*' | sort -u)
[ -n "$assets" ] || { echo "FAIL  no /assets/ files referenced by index.html"; exit 1; }
# Fonts and the like are referenced from the CSS, not from index.html.
for css in $(printf '%s\n' "$assets" | grep '\.css$'); do
  assets="$assets
$(curl -s "$BASE$css" | grep -o 'url([^)]*)' | sed 's/^url(//;s/)$//' | grep '^/assets/' || true)"
done
for path in $(printf '%s\n' "$assets" | sort -u); do
  expect "$(basename "$path")" "$BASE$path" 'max-age=31536000.*immutable'
done
exit $status
