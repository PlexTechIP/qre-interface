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

The preload exposes exactly seven renderer surfaces:

- `window.estimator`: estimation runs, backed by QRE.
- `window.store`: run history persistence, backed by SQLite.
- `window.files`: file path lookup for uploaded programs.
- `window.uploads`: pre-flight validation of an uploaded program file.
- `window.agent`: provider status, the outbound-request preview, one turn of a
  conversation, cancelling one, refreshing an aggregator's model catalogue, and
  one-way credential entry. **There is no credential getter and no channel on
  the other side that could be one.**
- `window.chats`: conversation persistence, backed by its own SQLite file.
- `window.appInfo`: where this install keeps its data — the resolved database
  paths, whether an env override moved them, and a call to show one in the OS
  file manager. Read-only: there is no "move the database" counterpart.

`appInfo` is separate from `store` and `chats` rather than folded into either,
because those each expose ONE database's contents while this describes the data
directory as a whole — and because it is the only surface that can ask the OS to
open a window, which is a capability worth being able to point at in one place.

**Its reveal call takes a location id, never a path.** Main maps
`"runDatabase"`/`"chatDatabase"` onto a path it resolved itself at startup, so no
string from the renderer reaches `shell.showItemInFolder`. That is the same
asymmetry `agent` uses for credentials, applied to a different resource: the
renderer names *which* file, never *where*.

`agent` and `chats` are deliberately separate, and the split is load-bearing:
`chats` reaches a database and never a provider, `agent` reaches a provider and
never a database. That is what makes chat history readable with the network off,
and what keeps "delete all my transcripts" a database operation with no
credential anywhere near it.

`agent:catalog` is on this surface for the same reason `agent:reply` is: it
needs the stored key. The renderer names a provider and receives a model list
and a dollar balance; the key is read in main and, as everywhere else here, has
no way back out.

`agent:replyDelta` is the only channel main initiates. `agent:reply` keeps its
invoke shape and still resolves with the whole validated turn — persistence and
error handling are untouched — while the delta channel carries prose fragments
tagged with the request id the renderer sent. The tag is load-bearing: a window
that cancels and re-sends would otherwise paint the abandoned request's
fragments into the new turn, because once they are strings the two streams are
indistinguishable. It carries no credential, no draft and no conversation id.

### A proposal is a tool call

The assistant used to answer with a strict `{reply, draft}` JSON envelope. That
single decision caused three symptoms at once: nothing could stream (the JSON
must close before any of it parses), the prose could not use markdown (it was a
JSON string value), and the model wrote in the clipped register of something
filling in a form.

Both adapters now give the model one tool, `propose_run_config`, whose input
schema is `WIRE_GENERATION_SCHEMA` unchanged — the committed contract did not
move and neither did the drift test that pins it. The model converses in
ordinary streamed text and calls the tool when it has something to propose.

- **A turn has two independent halves.** Prose with no call is a question, which
  is what makes "ask before guessing" representable at all. A call with no prose
  is still a proposal. Only a turn carrying neither is unreadable.
- **A turn is refused whole.** A proposal that fails the generation contract
  takes its prose with it — otherwise "here is a configuration for Grover" sits
  in the transcript above a card that cannot be opened.
- **Storage did not change.** A stored turn is still `{text, draft}`. Each
  adapter lowers that into its own representation on replay: Anthropic wants a
  `tool_use` block answered by a `tool_result` in the next message with roles
  alternating, so the answer is folded into the user turn that follows; the
  chat-completions path has no alternation rule, so `role: "tool"` is its own
  message. The shared rules live in `main/toolTurn.ts`.
- **Streaming is a property of the call, not the adapter.** An adapter given no
  `onDelta` asks for a whole response. Tool arguments are buffered rather than
  forwarded — half a configuration is not a configuration — so only prose
  streams, which is what the analyst is waiting to read.

For OpenRouter the catalogue filter tightened accordingly: a model must
advertise **both** `tools` and `structured_outputs`, because a proposal is a
strict-argument tool call. The roadmap's fallback envelope generator was not
built — a second code path kept alive for models the picker will not offer is
worse than the filter.

### What the analyst has already filled in

`AgentChatRequest.formContext` carries the run form's non-default fields,
addressed by schema path (`architecture.errorRate`), so "carry this through"
needs no translation table at either end. Without it a proposal is authored
against defaults and silently resets work already done.

This required lifting the form's state. `RunConfiguration` is a conditional
render like every page, so its `FormState` was discarded on every sidebar click
— which made the defect unfixable in principle, because by the time the analyst
reached the chat page there was no half-filled form left to discard. The shell
now mirrors the state and seeds it back on remount. The page stays authoritative
while mounted; the shell holds it between mounts.

### Two kinds of provider

Anthropic and OpenAI publish a handful of models each and the app pins them, so
`isModelForProvider` enforces a compile-time list and an unknown model means the
renderer and main bundles disagree — which rejects.

OpenRouter aggregates hundreds of models that change weekly, so a pinned list
would make this app's release date the ceiling on what an analyst can select.
Its gate reads from data instead:

- the shared check is the `vendor/model` slug shape, which is all a constant can
  know;
- main holds the catalogue actually fetched from `GET /api/v1/models`, filtered
  to models advertising structured-output support, and checks membership against
  it;
- a cold cache degrades to the slug rule rather than blocking, so a failed or
  never-attempted fetch leaves the feature working on the shipped shortlist.

A well-formed slug the fetched catalogue does not list resolves as a typed
`UNSUPPORTED_MODEL` failure rather than rejecting. It is not a bundle mismatch —
it is the aggregator's inventory moving under a selection the analyst made
earlier, which is an ordinary event and has to arrive as something the UI can
render.

Outbound OpenRouter requests carry `provider: { require_parameters: true }`.
OpenRouter fans one slug across several upstream hosts and they do not all
honour `response_format`; without it a request can land on a host that ignores
the strict schema and answers with prose, which would surface as a generation
contract error and read as the model's fault rather than the routing's. The
catalogue filter decides which models are offered; that option decides which
hosts may serve them.

The optional OpenRouter app-attribution headers (`HTTP-Referer`, `X-Title`) are
deliberately absent: they list the app on a public leaderboard, which is the
opposite of this product's no-telemetry posture.

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
