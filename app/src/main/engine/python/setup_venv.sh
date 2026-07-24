#!/usr/bin/env bash
# app/src/main/engine/python/setup_venv.sh
set -euo pipefail
cd "$(dirname "$0")"
actual_python="$(python3 -c 'import platform; print(platform.python_version())')"
if [ "$actual_python" != "3.13.14" ]; then
  echo "Python 3.13.14 is required; python3 resolved to $actual_python" >&2
  exit 1
fi
python3 -m venv .venv
./.venv/bin/python3 -m pip install --quiet -r requirements.txt
echo "Python venv ready at $(pwd)/.venv"
