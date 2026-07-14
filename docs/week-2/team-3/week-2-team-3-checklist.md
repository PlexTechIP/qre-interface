# Week 2 — Team 3 (Neil + Jessie) — Checklist: Engine & Execution

**Due: Wednesday Jul 15 EOD** — 
Read first: `../week-2-overview.md`, `week-2-team-3-technical-brief.md`,
`docs/data-contracts.md`. Check items off as you go (edit + commit).

Your track has the most unknowns of the three — front-load the risky part
(actually running QRE at all) into the first two days.

## A. Day 0–2 — Spike both routes, riskiest work first

- [x] **Create your team branch** `week-2/team-3` off `main` — all your
      feature branches PR into it; it merges to `main` by Wed Jul 15 EOD
      (`docs/engineering-workflow.md`) — confirmed: this worktree is on
      `week-2/team-3` (`git branch --show-current`)
- [ ] Read `docs/data-contracts.md` **v1** end-to-end (config semantics,
      frontier output, 37-field appendix) and your technical brief; raise
      surprises in the channel **today** — reading almost certainly happened
      (the implementation matches the contract closely), but "raised
      surprises in the channel" isn't something verifiable from repo state,
      so left unchecked
- [x] **API coverage spike first:** find which package + API version exposes
      the contract surface (factories, trace transforms, Three-Aux, frontier
      output) — the `qdk` estimation API is the prime candidate — confirmed:
      `qdk[qre]==1.29.1`'s `qdk.qre` module exposes `GateBased`, `Majorana`,
      `SurfaceCode`, `ThreeAux`, `RoundBasedFactory`, `Litinski19Factory`,
      `PSSPC`, `LatticeSurgery`, `QSharpApplication`, `OpenQASMApplication`,
      `QIRApplication` — the full contract vocabulary
- [ ] **Route A spike (QDK JS/WASM npm surface):** in a throwaway Node
      project, get any contract-shaped estimate to run and print output.
      Note: feature coverage vs. the spec, supported inputs (Q#/OpenQASM/
      QIR), how parameters are passed, output shape, version pinning,
      install size — **not done.** No `qsharp-lang` code, spike script, or
      documented failure exists anywhere in this repo. Left unchecked
      honestly; see `docs/week-2/team-3/route-decision-memo.md` §Route A for
      the full writeup and the open question this raises against the DoD
- [x] **Route B spike (`qdk` Python package, subprocess):** same goal —
      invoked from a Node parent process. Note: feature coverage, Python
      runtime bundling implications, invocation interface, output shape,
      version pinning — done and superseded by a full production
      implementation: `app/src/main/engine/python/estimate.py` +
      `execute.ts` invoke it via JSON-over-stdio from Node, exercised by
      31/31 passing tests including `conformance.test.ts` against all 4
      frozen fixtures
- [x] **Capture real contract-shaped output for the PMs** (multi-row frontier,
      single-row, formatting-stress, a real failure; both architecture types;
      both transforms) — PMs use this to validate or update the contract
      fixtures; — confirmed delivered at
      `docs/week-2/team-3/qre-output-captures/` (5 capture pairs +
      `manifest.json`): multi-row and single-row GateBased+PSSPC frontiers,
      a real `COMPILE_ERROR` failure, Majorana+ThreeAux, and Lattice
      Surgery — covers both architecture types and both trace transforms

## B. Engine adapter

- [x] Implement `QreEngine implements EstimatorService` on the chosen route,
      in `app/src/main/engine/` (or standalone package if scaffold is late —
      structure to slot in) — confirmed: `app/src/main/engine/qreEngine.ts`,
      `EstimatorService`/`RunConfig`/`RunResult` imported verbatim from
      `app/src/shared/types.ts` (identical to `contracts/types.ts`)
- [x] **Input translation:** `RunConfig` → engine invocation (application →
      program source or uploaded file; architecture params, QEC code,
      factory, trace transform, max error → engine parameters), enforcing
      exactly the contract's semantics (arch→QEC coupling, numeric bounds,
      Litinski19 availability → `INVALID_CONFIG`; **in-range-but-
      unsatisfiable is NOT pre-blocked** — see technical brief §Config
      semantics) — confirmed: `configToInvocation.ts` +
      `configToInvocation.test.ts` (10 cases covering all the rules above,
      including an explicit "does NOT reject an in-range-but-unsatisfiable
      maxError" test)
- [x] **Output translation:** engine output → `RunResult.frontier` — one
      entry per estimate row; all six default fields per row (0 is a
      legitimate value; a missing default field ⇒ `ESTIMATION_FAILED`);
      additional reported fields mapped per the appendix; **complete verbatim
      output preserved in `raw`**, `qreVersion` + timestamps + `status`
      populated — confirmed: `outputToResult.ts` +
      `outputToResult.test.ts` (8 cases, including a test covering all 31
      non-default `RESULT_FIELD_KEYS` and a zero-values-preserved case)
- [x] **Failure mapping:** invalid config / compile error (incl. bad
      uploads) / estimation failure / timeout / crash → `status: "failed"`
      with the **canonical `error.code` enum** from `data-contracts.md` and
      an analyst-facing `error.message`; engine diagnostics verbatim in `raw`
      (or `raw: null` only when the engine produced nothing) — the process
      never hangs the caller — confirmed: `execute.ts` assigns `TIMEOUT`/
      `ENGINE_CRASH`, `estimate.py` assigns `COMPILE_ERROR`/
      `ESTIMATION_FAILED`, only the canonical 5 codes are ever used
      (grepped the module — no invented codes)

## C. Conformance & benchmarks

- [x] **Conformance harness** (CLI or test suite): feed `RunConfig` fixture
      JSON in → validate emitted `RunResult` against the **frozen**
      `contracts/runresult.schema.json` — passing for **every** committed
      `runconfig.*` fixture, including the failing one (which must produce a
      schema-valid **failed** result, not a hang or a rejection) —
      confirmed: `app/src/main/engine/conformance.test.ts` runs all 4 frozen
      fixtures (`runconfig.benchmark.json`, `runconfig.large.json`,
      `runconfig.sparse.json`, `runconfig.failing.json`) through the real
      engine and Ajv-validates each `RunResult`; passing as of this commit
- [x] Every id in the frozen `contracts/benchmarks.json` is runnable: real
      sources for all five starter benchmarks stored in-repo with metadata
      mirroring the contract file (seeds the Part-3 benchmark library), and
      **at least one uploaded program proven end-to-end** (file in →
      estimate out; bad file → clean `INVALID_CONFIG`/`COMPILE_ERROR`) —
      confirmed: all 5 ids present in `benchmarkRegistry.ts` with real `.qs`
      sources under `benchmarks/qsharp-project/src/`, and
      `uploadedProgram.test.ts` proves an OpenQASM upload succeeding and a
      garbled upload failing soft
- [ ] Cross-config sanity check: same benchmark across ≥3 architecture/QEC/
      budget combinations → plausible, *differing* outputs (compare against
      Microsoft's published tutorial numbers where available) — **not done.**
      No test or doc in the repo runs the same benchmark across ≥3 differing
      configs and compares against Microsoft's published numbers; the
      capture set covers different benchmarks/architectures but isn't the
      same-benchmark comparison this item asks for. Left unchecked; flagged
      as an open item in the route decision memo
- [x] Version capture: `qreVersion` read from the engine/package itself, not
      hardcoded — confirmed: `estimate.py`'s `qre_version()` calls
      `importlib.metadata.version("qdk")` at runtime; all 5 real captures
      independently report `"qreVersion": "1.29.1"`

## D. Robustness + acceptance prep

- [x] Concurrent/sequential runs don't interfere (two runs back-to-back both
      produce valid results) — confirmed: `robustness.test.ts` runs two
      configs sequentially and two concurrently, asserting on `raw`
      benchmark-specific numbers (not just `runId`/`status`) to catch a
      subprocess stdout mix-up; both tests pass
- [x] Execution is async and non-blocking; slow estimates report a sane
      running status to the caller — confirmed for what's in scope this
      week: `execute.ts` uses `child_process.spawn` + a `Promise`-based
      timeout, never blocking the Node event loop, and `RunResult.status` is
      only ever `"succeeded"`/`"failed"` (progress streaming / a "running"
      status is explicitly out of scope this week per the DoD's "Explicitly
      NOT required" list)
- [ ] Walk through `week-2-team-3-definition-of-done.md` — every box checkable
      — walkthrough performed as part of this task; **not every box is
      checkable yet** — specifically the Route A spike, the cross-config
      sanity check, the acceptance-walkthrough rehearsal, and the PR-merged-
      to-main item are still open (see above and below). Left unchecked
      because the literal claim ("every box checkable") isn't true yet
- [ ] Acceptance walkthrough: harness run live (config in → real estimation →
      conformant result out), failure case, cross-config comparison table,
      route decision recap — not yet rehearsed/prepared as a live walkthrough
- [ ] PR(s) merged to `main` by Wed Jul 15 EOD — final acceptance from `main`
      — not yet opened; this task's work ends at commit + handoff to Codex
      for pre-PR review per the task brief's checkpoint
