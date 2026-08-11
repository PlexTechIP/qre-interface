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

The preload exposes exactly six renderer surfaces:

- `window.estimator`: estimation runs, backed by QRE.
- `window.store`: run history persistence, backed by SQLite.
- `window.files`: file path lookup for uploaded programs.
- `window.uploads`: pre-flight validation of an uploaded program file.
- `window.agent`: provider status, the outbound-request preview, one turn of a
  conversation, cancelling one, and one-way credential entry. **There is no
  credential getter and no channel on the other side that could be one.**
- `window.chats`: conversation persistence, backed by its own SQLite file.

`agent` and `chats` are deliberately separate, and the split is load-bearing:
`chats` reaches a database and never a provider, `agent` reaches a provider and
never a database. That is what makes chat history readable with the network off,
and what keeps "delete all my transcripts" a database operation with no
credential anywhere near it.

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

### Chat history

Conversations live in a **separate database file**, `chat-history.sqlite`
(`QRE_CHAT_DB_PATH` overrides), behind the `ChatStore` interface — three tables:
`conversations`, append-only `chat_messages`, and an FTS5 `chat_search` index
that backs the rail's search box.

Two files rather than two table groups in one, for two reasons. Runs and
conversations share no join and no lifetime: a run record is immutable forever,
while a transcript is the analyst's own prose and they are entitled to delete
all of it. And the week-6 walkthrough verified by grepping the shipped store
that no prompt text ever reaches `run-history.sqlite`; chat history *is* prompt
text, so putting it there would make a check someone deliberately performed
permanently false.

`SqliteChatStore` and `InMemoryChatStore` are held to one shared suite
(`shared/testing/chatStoreContract.ts`) rather than to two test files that
happen to assert similar things — "kept behaviorally aligned" holds only for as
long as someone remembers to edit both.

Storing transcripts reverses an earlier decision, knowingly: the Describe-a-Run
prompt was session state that never touched disk. A conversation the analyst
cannot come back to is not a conversation, it is a long prompt. What follows
from the reversal is `ChatStore.clear`, wired to a two-step "Delete all history"
control. The *unsent* composer text is still session-only.

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
