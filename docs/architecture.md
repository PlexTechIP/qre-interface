# Architecture Guide

This guide explains the QRE Dashboard execution path and the boundaries that
make the app maintainable. Start here when changing the renderer run flow, the
Electron IPC bridge, the Python QRE engine, or run persistence.

## End-to-end estimation path

The live estimation path is:

```text
FormState
  -> toRunConfig
  -> useRunFlow
  -> window.estimator.run(config)
  -> estimator:run IPC
  -> QreEngine
  -> configToInvocation
  -> execute
  -> Python estimate.py
  -> outputToResult
  -> ResultsArea
```

`toRunConfig` is where renderer form state becomes the contract-shaped
`RunConfig`. It stamps `id` and `createdAt` when the user launches a run, not
while the user is editing the form. `useRunFlow` owns the running/succeeded/failed
UI state and calls the estimator surface exposed by preload.

The renderer never imports the engine or subprocess code. `window.estimator.run`
crosses into Electron main over `estimator:run`, where one `QreEngine` instance
implements the shared `EstimatorService` interface. Inside the engine,
`configToInvocation` validates and translates a `RunConfig` into the Python
wrapper's invocation JSON, `execute` spawns the Python subprocess and enforces
timeouts, and `outputToResult` maps wrapper output back into a contract-shaped
`RunResult`.

`ResultsArea` receives only `RunResult`. It does not know whether the result came
from QDK, a test double, or a future estimator implementation.

## IPC boundary

The preload exposes exactly three renderer surfaces:

- `window.estimator`: estimation runs, backed by QRE.
- `window.store`: run history persistence, backed by SQLite.
- `window.files`: file path lookup for uploaded programs.

The BrowserWindow security posture is deliberate:

- `contextIsolation: true`
- `sandbox: true`
- `nodeIntegration: false`

That means renderer code gets whitelisted capabilities through
`contextBridge`, not general access to `ipcRenderer`, Node globals, SQLite, or
the filesystem.

The estimator and store have different error conventions:

- The estimator should not reject for engine failures. Compile failures,
  invalid configs, timeouts, subprocess crashes, and malformed QDK output cross
  back as resolved `RunResult` objects with `status: "failed"` and a canonical
  `error.code`.
- The store may reject. `RunStore.save` rejects duplicate ids because run
  records are write-once and overwriting would violate history immutability.

Use that distinction when adding a new IPC surface: user/domain failures that
are part of an operation's result should resolve as data; programmer errors or
contractually rejected store operations may reject.

## Persistence

Run history is owned by Electron main, not the renderer. `SqliteRunStore`
implements the shared `RunStore` interface over `node:sqlite`; renderer code
uses the same async interface through `window.store`.

Each row in `run_records` stores:

- the full `RunRecord` JSON as `record_json` for byte-faithful reloads, including
  `raw`;
- denormalized filter/sort columns such as name, application, architecture,
  QEC code, magic-state factory, QRE version, and timestamps.

The full JSON is the source of truth. The denormalized columns exist so History
can query efficiently without changing the public record shape.

Runs are immutable. There is no update method on `RunStore`; `save` rejects a
duplicate id. Rerun reconstructs a new `RunConfig` from an existing record,
stamps a fresh id and timestamp, executes again, and saves a new record.

`SqliteRunStore` and `InMemoryRunStore` are kept behaviorally aligned so tests
can exercise UI flows without SQLite while production still uses durable local
storage.

## Python QRE engine

The selected engine route is the Python `qdk[qre]` package invoked as a
subprocess from Electron main. The route decision and rejected JS/WASM spike are
documented in `week-2/team-3/route-decision-memo.md`.

The wrapper contract is JSON over stdio:

- Node sends one invocation JSON object to `estimate.py`.
- `estimate.py` builds QDK application, architecture, QEC/factory, trace, and
  max-error objects.
- It prints one JSON object to stdout: either `status: "success"` with a
  frontier and verbatim QDK output, or `status: "failed"` with a canonical code,
  message, verbatim diagnostics, and runtime-read `qreVersion`.

`execute` is responsible for subprocess lifecycle: it sets the Python telemetry
environment, collects stdout/stderr, enforces the timeout, classifies crashes and
malformed output as `ENGINE_CRASH`, returns `TIMEOUT` for killed runs, and tracks
live children so app shutdown can clean them up.

Python resolution:

- default POSIX venv: `app/src/main/engine/python/.venv/bin/python3`
- default Windows venv: `app/src/main/engine/python/.venv/Scripts/python.exe`
- override: `QRE_PYTHON_BIN=/absolute/path/to/python`

Database resolution:

- default app database: Electron user-data dir plus `run-history.sqlite`
- override: `QRE_DB_PATH=/absolute/path/to/run-history.sqlite`

## Contract changes and known issues

The contract shapes live under `app/src/shared/contracts/` and the TypeScript
types live in `app/src/shared/types.ts`. The JSON schemas enforce runtime shape
rules that TypeScript alone cannot enforce at process boundaries or fixture
boundaries. Contract changes should move schema, types, fixtures, and tests
together, with PM review.

Known open issues:

- Sparse fixture satisfiability, Majorana `operationTime`, trace-transform
  one-of semantics, and the provisional `source` field remain deferred PM
  contract questions. See
  `week-3/team-3/contract-decision-proposals.md`.
- Benchmark hyperparameters are being serialized by Team 1 in Week 4, but the
  bundled Q# benchmark programs still hardcode their problem sizes. Until those
  programs consume parameters, changing a hyperparameter may record intent
  without changing the estimate.
- Uploaded OpenQASM is proven end to end. Uploaded Q# and QIR paths exist in the
  wrapper shape but still need full end-to-end validation before documentation
  should claim support parity.

## Validation record

- Setup guide executed on: local macOS dev checkout; clean-clone validation
  still required.
- Architecture reader from Team 1 or Team 2: _______________________
- Reader could identify where `RunConfig` becomes a Python invocation:
  _______________________
