# Week 3 Team 3 acceptance walkthrough

## Setup

Windows PowerShell, from the repository root:

```powershell
app/src/main/engine/python/setup_venv.ps1
Set-Location app
npm ci
npm run typecheck
npm test
npm run test:engine
npm run dev
```

macOS/Linux:

```bash
app/src/main/engine/python/setup_venv.sh
cd app
npm ci
npm run typecheck
npm test
npm run test:engine
npm run dev
```

Both setup scripts install pinned `qdk[qre]==1.29.1`; runtime subprocesses set
`QDK_PYTHON_TELEMETRY=none`. `QRE_PYTHON_BIN` may override the repo-relative
interpreter.

## Automated evidence

- `npm test` runs renderer/jsdom and fast engine/node projects separately.
- `npm run test:engine` runs real-QDK conformance and the IPC-handler
  conformance test for every `runconfig.*` fixture. The failing fixture must
  resolve a schema-valid failed `RunResult`.
- `npm run build` emits the renderer plus sandboxed Electron main/preload.
- The renderer import-clean grep in the execution plan must return no matches.
- `execute.ts` uses asynchronous `spawn`, enforces timeout, removes children on
  completion, and kills the live registry on app quit.

## Human GUI runbook

1. Launch `npm run dev`; confirm one Electron window loads Run Configuration.
2. Fill the required gate and measurement times and run the default benchmark.
   While Python runs, confirm the running view remains responsive. Confirm the
   Results Area renders a real multi-row frontier and runtime package version.
3. Configure the sparse PSSPC case with `tStatesPerRotation: 20`; confirm a
   small frontier renders.
4. Choose a genuinely unsatisfiable error budget/configuration; confirm the
   failure view shows a canonical `ESTIMATION_FAILED` code and offers recovery.
5. Start a heavier run, close the app while it is running, and confirm no Python
   child remains in Task Manager/Activity Monitor. Relaunch and perform two
   sequential runs to confirm isolation.

GUI observations and screenshots are human-gated and must be attached to the PR
before claiming live end-to-end acceptance.

## Contract recap

The sparse value is interim pending PM ratification. Majorana operation time,
trace composition, and `source` remain proposals documented in
`contract-decision-proposals.md`; no unilateral contract edits were made.
