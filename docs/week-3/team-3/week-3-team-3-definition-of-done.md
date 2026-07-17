# Week 3 — Team 3 (Neil + Jessie) — Definition of Done: Integration — The Swap

The bar for Tuesday Jul 21 EOD.

## Functional

- [ ] **Electron main process stood up** in `app/src/main/`: app lifecycle, a
      `BrowserWindow` loading the existing renderer, and a preload script —
      renderer sandboxed (`contextIsolation: true`, `nodeIntegration: false`)
- [ ] **Typed IPC bridge** exposes an **`EstimatorService`-shaped** API to the
      renderer via `contextBridge`; `ipcMain` handlers call the real engine; the
      renderer imports the **same `EstimatorService`** from `contracts/types.ts`
      it used for the mock — the interface is unchanged
- [ ] **`MockEngine → QreEngine` swapped** behind that interface: the app runs
      the real engine by default; the MockEngine remains as the reference/test
      double
- [ ] **Real QRE runs via the chosen route** (`qdk[qre]==1.29.1` on Python
      `3.13.14`, subprocess from main, JSON-over-stdio,
      `QDK_PYTHON_TELEMETRY=none`, versions pinned); `qreVersion` read at runtime
- [ ] **End-to-end proven live:** configure (Team 1) → Run → **real QRE** →
      Team 2's `ResultsArea` renders the real frontier — for a multi-row success,
      a sparse/one-row run, and a **real failure** (canonical `error.code`,
      rendered through Team 2's failure view)
- [ ] **Python setup/bundling** documented and reproducible on macOS **and**
      Windows (dev provisioning + a packaged-app bundling plan with size/signing
      implications noted); no hardcoded absolute interpreter paths
- [ ] **Contract decisions landed** as PM-arbitrated contract-change PRs: the
      sparse-fixture ruling, Majorana `operationTime` (inert), the trace-transform
      one-of, and the provisional `source` field — schema/fixtures/types +
      version moved together

## Validation & correctness

- [ ] `RunConfig` (renderer→main) and `RunResult` (main→renderer) cross intact
      (structured-clone-safe); **failures cross as resolved `RunResult`s**
      (`status: "failed"`), never as thrown/hanging IPC errors
- [ ] **Conformance harness green through the IPC path** on every committed
      `runconfig.*` fixture, including the failing one → a schema-valid failed
      result
- [ ] **Non-blocking:** a heavy estimate never freezes the main process or the
      renderer; the running state stays live
- [ ] **Timeout enforced end-to-end**; the subprocess is cleaned up on
      completion, timeout, and app quit (no orphaned processes); two sequential
      runs don't interfere
- [ ] **Teams 1 & 2's surfaces verified unregressed** by the swap (Run
      Configuration + Results behave as they did on the mock)
- [ ] **Carry-over from week 2:** the capture spread is finished (a `litinski19`
      capture + a 2nd failure class) and the fragile substring `COMPILE_ERROR`
      classifier is replaced with a robust check

## Quality

- [ ] Strict TypeScript; no `any` at the IPC boundary; the renderer imports only
      the `EstimatorService` surface — no engine/subprocess imports
      (grep-provable)
- [ ] Only the whitelisted `EstimatorService` methods are exposed over IPC (no
      general `ipcRenderer` handle in the renderer)
- [ ] No hardcoded absolute paths anywhere; the Python runtime resolves relative
      to the app
- [ ] Engine-module **README + known-issues handoff** updated for next week's
      rotation (route, Python setup, IPC boundary, resolved/open contract items);
      "approved" vs "proposed" wording reconciled between the decision memo and
      this DoD

## Process

- [ ] Team branch `week-3/team-3` created Day 0 (**Thu Jul 16**) off the
      **updated `main`**; all feature PRs target it
- [ ] Swap **PR opened** `week-3/team-3 → main`, **reviewed** by the teammate
      **and** a PM/owning team (it touches the shared scaffold + both teams'
      surfaces), then **merged onto `main` after approval** by **Tue Jul 21
      EOD**
- [ ] Checklist file updated with boxes checked
- [ ] Acceptance walkthrough prepared: live end-to-end run (configure → real QRE
      → results) → a failure path → non-blocking demonstrated → conformance green
      through IPC → contract-decision recap

## Explicitly NOT required

- The Run History UI or the SQLite `RunStore` (Teams 1 & 2, Part 2) · editing
  Team 1/2 UI code beyond what the swap requires · expanding the estimation
  contract (make the engine honor the existing one; resolve the four gaps via
  contract-change) · full installers / code-signing / notarization (Part 3/4;
  note implications now) · cancel/progress streaming · the week-4 store-over-IPC
  wiring, save-after-run trigger, or live Rerun path (your IPC pattern is the
  template, but the wiring is week 4)
