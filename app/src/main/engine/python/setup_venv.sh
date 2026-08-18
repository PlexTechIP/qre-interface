#!/usr/bin/env bash
# app/src/main/engine/python/setup_venv.sh
set -euo pipefail
cd "$(dirname "$0")"

# The 3.13 series, at 3.13.14 or newer.
#
# This asked for exactly 3.13.14 until a patch release broke every CI run that
# used it. The workflow requests `python-version: "3.13"`, which resolves to the
# newest 3.13.x on the runner, so the day 3.13.15 shipped (2026-08-05) the
# engine job started failing on every branch — including main — with no commit
# behind it.
#
# The series is what actually matters: `qdk[qre]==1.30.0` in requirements.txt
# pins the estimator itself, and its wheels target 3.13 as a whole. A patch
# release inside the series is ABI-compatible and cannot move the numbers the
# engine tests check, so an exact patch pin was stricter than the thing it was
# protecting and failed on a date rather than on a change.
required_minor="3.13"
required_patch=14

actual_python="$(python3 -c 'import sys; print("%d.%d.%d" % sys.version_info[:3])')"
IFS=. read -r actual_major actual_minor actual_patch <<<"$actual_python"

if [ "${actual_major}.${actual_minor}" != "$required_minor" ] ||
  [ "$actual_patch" -lt "$required_patch" ]; then
  echo "Python ${required_minor}.${required_patch} or a later ${required_minor}.x is required; python3 resolved to $actual_python" >&2
  exit 1
fi

python3 -m venv .venv
./.venv/bin/python3 -m pip install --quiet -r requirements.txt
echo "Python venv ready at $(pwd)/.venv"
