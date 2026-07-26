#!/usr/bin/env bash
# Resumable download of the Wikidata JSON dump for authoritypacks extraction.
# Re-run after Ctrl+C or network failure; wget -c continues where it left off.
set -euo pipefail

URL="https://dumps.wikimedia.org/wikidatawiki/entities/latest-all.json.bz2"
DEST="${WIKIDATA_DUMP_PATH:-$HOME/Data/latest-all.json.bz2}"
LOG="${WIKIDATA_DUMP_LOG:-$HOME/Data/wikidata-dump-download.log}"

mkdir -p "$(dirname "$DEST")"

echo "Wikidata dump download"
echo "  URL:  $URL"
echo "  Dest: $DEST"
echo "  Log:  $LOG"
echo "  Size: ~95 GB compressed (102354154676 bytes as of 2026-07-22 dump)"
echo ""
echo "Interrupt anytime (Ctrl+C). Re-run this script to resume."
echo ""

wget -c \
  --progress=dot:giga \
  --timeout=60 \
  --tries=0 \
  --retry-connrefused \
  --waitretry=5 \
  -O "$DEST" \
  "$URL" \
  2>&1 | tee -a "$LOG"
