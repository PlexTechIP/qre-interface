#!/usr/bin/env bash
# app/src/main/engine/python/setup_venv.sh
set -euo pipefail
cd "$(dirname "$0")"
python3 -m venv .venv
./.venv/bin/pip install --quiet -r requirements.txt
echo "Python venv ready at $(pwd)/.venv"
