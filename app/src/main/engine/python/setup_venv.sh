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

version_of() {
  "$1" -c 'import sys; print("%d.%d.%d" % sys.version_info[:3])' 2>/dev/null
}

matches_required() {
  local major minor patch
  IFS=. read -r major minor patch <<<"$1"
  [ "${major}.${minor}" = "$required_minor" ] && [ "$patch" -ge "$required_patch" ]
}

# python3 on PATH may not be 3.13.x — try python3.13 first if it exists.
python_bin=""
default_python_version=""
for candidate in python3.13 python3; do
  if command -v "$candidate" >/dev/null 2>&1; then
    candidate_version="$(version_of "$candidate")"
    [ "$candidate" = "python3" ] && default_python_version="$candidate_version"
    if [ -n "$candidate_version" ] && matches_required "$candidate_version"; then
      python_bin="$candidate"
      break
    fi
  fi
done

if [ -z "$python_bin" ]; then
  cat >&2 <<EOF
Python ${required_minor}.${required_patch} or a later ${required_minor}.x is required; python3 resolved to ${default_python_version:-not found}.

Install a ${required_minor}.x interpreter, then rerun this script:
  macOS (Homebrew):  brew install python@${required_minor}
  pyenv:             pyenv install ${required_minor}.${required_patch} && pyenv local ${required_minor}.${required_patch}
  Linux:             install your distro's python${required_minor} package

If it installs under a name other than python3.13 or python3, either add it
to PATH under one of those names, or point QRE_PYTHON_BIN at a venv built
from it directly.
EOF
  exit 1
fi

"$python_bin" -m venv .venv
./.venv/bin/python3 -m pip install --quiet -r requirements.txt
echo "Python venv ready at $(pwd)/.venv"
