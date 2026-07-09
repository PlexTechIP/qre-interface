# Week 2 — Team 3 (Neil + Jessie) — Checklist: Engine & Execution

**Due: Wednesday Jul 15 EOD** — 
Read first: `../week-2-overview.md`, `week-2-team-3-technical-brief.md`,
`docs/data-contracts.md`. Check items off as you go (edit + commit).

Your track has the most unknowns of the three — front-load the risky part
(actually running QRE at all) into the first two days.

## A. Day 0–2 — Spike both routes, riskiest work first

- [ ] **Create your team branch** `week-2/team-3` off `main` — all your
      feature branches PR into it; it merges to `main` by Wed Jul 15 EOD
      (`docs/engineering-workflow.md`)
- [ ] Read `docs/data-contracts.md` **v1** end-to-end (config semantics,
      frontier output, 37-field appendix) and your technical brief; raise
      surprises in the channel **today**
- [ ] **API coverage spike first:** find which package + API version exposes
      the contract surface (factories, trace transforms, Three-Aux, frontier
      output) — the `qdk` estimation API is the prime candidate
- [ ] **Route A spike (QDK JS/WASM npm surface):** in a throwaway Node
      project, get any contract-shaped estimate to run and print output.
      Note: feature coverage vs. the spec, supported inputs (Q#/OpenQASM/
      QIR), how parameters are passed, output shape, version pinning,
      install size
- [ ] **Route B spike (`qdk` Python package, subprocess):** same goal —
      invoked from a Node parent process. Note: feature coverage, Python
      runtime bundling implications, invocation interface, output shape,
      version pinning
- [ ] **Capture real contract-shaped output for the PMs** (multi-row frontier,
      single-row, formatting-stress, a real failure; both architecture types;
      both transforms) — PMs use this to validate or update the contract
      fixtures;

## B. Engine adapter

- [ ] Implement `QreEngine implements EstimatorService` on the chosen route,
      in `app/src/main/engine/` (or standalone package if scaffold is late —
      structure to slot in)
- [ ] **Input translation:** `RunConfig` → engine invocation (application →
      program source or uploaded file; architecture params, QEC code,
      factory, trace transform, max error → engine parameters), enforcing
      exactly the contract's semantics (arch→QEC coupling, numeric bounds,
      Litinski19 availability → `INVALID_CONFIG`; **in-range-but-
      unsatisfiable is NOT pre-blocked** — see technical brief §Config
      semantics)
- [ ] **Output translation:** engine output → `RunResult.frontier` — one
      entry per estimate row; all six default fields per row (0 is a
      legitimate value; a missing default field ⇒ `ESTIMATION_FAILED`);
      additional reported fields mapped per the appendix; **complete verbatim
      output preserved in `raw`**, `qreVersion` + timestamps + `status`
      populated
- [ ] **Failure mapping:** invalid config / compile error (incl. bad
      uploads) / estimation failure / timeout / crash → `status: "failed"`
      with the **canonical `error.code` enum** from `data-contracts.md` and
      an analyst-facing `error.message`; engine diagnostics verbatim in `raw`
      (or `raw: null` only when the engine produced nothing) — the process
      never hangs the caller

## C. Conformance & benchmarks

- [ ] **Conformance harness** (CLI or test suite): feed `RunConfig` fixture
      JSON in → validate emitted `RunResult` against the **frozen**
      `contracts/runresult.schema.json` — passing for **every** committed
      `runconfig.*` fixture, including the failing one (which must produce a
      schema-valid **failed** result, not a hang or a rejection)
- [ ] Every id in the frozen `contracts/benchmarks.json` is runnable: real
      sources for all five starter benchmarks stored in-repo with metadata
      mirroring the contract file (seeds the Part-3 benchmark library), and
      **at least one uploaded program proven end-to-end** (file in →
      estimate out; bad file → clean `INVALID_CONFIG`/`COMPILE_ERROR`)
- [ ] Cross-config sanity check: same benchmark across ≥3 architecture/QEC/
      budget combinations → plausible, *differing* outputs (compare against
      Microsoft's published tutorial numbers where available)
- [ ] Version capture: `qreVersion` read from the engine/package itself, not
      hardcoded

## D. Robustness + acceptance prep

- [ ] Concurrent/sequential runs don't interfere (two runs back-to-back both
      produce valid results)
- [ ] Execution is async and non-blocking; slow estimates report a sane
      running status to the caller
- [ ] Walk through `week-2-team-3-definition-of-done.md` — every box checkable
- [ ] Acceptance walkthrough: harness run live (config in → real estimation →
      conformant result out), failure case, cross-config comparison table,
      route decision recap
- [ ] PR(s) merged to `main` by Wed Jul 15 EOD — final acceptance from `main`
