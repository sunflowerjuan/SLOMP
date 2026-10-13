#!/bin/sh
# Usage: test/smoke.sh [base-url]   (default http://localhost:3001)
# Converts test/sample.docx and checks the response is a complete PDF.
set -eu
base="${1:-http://localhost:3001}"
out="$(mktemp)"
curl -fsS --data-binary @"$(dirname "$0")/sample.docx" -H 'Content-Type: application/octet-stream' "$base/convert" -o "$out"
head -c 5 "$out" | grep -q '%PDF-' && tail -c 1024 "$out" | grep -q '%%EOF'
echo "OK: $(wc -c < "$out") byte PDF"
rm -f "$out"
