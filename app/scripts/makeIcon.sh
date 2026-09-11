#!/usr/bin/env bash
# Regenerate the app icons. Run on macOS (needs iconutil + sips).
#
#   scripts/makeIcon.sh
#
# Produces build-resources/icon.png, icon.ico (via makeIcon.py) and icon.icns.
set -euo pipefail
cd "$(dirname "$0")/.."

PY="src/main/engine/python/.venv/bin/python3"
[ -x "$PY" ] || PY="python3"

# 1. Master PNG + Windows ICO.
"$PY" scripts/makeIcon.py

# 2. macOS ICNS from the master PNG.
OUT="build-resources"
ICONSET="$OUT/icon.iconset"
rm -rf "$ICONSET"
mkdir -p "$ICONSET"
for size in 16 32 128 256 512; do
  sips -z "$size" "$size"           "$OUT/icon.png" --out "$ICONSET/icon_${size}x${size}.png" >/dev/null
  sips -z "$((size*2))" "$((size*2))" "$OUT/icon.png" --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$OUT/icon.icns"
rm -rf "$ICONSET"
echo "Wrote $OUT/icon.icns"
