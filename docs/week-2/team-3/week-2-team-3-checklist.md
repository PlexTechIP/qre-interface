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
- [x] **Route A spike (QDK JS/WASM npm surface):** in a throwaway Node
      project, get any contract-shaped estimate to run and print output.
      Note: feature coverage vs. the spec, supported inputs (Q#/OpenQASM/
      QIR), how parameters are passed, output shape, version pinning,
      install size — done as a **documented not-viable finding**. The npm
      package `qsharp-lang@1.29.1` runs real Q#/OpenQASM estimates in-process
      but exposes only the *legacy* estimator: no Three-Aux, Litinski19,
      selectable factory/trace transforms, or QIR input, and a 43-field
      legacy frontier that doesn't match the contract's row shape. Full
      writeup, probe scripts, and verbatim output samples are committed under
      `spikes/route-a/` (`spikes/route-a/FINDINGS.md`); recap in
      `docs/week-2/team-3/route-decision-memo.md` §Route A. This closes the
      DoD's "both routes spiked (working code or documented failure)" bar
- [x] **Route B spike (`qdk` Python package, subprocess):** same goal —
      invoked from a Node parent process. Note: feature coverage, Python
      runtime bundling implications, invocation interface, output shape,
      version pinning — done and superseded by a full production
      implementation: `app/src/main/engine/python/estimate.py` +
      `execute.ts` invoke it via JSON-over-stdio from Node, exercised by
      the real-engine suite including strengthened conformance against all 4
      committed fixtures
- [x] **Capture real contract-shaped output for the PMs** (multi-row frontier,
      single-row, formatting-stress, a real failure; both architecture types;
      both transforms) — PMs use this to validate or update the contract
      fixtures; — the capture set is committed at
      `docs/week-2/team-3/qre-output-captures/` (6 capture pairs +
      `manifest.json`): multi-row and single-row GateBased+PSSPC frontiers,
      a real `COMPILE_ERROR` failure, Majorana+ThreeAux, and Lattice
      Surgery, plus `formatting-stress-wide-frontier` — covers both
      architecture types and both contract-selected trace configurations.
      Repository evidence is complete; human confirmation that PMs received
      it is tracked separately in the DoD and remains unchecked

## B. Engine adapter

- [x] Implement `QreEngine implements EstimatorService` on the chosen route,
      in `app/src/main/engine/` (or standalone package if scaffold is late —
      structure to slot in) — confirmed: `app/src/main/engine/qreEngine.ts`,
      `EstimatorService`/`RunConfig`/`RunResult` imported verbatim from
      `app/src/shared/types.ts` (identical to `contracts/types.ts`)
- [x] **Input translation:** `RunConfig` → engine invocation (application →
      program source or uploaded file; architecture params, QEC code,
      factory, trace transform, max error → engine parameters), enforcing
      the contract's validation semantics (arch→QEC coupling, numeric bounds,
      Litinski19 availability → `INVALID_CONFIG`; **in-range-but-
      unsatisfiable is NOT pre-blocked** — see technical brief §Config
      semantics) — confirmed: `configToInvocation.ts` +
      `configToInvocation.test.ts`, including all committed fixtures and an
      explicit "does NOT reject an in-range-but-unsatisfiable maxError" test.
      Two engine-mapping differences are decisions of record rather than
      hidden equivalences: Majorana `operationTime` is validated/threaded but
      QDK 1.29.1 cannot consume it, and the wrapper composes PSSPC + Lattice
      Surgery although the contract models the selection one-of. See the
      route memo for the exact rulings and follow-ups
- [x] **Output translation:** engine output → `RunResult.frontier` — one
      entry per estimate row; five numeric default metrics plus the structured
      `factories` default per row (0/empty are legitimate; a missing default
      field ⇒ `ESTIMATION_FAILED`);
      additional reported fields mapped per the appendix; **complete verbatim
      output preserved in `raw`**, `qreVersion` + timestamps + `status`
      populated — confirmed: `outputToResult.ts` +
      `outputToResult.test.ts`, including all 31 non-default
      `RESULT_FIELD_KEYS`, zero-values preservation, and committed real-capture
      mapping without alteration of the dedicated verbatim blob. The current
      `additional.source` value is provisionally the application input format,
      not yet the contract's ISA meaning; see the route memo
- [x] **Failure mapping:** invalid config / compile error (incl. bad
      uploads) / estimation failure / timeout / crash → `status: "failed"`
      with the **canonical `error.code` enum** from `data-contracts.md` and
      an analyst-facing `error.message`; engine diagnostics verbatim in `raw`
      (or `raw: null` only when the engine produced nothing) — the process
      never hangs the caller — confirmed: `execute.ts` assigns `TIMEOUT`/
      `ENGINE_CRASH`, `estimate.py` assigns `COMPILE_ERROR`/
      `ESTIMATION_FAILED`, only the canonical 5 codes are used, and transport
      tests preserve complete stdout/stderr/exit-code diagnostics for nonzero,
      malformed, and unrecognized-status process completions

## C. Conformance & benchmarks

- [x] **Conformance harness** (CLI or test suite): feed `RunConfig` fixture
      JSON in → validate emitted `RunResult` against the **frozen**
      `contracts/runresult.schema.json` — passing for **every** committed
      `runconfig.*` fixture, including the failing one (which must produce a
      schema-valid **failed** result, not a hang or a rejection) —
      confirmed: `app/src/main/engine/conformance.test.ts` runs all 4 frozen
      fixtures (`runconfig.benchmark.json`, `runconfig.large.json`,
      `runconfig.sparse.json`, `runconfig.failing.json`) through the real
      engine and Ajv-validates each `RunResult`. The three expected-success
      fixtures must additionally return `succeeded`, `error: null`, a
      nonempty frontier, and all default result fields; the failing fixture
      must return `failed`. The approved sparse fixture uses
      `tStatesPerRotation: 20`, which QDK 1.29.1 can estimate. The strengthened
      real-engine gate is green on Windows
- [x] Every id in the frozen `contracts/benchmarks.json` is runnable: real
      sources for all five starter benchmarks stored in-repo with metadata
      mirroring the contract file (seeds the Part-3 benchmark library), and
      **at least one uploaded program proven end-to-end** (file in →
      estimate out; bad file → clean `INVALID_CONFIG`/`COMPILE_ERROR`) —
      all 5 ids resolve to runnable `.qs` sources under
      `benchmarks/qsharp-project/src/`; Shor and Ekerå–Håstad are explicitly
      representative resource-estimation stand-ins rather than faithful full
      algorithms. `uploadedProgram.test.ts` proves an OpenQASM upload
      succeeding and a garbled OpenQASM upload failing soft. Uploaded Q# and
      QIR are follow-up validation work, not this week's E2E proof
- [x] Cross-config sanity check: same benchmark across ≥3 architecture/QEC/
      budget combinations → plausible, *differing* outputs (compare against
      Microsoft's published tutorial numbers where available) — confirmed:
      `app/src/main/engine/crossConfig.test.ts` runs `quantum-dynamics`
      through GateBased+SurfaceCode at maxError 1, GateBased+SurfaceCode at
      maxError 0.01, and Majorana+ThreeAux at maxError 1; it asserts three
      genuinely distinct input tuples, positive metrics, and three distinct
      first-row signatures, and pins the observed `qdk[qre]==1.29.1`
      runtimes (585,900 ns, 2,538,900 ns, 10,602,000 ns). No Microsoft
      published tutorial numbers for this exact three-config comparison are
      committed in the repo; if PMs provide canonical external numbers, swap
      the package-derived anchors for those references.
- [x] Version capture: `qreVersion` read from the engine/package itself, not
      hardcoded — confirmed: `estimate.py`'s `qre_version()` calls
      `importlib.metadata.version("qdk")` at runtime; all 6 real captures
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
      checkable yet** — the acceptance evidence is prepared, but exact config
      semantics still have the two documented QDK mapping gaps, PM receipt of
      captures needs human confirmation, and the team branch is not merged to
      main. Left unchecked because the literal claim ("every box checkable")
      is not yet true
- [x] Acceptance walkthrough: harness run live (config in → real estimation →
      conformant result out), failure case, cross-config comparison table,
      route decision recap — prepared in
      `docs/week-2/team-3/acceptance-walkthrough.md` with the reproducible
      Windows commands, actual fixture summaries, three-tuple table, capture
      links, and route-decision recap
- [ ] PR(s) merged to `main` by Wed Jul 15 EOD — final acceptance from `main`
      — not yet opened; this task's work ends at commit + handoff to Codex
      for pre-PR review per the task brief's checkpoint
