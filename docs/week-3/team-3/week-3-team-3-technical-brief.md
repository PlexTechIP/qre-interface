# Week 3 — Team 3 — Technical Brief: Integration — The Swap

Your track: **integration**. In week 2 you built a real, conformant `QreEngine`
with no way for the app to reach it. This week you build that reach — the
Electron main process and a typed IPC bridge — and **swap the MockEngine for the
real engine behind the same `EstimatorService` interface**, so a user configures
a run in Team 1's UI and sees a real QRE estimate in Team 2's Results Area. You
also close the engine/contract decisions week 2 surfaced. You **hold** the engine
track through this swap (continuity beats novelty mid-integration).

> The renderer never talks to QRE directly — everything crosses **one typed
> boundary** (`EstimatorService`), so the engine can be swapped (mock ↔ real)
> and the UI stays testable (`docs/tech-stack.md` §Architecture). Your job is to
> make that boundary a *real process boundary* (IPC) without the interface — or
> the UI code on either side — changing.

## Where the app is today

The app is **renderer-only**: Team 1's Run Configuration and Team 2's Results
Area are merged on `main` and run end-to-end against the in-renderer MockEngine
(configure → Run → running → results, success and failure). **There is no
Electron main process, no preload, and no IPC yet.** Standing those up is the
core of your week. The MockEngine stays in the repo as the reference behavior and
test double; it just stops being what the app runs.

## Part 1 — the main process + the IPC bridge

Build in `app/src/main/`:

- **Main process:** app lifecycle, a `BrowserWindow` that loads the existing
  renderer bundle, and a **preload** script. Renderer stays sandboxed —
  `contextIsolation: true`, `nodeIntegration: false`.
- **The bridge exposes exactly one surface:** an **`EstimatorService`-shaped**
  API, published to the renderer via `contextBridge` in the preload. Under it:
  `ipcRenderer.invoke("estimator:run", config)` → an `ipcMain.handle` in main →
  the real engine → the `RunResult` back. The renderer imports the same
  `EstimatorService` type from `contracts/types.ts` it used for the mock — **the
  interface does not change, only what backs it**.

```
Renderer (React)                 Preload            Main process (Node)
  useEstimatorRun ─ run(config) ─► contextBridge ─► ipcMain.handle ─► QreEngine
       ▲                              (invoke)          │              │
       └──────────── RunResult ◄──────────────◄─────────┘  (subprocess: real QRE)
```

**Cross-boundary rules that keep the swap invisible:**

- `RunConfig` (renderer→main) and `RunResult` (main→renderer) must survive
  structured clone — plain JSON shapes, which the contract already guarantees.
- **Failures cross as resolved `RunResult`s** (`status: "failed"`, populated
  `error`, diagnostics in `raw` or `raw: null`) — exactly as in week 2. An IPC
  handler that *throws* would surface as a rejected promise and risk hanging the
  caller; keep failures-as-results across the wire. Reserve rejection for
  genuine programmer error (schema-invalid input), and fail-soft even there.
- Only the whitelisted `EstimatorService` methods are exposed — no general
  `ipcRenderer` handle reaches the renderer.

## Part 2 — the real engine + the swap

- **Route:** run real QRE via your week-2 decision — the Python **`qdk[qre]==
  1.29.1`** package on **`Python 3.13.14`**, invoked as a **subprocess** from the
  main process over **JSON-over-stdio**, with `QDK_PYTHON_TELEMETRY=none` and the
  interpreter + package versions pinned (`docs/tech-stack.md` §How QRE v3 gets
  executed locally). Subprocess isolation is also what keeps a heavy estimate off
  the main-process thread.
- **Python setup/bundling:** a documented, reproducible provisioning path for the
  Python runtime + `qdk[qre]` on **macOS and Windows** (dev now; a bundling plan
  for the packaged app, with size/signing implications noted — deep packaging is
  Part 3/4). No hardcoded absolute interpreter paths; resolve the runtime
  relative to the app.
- **The swap itself is small if week 2 conformed:** the main-process handler
  constructs `QreEngine` instead of `MockEngine`. Both implement
  `EstimatorService`; the three-stage adapter (`configToInvocation` → `execute`
  → `outputToResult`) and the conformance harness are already built. `qreVersion`
  is read from the package at runtime and rides every real result.

## Part 3 — verify end-to-end + harden

- **Prove the full path live:** configure → Run → **real QRE** → Team 2's
  `ResultsArea` renders the real frontier, for a multi-row success, a
  sparse/one-row run, and a **real failure** (rendered through Team 2's failure
  view with a canonical `error.code`).
- **Non-blocking:** a heavy estimate never freezes the main process or the
  renderer; the running state stays live. **Timeouts** are enforced end-to-end,
  and the subprocess is cleaned up on completion, timeout, and app quit (no
  orphaned processes). Two sequential runs don't interfere.
- **Conformance stays green through IPC:** the week-2 harness passes on every
  committed `runconfig.*` fixture (including the failing one → schema-valid
  failed result) with the real engine behind the bridge.

## Part 4 — close the contract decisions (you propose, PMs arbitrate)

Week 2 left four engine/contract edges open. Each is resolved this week as a
PM-arbitrated **contract-change PR** — you supply engine-reality evidence and a
proposed mapping; PMs rule; the schema/fixtures/types + version move together:

| Item | Reality on 1.29.1 | Options for the ruling |
|---|---|---|
| **Sparse fixture** | `runconfig.sparse.json` (`tStatesPerRotation: 5`) is *unsatisfiable* but paired with a *success* result | Amend `5→20` (satisfiable) **or** revert to 5 and treat sparse as an expected-failure fixture; update harness + fixtures to match |
| **Majorana `operationTime`** | The package **ignores** it (inert) | Document-as-inert / mark advisory / drop — the contract must not imply an effect the engine doesn't honor |
| **Trace transform one-of** | PSSPC and Lattice Surgery **chain**, they're not mutually exclusive | Reflect the real relationship in the contract rather than modeling a false one-of |
| **Provisional `source`** | `source` mapping was provisional | Finalize its mapping/status in the appendix |

Land these early — they touch fixtures that Teams 1, 2, and the conformance
harness all consume. Also clear up any "approved" vs "proposed" wording between
your decision memo and DoD so the record is unambiguous.

## Boundaries — what is NOT yours this week

| Not yours | Whose |
|---|---|
| The Run History UI, the SQLite `RunStore`, Rerun reconstruction | Teams 1 & 2 (Part 2) — though your IPC pattern is the template their week-4 store-over-IPC wiring follows |
| Config form / results rendering | Teams 1 & 2's merged surfaces — you wire them to the real engine, you don't touch their code beyond what the swap requires |
| Expanding the estimation contract | PMs — you make the engine honor the *existing* contract and resolve the four gaps above via contract-change |
| Full installers / signing / notarization | Part 3/4 (you note packaging implications now) |
| Cancel / progress streaming | Later (week 3+ interface stubs exist; not this week's deliverable) |

## Quality bar

Strict TS, no `any` at the IPC boundary; the renderer imports only the
`EstimatorService` surface (no engine/subprocess imports — grep-provable);
failures cross as resolved `RunResult`s, never as hanging IPC errors; execution
can't block the main process; timeout + subprocess cleanup enforced (no orphans);
conformance harness green through the real path; no hardcoded absolute paths;
engine-module README + known-issues handoff updated for next week's rotation.
