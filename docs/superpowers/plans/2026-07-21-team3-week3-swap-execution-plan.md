# Week 3 — Team 3 — Integration / The Swap: Execution Plan (for Codex)

> **For agentic workers:** implement this plan phase-by-phase, task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking. Do **not** skip Phase 0 —
> nothing else compiles until `main` is integrated into this branch. After each
> phase, run the phase's verification gate and stop if it is red.

**Author:** drafted 2026-07-21 for the `week-2/team-3` → (combined week-2+week-3) PR.
**Owning track:** Team 3 (Neil + Jessie) — integration / the swap.
**Spec of record:** `docs/week-3/team-3/{week-3-team-3-technical-brief,checklist,definition-of-done}.md`
and `docs/week-3/week-3-overview.md`. Read those first; this plan operationalizes them.

---

## 0. Goal & shape of the work

In week 2 we built a real, conformant `QreEngine implements EstimatorService`
(`app/src/main/engine/`) with **no way for the app to reach it**. This week we
build that reach:

1. Stand up the **Electron main process + a typed IPC bridge**.
2. Run the **real `QreEngine`** behind `EstimatorService` over that bridge.
3. **Swap `MockEngine → QreEngine`** so a user configures a run in Team 1's UI
   and sees a real QRE estimate in Team 2's Results Area.
4. Prove configure → run → **real QRE** → results end-to-end; harden
   (non-blocking, timeout, subprocess cleanup, conformance-through-IPC).
5. Prepare the **four contract decisions** (PM-arbitrated) + week-2 carry-over
   cleanup.

The interface (`EstimatorService`) does **not** change — only what backs it and
the fact that it now crosses a real process boundary.

---

## 1. Starting state (verified 2026-07-21)

- **Branch:** `week-2/team-3`, based on **old `main`** (before the Team 1+2
  integration merge). Its open PR is **#2**. It carries the entire engine
  (`app/src/main/engine/*`) and `app/src/shared/types.ts`. It does **not** have
  the renderer.
- **`main` (`origin/main` @ `1856825`):** the full merged renderer — Team 1's
  Run Configuration (`app/src/renderer/`, `state/useRunFlow.ts`, `mockEngine.ts`)
  + Team 2's Results Area (`app/src/renderer/results/*`) + the PM-owned run-record
  contract (`RunRecord`/`RunStore`/`reconstructConfig`, `InMemoryRunStore`,
  `MOCK_RUN_RECORDS`, `runrecord.schema.json`, `runrecord.*.json` fixtures). It
  runs end-to-end against the in-renderer **MockEngine**. It does **not** have
  the engine.
- **Electron:** `electron@43.1.0` is a devDependency on both sides but **unused**
  — there is **no** `app/src/main/main.ts`, no preload, no IPC, and no electron
  scripts (`dev` is just `vite`).
- **Contract collisions on merge:** `contracts/*` and `app/src/shared/*` exist on
  both sides. `contracts/types.ts` ≡ `app/src/shared/types.ts` on `main` (byte
  identical) and are the **canonical superset** (they add `RunRecord`/`RunStore`
  etc. on top of the week-2 `EstimatorService`/`RunConfig`/`RunResult`).
- **Sparse fixture divergence (this is contract-decision #1):**
  `contracts/fixtures/runconfig.sparse.json` is `tStatesPerRotation: 20` on this
  branch (our proposed correction) and `5` on `main` (the frozen original, which
  is *unsatisfiable* on `qdk 1.29.1` yet paired with a *success* result fixture).

### Engine facts Codex will wire against
- `QreEngine` (`app/src/main/engine/qreEngine.ts`): constructor
  `new QreEngine(pythonBin: string, timeoutMs = 120_000)`; `run(config)` **always
  resolves** with a `RunResult` (internal `try/catch` → `ENGINE_CRASH` failed
  result) — it never throws.
- `resolvePythonBin(env?, platform?, engineDir?)` (`pythonBin.ts`): honors
  `QRE_PYTHON_BIN`, else resolves `app/src/main/engine/python/.venv/{Scripts|bin}/python{.exe|3}`.
  Venv is provisioned by `python/setup_venv.{ps1,sh}` from `python/requirements.txt`.
- `MockEngine` (`app/src/shared/mockEngine.ts`): `new MockEngine({mode, delayMs}).run(config)`;
  **throws** `SchemaValidationError` on schema-invalid input, else resolves a
  cloned fixture. Stays in the repo as reference/test double.
- **Swap point:** `app/src/renderer/state/useRunFlow.ts` — the `execute`
  callback does `await new MockEngine({ mode }).run(config)` directly. This is
  the one production place that constructs an engine.

---

## 2. Non-negotiables (from the DoD — hold these the whole way)

- **`main` is never merged into.** All work stays on this branch; the PR to
  `main` waits until week 3 is done **and** PM-approved. Integrating `main` *into*
  this branch (Phase 0) does not touch `main`.
- **`contracts/` is PM-owned and frozen.** No feature-branch edits to
  `contracts/*` (schemas, types, fixtures) except through a PM-arbitrated
  contract-change (see Phase 4). The one merge exception — the sparse fixture — is
  called out explicitly and travels as a proposal, not a unilateral edit.
- **Interface unchanged.** The renderer keeps importing the **same
  `EstimatorService`** from `app/src/shared/types.ts`. The boundary becomes IPC;
  the type does not change.
- **Failures cross as resolved `RunResult`s** (`status: "failed"`, populated
  `error`, diagnostics in `raw` or `raw: null`) — **never** as a thrown/rejected
  IPC error that could hang the caller. Reserve rejection for genuine programmer
  error (schema-invalid input), and fail soft even there.
- **Renderer stays sandboxed:** `contextIsolation: true`, `nodeIntegration: false`;
  only the whitelisted `EstimatorService` surface is exposed — no general
  `ipcRenderer` handle reaches the renderer.
- **Strict TS, no `any` at the IPC boundary.** Production renderer modules import
  **only** the `EstimatorService` surface — no engine/subprocess/`node:*` imports
  (grep-provable). Test files may import `MockEngine`.
- **No hardcoded absolute paths.** The Python runtime resolves relative to the app.
- **`qreVersion`** is read at runtime from the package, never hardcoded — already
  true in the engine; keep it true across the wire.

---

## 3. Branch & PR strategy

- Continue on **`week-2/team-3`** (do **not** cut a fresh `week-3/team-3` off
  `main`). Per the PMs' instruction to Team 3, week-2 and week-3 land in **one
  combined PR** — and this branch is the only place the week-2 engine lives, so
  the week-3 swap must be built on top of it.
- Optional, cosmetic: rename the branch to `week-2-3/team-3` and retitle PR #2 to
  reflect the combined week-2+week-3 scope. Not required to proceed; if done, do
  it once at the end to avoid churn.
- **Do the merge as a real merge commit** (`git merge origin/main`), not a rebase
  — the branch has a published PR and shared history; a rebase would rewrite it.

---

## Phase 0 — Integrate `main` into the branch (prerequisite for everything)

**Intent:** bring Team 1+2's renderer onto this branch, combine it with the
engine, and get the merged tree green — *without* touching `main`.

- [ ] **0.1 Fetch and merge.** `git fetch origin`, then
      `git merge origin/main` while on `week-2/team-3`. Expect conflicts in the
      shared/contract files below. `main` is untouched by this.
- [ ] **0.2 Resolve conflicts by ownership:**
  - **Take `main` (`--theirs`) for all PM-owned canonical files:** everything
    under `contracts/` **except** the sparse pair (next bullet), and everything
    under `app/src/shared/` that is contract/record infrastructure —
    `types.ts`, `runconfig.schema.json`, `runresult.schema.json`,
    `runrecord.schema.json`, `mockEngine.ts`, `runStore.ts`, `runRecordFixtures.ts`,
    `runRecordValidation.ts`, and the `runrecord.*.json` fixtures. Rationale:
    `main`'s versions are the canonical superset (they contain the week-2
    `EstimatorService`/`RunConfig`/`RunResult` **plus** the new run-record surface).
  - **Keep ours for engine files:** everything under `app/src/main/engine/*`
    (adapter, python, tests, README, benchmarks) — `main` doesn't have these.
  - **Sparse fixture = contract decision, resolve to the PROPOSED value for now:**
    keep `contracts/fixtures/runconfig.sparse.json` at **`tStatesPerRotation: 20`**
    (ours) so the conformance harness stays green, and keep the paired
    `runresult.success-sparse.json`. **Flag this loudly** in the PR body and the
    engine README as *pending PM ratification* (it is contract-decision #1 in
    Phase 4). If the PMs instead rule "revert to 5, treat sparse as
    expected-failure," Phase 4 will flip this fixture + the harness expectation.
    Do not silently take `main`'s 5 — that would make conformance red against the
    paired success fixture.
  - **`app/src/shared/types.ts` vs `contracts/types.ts`:** they must remain
    identical (they are on `main`). Take `main`'s for both. Confirm the engine
    still imports the same names (`EstimatorService`, `RunConfig`, `RunResult`,
    `FrontierRow`, `RESULT_FIELD_KEYS`, etc.) — Phase 0.6 typecheck proves it.
- [ ] **0.3 Reconcile `app/package.json`** into one script set (union of both):
  - `dev` / `build` — will be updated in Phase 1 for Electron; for now keep
    `main`'s `vite` `dev` and `tsc --noEmit && vite build` `build`.
  - `typecheck` must cover **both** tsconfigs: e.g.
    `"typecheck": "tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.node.json"`
    (renderer+shared, and main+shared).
  - Keep the engine test scripts from this branch: `test:engine`, `test:all`,
    `acceptance`. Redefine the **fast** `test` (see 0.4).
  - Union of dependencies is already effectively identical (both list the same
    set); keep `ajv`/`ajv-formats`/`react`/`react-dom` deps and the shared
    devDeps. `qsharp-lang` stays an optionalDependency.
- [ ] **0.4 Split fast vs. Python-heavy tests under one Vitest setup.** `main`'s
      `vite.config.ts` sets `test.environment: "jsdom"` and
      `include: src/**/*.{test,spec}.{ts,tsx}`, which would now sweep in the heavy
      real-engine tests (they spawn Python, need the venv, and want a `node`
      environment). Fix with a **Vitest workspace** so each side runs in the right
      environment and the default run stays fast:
  - Add `app/vitest.workspace.ts` with two projects:
    - **renderer** — `environment: jsdom`, `setupFiles: ["./src/renderer/test/setup.ts"]`,
      `include: ["src/renderer/**/*.{test,spec}.{ts,tsx}"]`.
    - **engine-fast** — `environment: node`, `include` = the fast engine tests
      (`pythonBin`, `benchmarkRegistry`, `configToInvocation`, `outputToResult`,
      `execute`, `qreEngine`), matching this branch's current `test` list.
  - `"test": "vitest run"` → runs both fast projects.
  - Keep `"test:engine"` / `"test:all"` (single-worker) for the heavy real-engine
    suite (`conformance`, `robustness`, `crossConfig`, `uploadedProgram`,
    `benchmarkSmoke`) — these require the provisioned venv and are **not** part of
    the default `npm test`.
  - Alternative if a workspace is undesirable: add `test.exclude` for the heavy
    files and a `// @vitest-environment node` docblock atop each engine test.
    The workspace is cleaner; prefer it.
- [ ] **0.5 Reconcile CI.** This branch has `.github/workflows/ci.yml` (engine
      fast checks); `main` has none. Update it to run, on push/PR: (a) renderer
      typecheck (`tsconfig.json`), (b) main typecheck (`tsconfig.node.json`),
      (c) `npm test` (fast workspace). Keep the heavy `test:engine` job separate
      and gated on a Python + venv setup step (`python/setup_venv.sh`), since it
      needs `qdk[qre]`. Do not make the fast lane depend on Python.
- [ ] **0.6 Verification gate (Phase 0):**
  - `npm ci` (or `npm install`) in `app/` succeeds.
  - `npm run typecheck` green (both tsconfigs).
  - `npm test` green (renderer + fast engine).
  - `npm run test:engine` green **locally with the venv provisioned** (proves the
    real engine still conforms post-merge, incl. sparse@20). If the venv isn't
    present in Codex's environment, provision it via `python/setup_venv.{sh,ps1}`
    first; if Python truly isn't available, record that this gate is deferred to a
    machine that has it and continue — but do not claim conformance green.
  - `git grep -nE "from \"\.\./\.\./shared/mockEngine\"|new MockEngine" -- app/src/renderer`
    still shows the pre-swap `useRunFlow` usage (removed in Phase 2).

---

## Phase 1 — Electron main process + typed IPC bridge

**Build under `app/src/main/`.** Keep it small and typed.

- [ ] **1.1 Main process** — `app/src/main/main.ts`: app lifecycle, a single
      `BrowserWindow` with
      `webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: <preload path> }`.
      In **dev**, load the Vite dev-server URL (`process.env.VITE_DEV_SERVER_URL`);
      in **prod**, load the built `index.html`. Standard `window-all-closed` /
      `activate` handling. No remote content, no `nodeIntegrationInWorker`.
- [ ] **1.2 Preload** — `app/src/main/preload.ts`: via `contextBridge.exposeInMainWorld`,
      publish exactly one object, `window.estimator`, shaped as the
      `EstimatorService` surface:
      `{ run(config: RunConfig): Promise<RunResult> }`, implemented as
      `ipcRenderer.invoke("estimator:run", config)`. Expose **nothing else** — no
      raw `ipcRenderer`, no node globals.
- [ ] **1.3 Main-side handler** — `app/src/main/estimatorHandler.ts` (registered
      from `main.ts`): `ipcMain.handle("estimator:run", async (_evt, config: RunConfig) => …)`.
      Construct the real engine **once**:
      `const engine = new QreEngine(resolvePythonBin())`. Return
      `await engine.run(config)`. Wrap the whole body in `try/catch` and, on any
      unexpected throw, **return** a synthesized `status: "failed"` `RunResult`
      with `error.code: "ENGINE_CRASH"` and `raw: null` — so failures cross as
      resolved results, never as a rejected `invoke`. (In practice `QreEngine.run`
      already never throws; this is belt-and-suspenders for the boundary.)
- [ ] **1.4 Renderer typing** — `app/src/renderer/global.d.ts`:
      `declare global { interface Window { estimator: Pick<EstimatorService, "run"> } }`
      importing `EstimatorService` from `../shared/types`. No `any`.
- [ ] **1.5 Build/dev wiring.** Electron's main + preload must be compiled to JS
      that Electron can load. **Recommended:** add `vite-plugin-electron`
      (turnkey: handles the main/preload build, `dist-electron/` output, dev
      auto-reload, and injects `VITE_DEV_SERVER_URL`). Wire `package.json`:
      `"main": "dist-electron/main.js"`, `"dev": "vite"` (plugin launches
      Electron), `"build": "tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.node.json && vite build"`.
      **Dependency-light alternative** (no new dep): add `vite.main.config.ts` +
      `vite.preload.config.ts` in library mode (Node/CJS target, output
      `dist-electron/{main.cjs,preload.cjs}`), a `scripts/dev.mjs` that spawns the
      Vite dev server then Electron with `VITE_DEV_SERVER_URL` set, and set
      `"main": "dist-electron/main.cjs"`. Because `package.json` is
      `"type": "module"`, emit preload/main as **`.cjs`** to avoid ESM-in-Electron
      pitfalls. Pick one; document the chosen mechanic in the engine README.
- [ ] **1.6 tsconfig.** Ensure `app/src/main/{main,preload,estimatorHandler}.ts`
      are covered by `tsconfig.node.json` (`include: ["src/main", "src/shared"]`
      already does this). Add Electron types if needed (`electron` ships its own).
      Keep `app/src/renderer/global.d.ts` under the renderer `tsconfig.json`.
- [ ] **1.7 Verification gate (Phase 1):** `npm run typecheck` green; app boots
      with `npm run dev` — an Electron window opens and loads the existing
      renderer (still on MockEngine until Phase 2). No `ipcRenderer` reachable
      from the renderer console except `window.estimator`.

---

## Phase 2 — The swap (`MockEngine → QreEngine`, via injection)

**Intent:** point the renderer's run flow at `window.estimator` (the real engine
over IPC) while keeping tests runnable without Electron, and keeping production
renderer modules import-clean.

- [ ] **2.1 Inject the estimator into `useRunFlow`.** Refactor
      `app/src/renderer/state/useRunFlow.ts` so the engine is **provided**, not
      constructed: accept an optional `estimator?: Pick<EstimatorService, "run">`,
      defaulting to a `getEstimator()` helper that returns `window.estimator`.
      Replace `await new MockEngine({ mode }).run(config)` with
      `await estimator.run(config)`. Remove the `import { MockEngine } from
      "../../shared/mockEngine"` from this production module.
- [ ] **2.2 Retire the mock-mode dev toggle** (`engineMode` / `setEngineMode` /
      `MockEngineMode`). With the real engine, failures come from real failing
      configs, not a fixture toggle. `git grep -n "engineMode\|setEngineMode\|MockEngineMode"`
      and remove the toggle from `useRunFlow` and its UI affordance in Team 1's
      config surface. Keep the edit **minimal** and note it in the PR as a
      swap-required change to a Team-1 surface (coordinate in channel).
- [ ] **2.3 Keep tests green without Electron.** In renderer tests
      (`RunConfiguration.test.tsx`, any ResultsArea harness, `useRunFlow` tests),
      pass a `MockEngine` instance into `useRunFlow` (or stub `window.estimator`
      in the test setup). `MockEngine` import now lives **only** in test files —
      the production renderer path imports the `EstimatorService` surface only.
- [ ] **2.4 Verification gate (Phase 2):**
  - `git grep -nE "mockEngine|new MockEngine|QreEngine|node:child_process|\"electron\"" -- app/src/renderer ':!*.test.*' ':!*.spec.*'`
    returns **nothing** (production renderer is import-clean).
  - `npm run typecheck` + `npm test` green.
  - `npm run dev` → real Electron app: a default-config run now executes the
    **real** Python engine and renders a real frontier in Team 2's Results Area.

---

## Phase 3 — End-to-end verification + hardening

- [ ] **3.1 Prove the full path live** (manual, needs the GUI + venv): configure
      in Team 1's UI → Run → **real QRE** → Team 2's `ResultsArea` renders, for
      **(a)** a multi-row success, **(b)** a sparse/one-row run, **(c)** a **real
      failure** rendered through Team 2's failure view with a canonical
      `error.code`. Capture commands/screens into the acceptance walkthrough
      (Phase 5). *Codex cannot click a GUI — script what it can (see 3.4) and
      leave a precise manual runbook for the human for the parts it can't.*
- [ ] **3.2 Non-blocking.** A heavy estimate must not freeze the main process or
      the renderer. This is inherent to subprocess isolation (`execute.ts` uses
      `child_process.spawn` + a promise timeout) + `ipcMain.handle` being async —
      confirm no synchronous `execSync`/blocking calls were introduced on the main
      thread. The `running` state stays live in the UI throughout.
- [ ] **3.3 Timeout + subprocess lifecycle.** Timeout is already enforced in
      `execute.ts`. Add **app-quit cleanup**: track live child processes (a
      `Set<ChildProcess>` in main, or have `execute` accept a registry/`AbortSignal`)
      and kill them on `app.on("before-quit")` and `window-all-closed` so no
      orphaned Python processes survive app exit. Verify two sequential runs don't
      interfere (the week-2 `robustness.test.ts` already covers engine-level; add
      an IPC-level check if cheap).
- [ ] **3.4 Conformance-through-IPC.** Add a test that drives the **handler**
      (`estimator:run` path, or `estimatorHandler` directly with a mocked
      `ipcMain`) for every committed `runconfig.*` fixture and Ajv-validates each
      `RunResult` against `contracts/runresult.schema.json` — including the failing
      fixture → schema-valid **failed** result (not a hang/rejection). This proves
      the week-2 conformance guarantee survives the new boundary. Run under the
      engine (node) project, single-worker.
- [ ] **3.5 Surfaces unregressed.** Confirm Team 1's Run Configuration and Team
      2's Results behave as they did on the mock (all their existing tests green).
      Flag any regression in the channel.
- [ ] **3.6 Verification gate (Phase 3):** `npm test` + `npm run test:engine`
      green (venv present); the new IPC-conformance test green; manual runbook for
      3.1 written.

---

## Phase 4 — Contract decisions (PM-arbitrated) + week-2 carry-over

> **These four are PM-owned contract changes. Codex prepares the evidence + a
> proposed mapping and drafts the contract-change (schema + types + fixtures +
> version bump moved together) — but does NOT unilaterally land edits to
> `contracts/`.** The proposal goes to the PMs in-channel; they rule; the ruling
> lands as the dedicated contract-change. Draft the proposals as a memo update so
> the human can post them. Land whichever the PMs have already ruled on.

- [ ] **4.1 Sparse fixture (decision #1).** Evidence: on `qdk 1.29.1`,
      `tStatesPerRotation: 5` is unsatisfiable → `ESTIMATION_FAILED`, 0 rows, yet
      `runresult.success-sparse.json` marks it a success. Proposed options for the
      PMs: **(a)** amend `5 → 20` (satisfiable, 2-row success) — already the
      interim state on this branch; or **(b)** revert to `5` and re-label sparse as
      an **expected-failure** fixture (update `runresult.success-sparse.json` →
      a failed fixture and flip the conformance expectation). Implement whichever
      the PMs rule; keep harness + fixtures consistent with the ruling.
- [ ] **4.2 Majorana `operationTime` (inert).** Evidence: the package **ignores**
      `operationTime`. Proposed: mark it advisory / document-as-inert / drop, so
      the contract does not imply an effect the engine doesn't honor. Update the
      appendix + schema per the ruling.
- [ ] **4.3 Trace transform is not a true one-of.** Evidence: PSSPC and Lattice
      Surgery **chain** in 1.29.1 (composed), they are not mutually exclusive.
      Proposed: reflect the real relationship in the contract instead of a false
      one-of. Update `TraceTransform` modeling per the ruling.
- [ ] **4.4 Provisional `source`.** Finalize the `source` field's mapping/status
      in the appendix (currently the application input format, not the contract's
      ISA meaning). Propose the final mapping.
- [ ] **4.5 Carry-over cleanup (does not block; do it here):**
  - Replace the **fragile substring `COMPILE_ERROR` classifier** in the Python
    wrapper / `outputToResult` path with a robust check (structured error kind
    from the engine rather than string-matching messages). Add a regression test.
  - Finish the **capture spread** for the PMs: add a `litinski19` capture and a
    **second failure class** under `docs/week-2/team-3/qre-output-captures/`,
    update `manifest.json`.
  - Reconcile **"approved" vs "proposed"** wording between the route-decision memo
    and the week-2/week-3 DoDs so the record is unambiguous.

---

## Phase 5 — Docs, handoff, acceptance walkthrough, PR

- [ ] **5.1 Python provisioning docs** (macOS **and** Windows): a reproducible dev
      setup path (`python/setup_venv.{sh,ps1}`, `QDK_PYTHON_TELEMETRY=none`, pinned
      `Python 3.13.14` + `qdk[qre]==1.29.1`) **plus** a bundling plan for the
      packaged app (how the interpreter+package ship, size/signing implications
      noted — deep packaging is Part 3/4). No hardcoded absolute interpreter paths;
      resolution is relative to the app via `resolvePythonBin` (`QRE_PYTHON_BIN`
      override documented).
- [ ] **5.2 Engine-module README + known-issues handoff** (rotation resumes next
      week): document the route, the Python setup, the **IPC boundary** (channel
      name, preload surface, failure-as-result rule, cleanup), and the
      resolved/open contract items. This is the incoming pair's map.
- [ ] **5.3 Acceptance walkthrough** (`docs/week-3/team-3/acceptance-walkthrough.md`):
      live end-to-end run (configure → real QRE → results) with reproducible
      Windows/macOS commands, the failure path, non-blocking demonstrated,
      conformance-green-through-IPC evidence, and the contract-decision recap.
- [ ] **5.4 Check the boxes** in `docs/week-3/team-3/week-3-team-3-checklist.md`
      and `…-definition-of-done.md` **only where truthfully done**; leave
      human/PM/GUI-gated items unchecked with a one-line reason (mirror the honest
      style used in the week-2 docs).
- [ ] **5.5 PR.** Update PR #2 to describe the **combined week-2 + week-3** scope
      (or open the swap PR per the checklist if the PMs prefer a separate one —
      confirm with them; the standing instruction to Team 3 is one combined PR).
      The description states *what changed, how to verify it, which checklist items
      it advances*, and calls out the **sparse-fixture interim (pending PM
      ruling)** and the swap-required edits to Team-1 surfaces. Request teammate
      review **and** PM/owning-team review of the seam. **Do not merge to `main`**
      — that waits for PM approval after week 3 is done.

---

## 6. File / change manifest (quick reference)

**New (Team 3, this week):**
- `app/src/main/main.ts` — Electron main process.
- `app/src/main/preload.ts` — `contextBridge` → `window.estimator`.
- `app/src/main/estimatorHandler.ts` — `ipcMain.handle("estimator:run")` → `QreEngine`.
- `app/src/renderer/global.d.ts` — `Window.estimator` typing.
- `app/vitest.workspace.ts` — renderer(jsdom) + engine(node) projects.
- Electron build wiring — `vite-plugin-electron` **or** `vite.main.config.ts` +
  `vite.preload.config.ts` + `scripts/dev.mjs`.
- `app/src/main/engine/ipcConformance.test.ts` (Phase 3.4).
- `docs/week-3/team-3/acceptance-walkthrough.md`.

**Edited:**
- `app/package.json` — merged scripts (`typecheck` both tsconfigs, `dev`/`build`
  for Electron, keep `test:engine`/`test:all`/`acceptance`), `"main"` field.
- `app/src/renderer/state/useRunFlow.ts` — inject estimator; drop MockEngine + mode toggle.
- Team-1 config surface — remove the mock-mode toggle affordance (minimal).
- Renderer test files — inject `MockEngine` / stub `window.estimator`.
- `.github/workflows/ci.yml` — renderer + main typecheck + fast tests; gated engine job.
- `app/src/main/engine/execute.ts` (+ `main.ts`) — subprocess registry / quit cleanup.
- `app/src/main/engine/README.md` — IPC boundary + handoff + Python provisioning.
- `contracts/*` — **only** via the Phase-4 PM-arbitrated rulings.

**Merge-resolved (Phase 0):** take `main` for `contracts/*` (except sparse) and
`app/src/shared/*`; keep ours for `app/src/main/engine/*`; sparse fixture stays at
`20` (interim, flagged).

---

## 7. Things Codex CANNOT complete alone (route to the human/PMs)

- **The live GUI end-to-end run** (Phase 3.1) — needs a human to drive the
  Electron window; Codex leaves a precise runbook + the automated IPC-conformance
  proof.
- **The four contract rulings** (Phase 4.1–4.4) — PM-owned; Codex drafts evidence
  + proposals, the PMs arbitrate and the change lands via contract-change.
- **Posting surprises / the swap-required Team-1 edit** to the channel — human.
- **The merge to `main`** — blocked by the PMs until week 3 is done + approved.
- **The venv / Python 3.13.14** must exist in the execution environment for the
  real-engine gates; if absent, Codex provisions it via `setup_venv.*` or records
  the gate as deferred to a Python-capable machine (and must not claim conformance
  green without running it).

---

## 8. Definition of done for THIS plan (green = ready for PM review)

1. Phase 0 gate green (merged tree typechecks + fast tests pass; engine
   conformance green locally with venv).
2. Electron app boots and runs the **real** engine end-to-end (multi-row, sparse,
   real failure) with the renderer unchanged in interface.
3. Non-blocking + timeout + subprocess cleanup verified; no orphaned processes.
4. IPC-conformance test green on every `runconfig.*` fixture (incl. failing).
5. Production renderer import-clean (grep-provable); no `any` at the boundary.
6. Contract-decision proposals drafted (+ any PM-ruled changes landed); carry-over
   cleanup done.
7. Python provisioning + engine README/handoff + acceptance walkthrough written.
8. PR updated to combined scope, sparse-interim flagged, seam review requested —
   **not merged to `main`.**
