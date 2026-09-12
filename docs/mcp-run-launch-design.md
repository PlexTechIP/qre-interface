# Letting an External Agent Launch a Run — Options and Recommendation

**Status:** research + recommendation, not a decision. Written 2026-09-11
against `main` at `f8bc247`, **revised the same day** after the PM set the
requirement that the flow be autonomous: the analyst prompts the agent, and
the agent lists, drafts, validates, runs and reads back without touching the
dashboard. Every codebase claim names the file it was checked in; every claim
about a client is linked in §9. Where something is an inference it says so.

**Question.** The MCP server ships five read tools. Claude Code and Codex can
list, inspect, draft and validate runs, but neither can *start* one. How should
they, given that no human click may sit in the loop?

---

## 0. Recommendation

**Build `qre_run_estimate` inside the MCP server: the server runs the engine
and appends the record itself. The dashboard becomes a viewer of runs it did
not make.** This is the week-5 design's Option (§6.1 of
`week-5/team-1/mcp-server-design.md`), taken seriously and re-costed, with
four corrections that the read half and the clients have since forced:

1. **Consent moves to setup time and to the client.** No elicitation, no
   in-app confirmation, no `requiresUserInteraction` — each of those is a
   prompt per call, which is the opposite of the requirement. The tool is
   registered only when the analyst deliberately enabled it in the config
   block the dashboard emits (server-enforced, absolute), and the MCP client's
   own approval policy decides whether to ask per call (Claude Code's
   permission prompt with "always allow"; Codex's `approval_mode`). Everything
   after that is budgets and logging, not prompts.
2. **The Tasks extension is not used.** No mainstream client implements it
   (§2). The call blocks; Claude Code backgrounds it at two minutes on its own,
   Codex needs one config line.
3. **The server appends; it still never migrates.** A new insert-only writer
   opens the database read-write only when `user_version` already matches,
   so CLOSED-1's real content — "the dashboard owns the schema" — survives even
   though "the server cannot write" does not.
4. **The dashboard learns to notice.** A small change watcher in main pushes
   a refresh to History, so an analyst who does have the app open sees the
   agent's runs land.

What is given up, and should be said plainly: the strongest safety property
of the previous recommendation (a human in the dashboard approves every run)
is gone by requirement. What remains bounds the blast radius of a bad or
injected instruction to **CPU time and junk records**: the draft contract
cannot name a file, there is no delete tool, and the engine subprocess gets an
allow-listed environment. §5 is the argument in full.

Cost: roughly **7–9 dev-days** including tests (§7).

---

## 1. Why an agent cannot launch a run today

**[VERIFIED]** Nothing is half-built. The write path is absent by design:

- The server's `instructions` say "Nothing here runs an estimate, saves a run,
  or changes the database" (`app/src/mcp/createServer.ts:44–54`).
- The store handed to tools is `SqliteReadOnlyRunStore`, opened `readOnly`
  (`app/src/main/sqliteReadOnlyRunStore.ts`); the class has no `save`.
- `importGraph.test.ts:33–70` allowlists what `server.ts` may import from
  outside `src/mcp` and `src/shared`. `sqliteRunStore.ts` and everything under
  `engine/` except `benchmarkRegistry.ts` are deliberately absent.
- Week 6 drew the line in writing ("No `qre_run_estimate`, and no MCP write
  tool of any kind", `week-6-overview.md`), and the timeline named the write
  half as a candidate to cut against packaging.

**What a run is, end to end** — this is what the server has to reproduce:

| Step | Where today | Notes |
|---|---|---|
| Draft → `FormState` | `renderer/agent/draftToFormState.ts:189`; provenance-free variant `renderer/state/generatedDraftToForm.ts` | Already on the server's import graph for `qre_validate_config` |
| Stamp identity, serialise | `renderer/state/useRunFlow.ts` (`stamp`, `start`), `toRunConfig` | `id`/`createdAt` minted at Run-click only |
| Execute | `main/engine/qreEngine.ts` → `execute.ts` spawns `python/estimate.py` | 120 s timeout (`qreEngine.ts:12`); allow-listed env (`execute.ts:13–22`) |
| Persist | renderer save-after-run → `SqliteRunStore.save` (`sqliteRunStore.ts:86–140`) | A duplicate-id check and one `INSERT`; no transaction, no DDL |
| Show | `App.tsx:483` → Results; History reloads on mount / after delete only (`RunHistoryContainer.tsx:156`) | |

**[VERIFIED]** The engine modules the server would need — `qreEngine.ts`,
`execute.ts`, `configToInvocation.ts`, `outputToResult.ts`, `invocation.ts`,
`uploadValidation.ts` — import nothing from Electron; the only Electron import
under `engine/` is a test. The `python/` wrapper and `benchmarks/` are already
copied into `dist-electron/` beside `mcp-server.mjs` by `vite.main.config.ts`,
and `execute.ts` resolves `estimate.py` relative to its own bundle. So the one
input the server lacks is the **interpreter path**: `resolvePythonBin`
(`engine/pythonBin.ts`) honours `QRE_PYTHON_BIN` before it derives anything.

---

## 2. What the clients support, September 2026

| | Claude Code (CLI) | Codex CLI / app | Claude Desktop |
|---|---|---|---|
| **Elicitation** | Yes since v2.1.76 (form + URL) **[EXTERNAL]** | Multi-round `tools/call` through `input_required` merged 2026-07-28, stdio included **[EXTERNAL]**; elicitation-based *approval* issue still open **[EXTERNAL]** | No **[EXTERNAL]** |
| **Tasks extension** | **No** — request closed as not planned; no changelog entry **[EXTERNAL]** | Not documented; absent from the official matrix | No |
| **Long tool calls** | Cap ≈ 28 h by default (`MCP_TOOL_TIMEOUT` / per-server `timeout`); 30-min stdio idle window; **auto-backgrounds after 2 min**, model gets a task id (v2.1.212+) **[EXTERNAL]** | `tool_timeout_sec`, **default 60 s** **[EXTERNAL]** | Undocumented |
| **Autonomous approval** | Permission prompt with "always allow"; `auto` / `bypassPermissions` modes. `_meta["anthropic/requiresUserInteraction"]` forces a prompt on every call and is **denied** in `dontAsk` mode **[EXTERNAL]** — so it must **not** be set | `default_tools_approval_mode` = `auto` / `prompt` / `writes` / `approve`; per-tool `approval_mode` **[EXTERNAL]** | Host prompt |

The official extension matrix lists no client for Tasks **[EXTERNAL]**.

Consequences: the run call must be a plain blocking `tools/call`; the server
must not attach anything that forces a per-call human; the generated Codex
block must raise `tool_timeout_sec`.

---

## 3. The options, re-examined for autonomy

The requirement removes the option recommended in the first draft of this memo
and re-ranks the rest. All four are kept so the reasoning is auditable.

### Option A — the server runs the engine and appends the record  ← **recommended**

`qre_run_estimate` validates the draft through the same seam as
`qre_validate_config`, mints `{id, createdAt}`, calls `QreEngine.run`, and
inserts the record. Works whether or not the dashboard is open, which under
autonomy is the normal case: the analyst is in a terminal.

Costs, each with its mitigation in §4: the server becomes a second writer
(insert-only, no migration, retry on busy); it needs the interpreter path (the
config block carries it, exactly as it carries the DB path); the dashboard
does not notice new rows (a change watcher).

### Option B — broker to the running dashboard, analyst clicks Run  *(first-draft recommendation — withdrawn)*

Kept every structural guarantee and put a human in the loop. **Fails the
requirement twice**: the click, and needing the dashboard open. Retained in
§8 as an *optional* mode for a locked-down install that wants a human gate.

### Option B′ — broker to the running dashboard, dashboard auto-executes

Same socket, no card: main runs and saves immediately. Keeps one writer and a
live UI, but the agent can only work while the dashboard is open, and main
has no run-and-save service today (the renderer drives save), so it is new
main-process code *plus* the socket layer. If both A and B′ are built, the
server has two execution paths to test. Not worth it as v1; **the sensible
successor to A** if live "the agent is running X" status in the UI is wanted.

### Option C — the dashboard hosts an HTTP MCP server

Reads die with the dashboard; a localhost TCP port; discards the stdio server
and its tests. Not for now.

### Option D — the server launches a headless dashboard to execute

Possible in principle (the config block already names the app binary) but
means Electron start-up per agent session, a single-instance lock fight with
a GUI instance, and lifetime management nobody asked for. Rejected.

| | **A · server executes** | B · broker + click | B′ · broker, auto | C · HTTP in app | D · headless app |
|---|---|---|---|---|---|
| Autonomous (no click) | **✓** | ✗ | ✓ | ✓ | ✓ |
| Works with dashboard closed | **✓** | ✗ | ✗ | ✗ (reads too) | ✓ (slow) |
| SQLite writers | 2 (insert-only) | 1 | 1 | 1 | 1 |
| Server never migrates | **✓** | ✓ | ✓ | n/a | ✓ |
| Needs Tasks / elicitation | **neither** | neither | neither | neither | neither |
| Dashboard shows agent runs | with watcher | natively | natively | natively | with watcher |
| New attack surface | subprocess from a prompt (bounded, §5) | local socket | local socket | TCP port | app launch |
| Rough cost | **7–9 d** | 6–8 d | 8–10 d | 8–12 d | 10+ d |

---

## 4. The recommended design

### 4.1 The flow

```
agent
  │ tools/call qre_run_estimate { draft, name?, note? }
  ▼
mcp-server.mjs
  1. bound + validateGeneratedDraft + adapter + coupling + form + schema     ← validateConfig.ts steps 0–6, shared
  2. gate: tool exists only if QRE_MCP_ALLOW_RUNS=1; per-session budget; one engine at a time
  3. toRunConfig(state, { id: randomUUID(), createdAt: now, provenance })   ← server mints, at execution
  4. QreEngine.run(config)                                                  ← python subprocess, ≤ 120 s
  5. SqliteAppendRunStore.save(makeRunRecord(config, result, now))          ← insert-only, retry on busy
  6. invocation log line (JSON Lines, digest not args)
  7. return { runId, status, error?, frontierSpan?, saved }
dashboard (if open)
  8. main's change watcher notices the new row → History refreshes; the row carries the existing agent badge
```

Step 1 is `handleValidateConfig`'s pipeline lifted into a shared
`prepareDraft()` so the two tools cannot disagree about what is runnable —
the design's §6.1 promise that "validate then run is the same object twice".

### 4.2 Executing outside Electron

- **Interpreter:** `buildMcpSetup` (`main/mcpSetup.ts`) adds
  `QRE_PYTHON_BIN` to the `env` block beside `QRE_DB_PATH`, from the path
  main already resolved (`main.ts:57–63`). Same rule as the DB path: the
  process that knows writes it down; the server never re-derives it. If the
  variable is missing or the file is not executable, the tool is still
  registered but answers `ENGINE_NOT_CONFIGURED` with the sentence that names
  the variable.
- **Wrapper and benchmarks:** already beside the bundle (§1). Add an
  assertion to `buildPipeline.test.ts` that `dist-electron/python/estimate.py`
  exists after `build:mcp`, since the server now depends on it.
- **Process hygiene:** `killLiveEngineProcesses()` joins `shutdown.ts`'s
  sequence so a client that exits mid-run does not orphan a Python process.
  One engine process per server at a time; a second call while one is running
  waits behind it (bounded queue of 1), a third gets `RUN_BUSY`.
- **Packaging:** unchanged in kind — the Electron-embedded Node already runs
  the bundle (`packagedRuntime.test.ts`); the venv location is a packaging
  decision either way and arrives through the same env variable.

### 4.3 Writing without owning the schema

New `main/sqliteAppendRunStore.ts`, allowlisted; `sqliteRunStore.ts` stays
out:

- Opens read-write, **checks `PRAGMA user_version` first** and refuses with
  `DB_SCHEMA_MISMATCH` if it is not `DATABASE_SCHEMA_VERSION` — never
  migrates, never sets `journal_mode`, no DDL anywhere in the module.
- Exposes exactly `save(record)`; the `INSERT` and duplicate check move into
  a shared `sqliteRunStoreWriter.ts` that both stores call, so there is one
  statement, not two.
- `busy_timeout` 5 000 ms like the dashboard; on `SQLITE_BUSY` after that,
  retry twice with jitter (the spike measured the dashboard's own writes as
  short autocommits, so a collision is brief). If it still fails, the tool
  **returns the result anyway with `saved: false` and code `DB_LOCKED` in a
  `warning` field** — the estimate cost two minutes of CPU and must not be
  lost because History was mid-delete.
- Reuses `runStoreAccess.ts`'s open/recheck discipline (same file identity
  and schema re-check per call) so a moved or recreated history is picked up.

### 4.4 The tool contract

```
qre_run_estimate
  input:   { draft: <run-draft contract>, name?: string ≤ 200, note?: string ≤ 500 }
  output:  { runId, status: "succeeded" | "failed", error?: { code, message },
             frontierSpan?: <as qre_list_runs>, saved: boolean, warning?: { code, message } }
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  _meta:   nothing that forces a per-call prompt
```

- A failed estimate is a normal result with `status: "failed"` — the
  `EstimatorService` convention. `isError` is reserved for the server failing.
- `frontierSpan` is the projection `qre_list_runs` already returns, so a
  "run then compare" loop needs no `qre_get_run` and introduces no new egress
  shape.
- `note` is stored nowhere (the provenance contract refuses prompts) and goes
  to the invocation log only as part of the digest.
- Description states: may take up to two minutes; runs on the analyst's
  machine; the run is saved to the dashboard's history; call
  `qre_validate_config` first when unsure.

New codes in the closed set (`toolResult.ts`):

| Code | Means |
|---|---|
| `RUNS_DISABLED` | Registered only when the env opt-in is present, so a client should never see this; kept for the hot-reload case. |
| `ENGINE_NOT_CONFIGURED` | `QRE_PYTHON_BIN` absent or not executable. Names the variable and Settings › Agents. |
| `RUN_BUSY` | The queue is full. Try again after the current run. |
| `RUN_BUDGET_EXCEEDED` | Per-session cap reached (§5). Restart the client to reset. |
| `DRAFT_INVALID` | The draft would not run; carries the same `{field, source, message}` list as `qre_validate_config`. |
| `DB_LOCKED` (existing) | Now also as a `warning` on a result that ran but did not save. |

`SERVER_INSTRUCTIONS` change from "nothing here runs an estimate" to:
"`qre_run_estimate` runs an estimate on this machine and saves it to the
analyst's history; it is present only when the analyst enabled it. There is no
tool that deletes or edits a run."

### 4.5 The dashboard as a viewer

- **Change watcher** in main: `fs.watch` on the database's `-wal` file (WAL
  is already on), debounced, falling back to a 5 s `countRecords()` poll
  where `fs.watch` is unreliable. Pushes `store:changed` to every window;
  `RunHistoryContainer` calls its existing `refresh()` (`:156`). Background
  refresh already avoids flashing (`:82`).
- **Badge:** History already marks `model_assisted` rows and filters by author
  (`RunHistoryList.tsx:149`, `RunHistoryFilters.tsx:170`). Nothing to add.
- **Settings › Agents:** the toggle *"Let connected agents run estimates"*
  (default off) writes `QRE_MCP_ALLOW_RUNS=1` into the config block the panel
  displays, with the note that the analyst must re-add the server for the
  change to take effect (an MCP client reads `env` at spawn). The panel also
  shows the interpreter path that will be used.

### 4.6 Long calls without Tasks

The call blocks for engine time (≤ 120 s) plus queue wait. Claude Code
backgrounds it at two minutes and needs nothing else. `mcpSetup.ts` emits
`tool_timeout_sec = 600` in the Codex TOML block. When a client ships Tasks,
the same tool returns a `CreateTaskResult` to clients that declare the
capability and `tasks/cancel` maps to killing the child — additive, not v1.

### 4.7 Provenance and naming

`provenance: { authoredBy: "model_assisted" }` on every run, **no `model`**:
the server knows the client (`clientInfo.name`), not the model, and the in-app
path refuses to put a non-model string in that field (`ChatPage.tsx:717–730`).
Client name and version go to the invocation log. `name` defaults through
`generateName` (`toRunConfig.ts:252`) with the existing rerun-style
uniqueness; the agent may supply one, and it is stored as untrusted text like
any other name.

---

## 5. Security without a human in the loop

The week-5 design's §7 was built around the claim that the server cannot know
a human consented. Under autonomy that is accepted rather than solved, so the
question becomes: **what is the worst an injected or mistaken instruction can
make this tool do?**

**Enforced by the server (real controls):**

1. **Off unless enabled at setup.** The tool is not in `tools/list` without
   `QRE_MCP_ALLOW_RUNS=1` in the spawned environment, which only the analyst
   can put there. A read-only install cannot be talked into running anything.
2. **The draft contract cannot reach the filesystem.** `GeneratedRunDraft`
   has no uploaded-program branch (`shared/agentTypes.ts`, "Uploaded programs
   are intentionally absent"), so no tool argument can make the engine open a
   path. This is the property that keeps "spawn a subprocess from a prompt"
   bounded to *this* subprocess with *these* inputs.
3. **The subprocess environment is allow-listed** (`execute.ts:13–22`):
   no shell secrets reach Python.
4. **Budgets.** One engine at a time, a queue of one, a per-session cap
   (proposed 50 runs) and a per-minute cap (proposed 5) — the spec's
   "rate limit tool invocations" MUST, sized so a real sweep of a dozen runs
   is unhindered and a runaway loop is not.
5. **No destructive tool exists.** Injected text delivered through a run name
   (design §7.3) can, at most, cause more runs. Nothing can delete, rename or
   edit a record over MCP, and that line should stay where it is.
6. **The invocation log** records what the server observed:
   `consent: "not_elicited"`, `gate: "env_opt_in"`, the client's reported
   name/version, an argument digest, run id, status, duration. Written by the
   server beside the database as JSON Lines, size-rotated.

**Left to the client (defence in depth, not a control):** Claude Code and
Codex both prompt on a non-read-only tool by default; an analyst who chooses
"always allow" or an auto mode has made that choice in the client's own UI.
`readOnlyHint: false` is declared so those prompts appear.

**Optional, off by default:** `QRE_MCP_CONFIRM_RUNS=1` turns on a per-call
elicitation (form mode, yes/no, naming benchmark, architecture, error budget)
on clients that support it, and refuses the call on clients that do not. This
is Option B's human gate without the dashboard, for an install that wants it.
It is a flag, not the design.

**Egress** (design §7.4) is unchanged in kind: the run tool returns the same
summary shape the read tools already do.

---

## 6. What it touches

**MCP server (`src/mcp/`)**

- `tools/runEstimate.ts` — new; `prepareDraft()` extracted from
  `tools/validateConfig.ts` and shared.
- `engineAccess.ts` — new; resolves `QRE_PYTHON_BIN`, owns the single
  `QreEngine`, the queue, the budgets.
- `createServer.ts` — conditional registration, annotations, instructions;
  `outputSchemas.ts` — `RUN_ESTIMATE_OUTPUT`; `toolResult.ts` — new codes;
  `shutdown.ts` — kill live engine processes; `invocationLog.ts` — new.
- `importGraph.test.ts` — allowlist grows by: `engine/qreEngine.ts`,
  `engine/execute.ts`, `engine/configToInvocation.ts`,
  `engine/outputToResult.ts`, `engine/invocation.ts`,
  `engine/uploadValidation.ts`, `engine/pythonBin.ts`,
  `main/sqliteAppendRunStore.ts`, `main/sqliteRunStoreWriter.ts`. Each line
  argued in the PR, per the file's own comment. `sqliteRunStore.ts` stays
  forbidden — that is the assertion that the server still cannot migrate.
- `README.md` — the first paragraph, the tools table, the error table.

**Main process**

- `main/sqliteAppendRunStore.ts`, `main/sqliteRunStoreWriter.ts` — new;
  `sqliteRunStore.ts` calls the shared writer.
- `main/mcpSetup.ts` — `QRE_PYTHON_BIN`, `QRE_MCP_ALLOW_RUNS` when the toggle
  is on, Codex `tool_timeout_sec`, problems lines, one sentence of egress
  disclosure.
- `main/storeWatcher.ts` — new; `ipcChannels.ts` `STORE_CHANGED_CHANNEL`;
  `preload.ts` `window.store.onChanged`.

**Renderer**

- `RunHistoryContainer.tsx` subscribes and calls `refresh()`.
- Settings › Agents toggle and interpreter-path display.

**Tests that must go red if reverted**

- Tool not in `tools/list` without the env; present with it
  (`serverSurface.test.ts`, `handshake.stdio.test.ts`).
- Invalid draft never spawns (mock engine records zero calls).
- Append store refuses a mismatched `user_version` and never issues DDL
  (grep the module for `CREATE`/`ALTER`/`PRAGMA user_version =`).
- Busy database: result returned with `saved: false` and `DB_LOCKED` warning.
- Queue: second call waits, third gets `RUN_BUSY`; budget cap returns
  `RUN_BUDGET_EXCEEDED`.
- Shutdown with a live child kills it.
- `errorPaths.test.ts` extended: no `structuredContent` on the new failures.
- Watcher: an insert from a second process refreshes History within the
  debounce window.
- Round trip: a run created over MCP is drafted back byte-identically by
  `qre_draft_from_run`.

---

## 7. Cost

**[INFERENCE — one developer.]**

| Item | Days |
|---|---|
| `prepareDraft` extraction + `qre_run_estimate` + schemas + instructions | 1–1.5 |
| Engine access: interpreter resolution, single engine, queue, budgets, shutdown | 1 |
| Append store + shared writer + busy handling | 1 |
| Invocation log with rotation | 0.5–1 |
| Setup block, Settings toggle, interpreter display | 1 |
| Change watcher + History refresh | 0.5–1 |
| Tests across server, main, renderer | 2 |
| Docs (README, this memo's decision register) | 0.5 |
| **Total** | **7–9** |

---

## 8. Decisions for the PM

1. **Confirm Option A** and, explicitly, that no human gate is wanted by
   default. The optional `QRE_MCP_CONFIRM_RUNS` flag (§5) is the only
   remaining place a human can sit; say whether to build it now or later.
2. **Budgets:** 50 per session, 5 per minute, queue of one — or different.
3. **Behaviour on a busy database:** return-with-`saved: false` (recommended)
   versus fail the call.
4. **Whether B′ follows** once A ships, for live in-app status.
5. **Sequencing against packaging.** A is packaging-neutral (the interpreter
   path travels in the config block either way), so it can land before
   electron-builder. It should not displace packaging in the week that has it.
6. **Microsoft's §11 Q2** (may run data reach a third-party model provider?)
   still gates the whole track and is unchanged by this memo.

---

## 9. Sources

**Codebase (`f8bc247`):** `app/src/mcp/createServer.ts`, `runStoreAccess.ts`,
`importGraph.test.ts`, `tools/validateConfig.ts`, `toolResult.ts`,
`shutdown.ts`, `buildPipeline.test.ts`, `packagedRuntime.test.ts`;
`app/src/main/main.ts`, `mcpSetup.ts`, `estimatorHandler.ts`, `preload.ts`,
`publishDataLocation.ts`, `dataDir.ts`, `sqliteRunStore.ts`,
`sqliteReadOnlyRunStore.ts`, `sqliteRunStoreReader.ts`,
`engine/qreEngine.ts`, `engine/execute.ts`, `engine/pythonBin.ts`,
`engine/configToInvocation.ts`, `engine/outputToResult.ts`;
`app/src/shared/agentTypes.ts`; `app/src/renderer/state/useRunFlow.ts`,
`state/toRunConfig.ts`, `agent/ChatPage.tsx`,
`history/RunHistoryContainer.tsx`, `history/RunHistoryList.tsx`,
`history/RunHistoryFilters.tsx`; `app/vite.main.config.ts`;
`docs/week-5/team-1/mcp-server-design.md`; `docs/week-6/week-6-overview.md`;
`docs/week-6/team-2/concurrency-spike-results.md`;
`docs/timeline-and-milestones.md`.

**Clients and protocol [EXTERNAL]:**

- Claude Code changelog — elicitation added in 2.1.76; `requiresUserInteraction`
  behaviour; idle timeout.
  <https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md>
- Claude Code MCP docs — `MCP_TOOL_TIMEOUT` default ≈ 28 h, per-server
  `timeout`, 30-min stdio idle window, auto-background after two minutes,
  `_meta["anthropic/requiresUserInteraction"]` (prompts every call; denied in
  `dontAsk`). <https://code.claude.com/docs/en/mcp>
- Claude Code issue #52137 — SEP-1686 (Tasks) client support, closed as not
  planned. <https://github.com/anthropics/claude-code/issues/52137>
- Claude Code issue #41110 — elicitation in the CLI, not in Claude Desktop.
  <https://github.com/anthropics/claude-code/issues/41110>
- Codex PR #35725 — MCP 2026 client support, merged 2026-07-28.
  <https://github.com/openai/codex/pull/35725>
- Codex issue #13405 — elicitation-based approval, open.
  <https://github.com/openai/codex/issues/13405>
- Codex MCP configuration — `tool_timeout_sec` default 60,
  `default_tools_approval_mode`, per-tool `approval_mode`.
  <https://learn.chatgpt.com/docs/extend/mcp?surface=cli>
- MCP Tasks extension overview and the extension support matrix (no client
  listed for Tasks). <https://modelcontextprotocol.io/extensions/tasks/overview>
  · <https://modelcontextprotocol.io/extensions/client-matrix>
- MCP Tools security considerations — validate inputs, rate limit, sanitize
  outputs (MUST). <https://modelcontextprotocol.io/specification/2026-07-28/server/tools>

## 10. Decision register (implemented)

What was actually built, and the decisions that are now closed. Each line is a
choice somebody will otherwise reopen; the reasoning is above, in §0, §4 and §5.

- **Option A.** The MCP server runs the Python engine itself and appends the
  record to the dashboard's SQLite history. The dashboard becomes a viewer of
  runs it did not make, and `qre_run_estimate` is the only tool that acts.
- **No human gate at call time, and no `QRE_MCP_CONFIRM_RUNS`.** The PM's
  requirement is a fully autonomous flow: the analyst prompts the agent, the
  agent runs the estimate and reads the result back. The gate is the
  environment opt-in the analyst set when configuring their client — not a
  prompt per call, not elicitation, not
  `_meta["anthropic/requiresUserInteraction"]`. `readOnlyHint: false` is what
  makes a client offer its own permission prompt if it wants one.
- **`QRE_MCP_ALLOW_RUNS=1`, checked at registration.** With it absent the tool
  is not in `tools/list`, so the refusal a model would otherwise meet does not
  exist — hence no `RUNS_DISABLED` code. Exactly `"1"`; `"true"` is off,
  because a gate that reads a truthy string fails open.
- **Budgets: 50 per session, 5 per rolling minute, one engine at a time with a
  wait-queue exactly one deep.** A third concurrent call gets `RUN_BUSY`.
  Budget is charged on admission (a queued call counts) and never on a refusal.
- **A finished estimate is never discarded.** A save that hits `SQLITE_BUSY`
  past the 5 s timeout and two retries returns the result with `saved: false`
  and `warning: { code: "DB_LOCKED", … }` rather than failing the call.
- **Provenance is `{ authoredBy: "model_assisted" }` with no `model` key.**
  `getClientVersion()` names the client, not the model behind it; a guess would
  be a plausible wrong answer in a field analysts filter on. The client name
  goes in the invocation log, labelled as what it is.
- **Input is `{ draft }` and nothing else.** The name travels inside the draft
  (`null` lets the app generate one). The `note` field considered in §4 was
  dropped: it would have been a second place for run identity to come from.
- **Output is `{ run, saved, warning? }`**, where `run` is the same `runSummary`
  shape `qre_list_runs` returns — so a caller has one shape to learn, and can
  rank a fresh run against saved ones without a second call.
- **A failed estimate is a normal result** with `run.status: "failed"`, saved
  the way the dashboard saves failures. Only a failure of the TOOL is `isError`.
- **The history watcher is a `PRAGMA data_version` poll**, every two seconds, on
  the dashboard's own connection. Not `fs.watch`: under WAL a commit lands in
  the `-wal` file and the main file's mtime may not move. `data_version` changes
  only when ANOTHER connection commits, so the dashboard's own saves do not
  trigger it.
- **The Settings toggle is renderer state (localStorage), passed per call.** It
  changes what the emitted block SAYS and nothing about the running process, so
  persisting it in main would create a second place to answer "are agent runs
  on?" whose answer could disagree with the client config that actually decides.
- **`tool_timeout_sec = 600` is emitted unconditionally.** Codex defaults to 60
  seconds, which a real estimate exceeds; the value is harmless to a read-only
  server, and an analyst who enables runs later should not have to discover that
  a number they never saw is why their agent reported a timeout on a run that
  succeeded. `QRE_PYTHON_BIN` is likewise always emitted, because the server's
  own default resolves relative to its bundle.
- **Out of scope, and still is:** delete and edit tools, uploaded programs
  through MCP, and the MCP Tasks extension (no client implements it).
