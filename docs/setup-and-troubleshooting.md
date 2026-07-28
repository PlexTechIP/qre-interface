# Setup and Troubleshooting

This guide is for a clean local development setup of the QRE Dashboard on macOS
or Windows. Run commands from the repository root unless a step says otherwise.

## Prerequisites

- Node.js `24.18.0` and npm `11.16.0`
- Python `3.13.14`
- Git
- macOS with `nvm`, or Windows with PowerShell and a Node version manager

Node 24.18.0 is not optional. The app uses `node:sqlite` for local run history,
and that API is not available on Node 22.

## Install

Use the repository-pinned Node version:

```bash
nvm use
```

Install JavaScript dependencies from `app/`, not the repository root:

```bash
cd app
npm ci
```

Set up the Python QRE environment.

macOS:

```bash
src/main/engine/python/setup_venv.sh
```

Windows PowerShell:

```powershell
src/main/engine/python/setup_venv.ps1
```

The setup script creates `app/src/main/engine/python/.venv` and installs
`requirements.txt`, currently `qdk[qre]==1.30.0`. The venv is large, roughly
428 MB, so the first install can take several minutes.

## Run the app

From `app/`:

```bash
npm run dev
```

The dev script bundles Electron main and preload outputs, starts the Vite
renderer dev server, then launches Electron pointed at that server.

## Tests

From `app/`:

```bash
npm test
```

Runs the fast Vitest workspace: renderer/jsdom tests and Node-side unit tests
that do not require the real Python QDK environment.

```bash
npm run test:engine
```

Runs the real engine suite against the Python venv and QDK. This suite is
serialized because it spawns subprocesses and exercises heavier QRE estimates.
Use this after any QDK, wrapper, config translation, or result mapping change.

```bash
npm run test:all
```

Runs every Vitest suite with file parallelism disabled. Use this before final
acceptance when the Python venv is available.

## Local state

In the packaged/dev Electron app, run history is stored as SQLite under the
app's user-data directory in `run-history.sqlite`.

To isolate state or inspect a known database, set:

```bash
QRE_DB_PATH=/absolute/path/to/run-history.sqlite npm run dev
```

To force a specific Python interpreter, set:

```bash
QRE_PYTHON_BIN=/absolute/path/to/python npm run test:engine
```

## Troubleshooting

### `node:sqlite` cannot be found

Symptom: the app or tests fail during main-process/store imports with an error
that `node:sqlite` is unknown or cannot be resolved.

Fix:

```bash
nvm use
node --version
```

Confirm the version is `v24.18.0`, then rerun `npm ci` inside `app/` if needed.

### `resolvePythonBin` points at an interpreter that does not exist

Symptom: engine tests or a run fail with a missing interpreter path under
`app/src/main/engine/python/.venv`.

Fix: run the platform setup script again.

macOS:

```bash
cd app
src/main/engine/python/setup_venv.sh
```

Windows PowerShell:

```powershell
cd app
src/main/engine/python/setup_venv.ps1
```

If `QRE_PYTHON_BIN` is set, check that it points to an existing Python 3.13
interpreter with `qdk[qre]` installed.

### Engine tests fail because QDK is missing

Symptom: `npm run test:engine` reaches Python but fails to import `qdk` or
`qdk.qre`.

Fix: rebuild the venv from `requirements.txt`. Do not install `qdk` globally and
assume the app will find it; the default path is the repo-local venv.

### Dev app launches stale Electron code

Symptom: renderer changes appear, but main/preload behavior looks old, IPC
surfaces are missing, or the app behaves as if a previous bundle is still being
used.

Fix: stop the dev process and rerun:

```bash
cd app
npm run dev
```

The dev script rebuilds `dist-electron/main.cjs` and
`dist-electron/preload.cjs` before launching Electron.

### History contains old or surprising runs

Symptom: History shows records from previous manual tests, or save behavior is
hard to reason about because records are write-once.

Fix: run with an isolated database:

```bash
cd app
QRE_DB_PATH=/tmp/qre-dashboard-dev.sqlite npm run dev
```

On Windows PowerShell:

```powershell
cd app
$env:QRE_DB_PATH="$env:TEMP\qre-dashboard-dev.sqlite"
npm run dev
```

## Validation record

- Guide executed on clean environment: not yet; local macOS dev checkout
  validated only.
- Platform: macOS 15.6.1 arm64
- Date: 2026-07-27 PDT
- Windows steps validated by: _______________________
