# Week 2 — Team 3 (Neil + Jessie) — Definition of Done: Engine & Execution

The bar for Wednesday Jul 15 EOD.

## Decision & de-risking

- [ ] **The contract engine surface identified with evidence** (real output
      showing frontier rows + factory/transform control) and both packaging
      routes spiked (working code or documented failure): A (QDK JS/WASM npm)
      and B (`qdk` Python subprocess)
- [ ] **Decision memo** — API-generation finding,
      route findings, packaging implications, version-pinning plan,
      recommendation, and any spec'd fields the public packages don't expose
      (a stakeholder question for the PMs);
- [ ] **Real contract-shaped captures delivered to the PMs** (multi-row +
      single-row frontiers, formatting-stress, a real failure; both
      architecture types; both transforms) for fixture verification — as early
      as possible

## Functional

- [ ] `QreEngine implements EstimatorService` (imported from the frozen
      `contracts/types.ts`) merged, on the chosen route
- [ ] Given each committed (frozen) `runconfig.*` fixture, the engine
      executes a **real QRE estimation locally** (no cloud, no network) and
      resolves with a `RunResult` — including the failing fixture, which
      resolves with a schema-valid **failed** result, not a hang or rejection
- [ ] Emitted `RunResult` **validates against the frozen
      `contracts/runresult.schema.json`** for every fixture input — proven by
      the conformance harness, runnable by anyone via a documented command
- [ ] Every success returns a **`frontier` with ≥1 row**, each row carrying
      all six default fields with numeric `value` + `unit` (0 is legitimate;
      a missing default field ⇒ failed with `ESTIMATION_FAILED`), plus
      whatever further appendix fields the engine reported
- [ ] **`raw` contains the complete, unmodified engine output** (spot-check:
      every field in captured output is present verbatim); on failure, engine
      diagnostics verbatim in `raw`, `null` only when the engine produced
      nothing (TIMEOUT / ENGINE_CRASH)
- [ ] `qreVersion` read from the engine/package at runtime; timestamps
      populated; `status` correct
- [ ] All five frozen `contracts/benchmarks.json` ids exist as real
      runnable sources in-repo with id/name/description metadata mirroring
      the contract file; **at least one uploaded program (Q#/OpenQASM/QIR)
      proven end-to-end**, with bad uploads failing soft
- [ ] **Config semantics enforced exactly** per `data-contracts.md`
      §Validation (arch→QEC coupling, numeric bounds, Litinski19
      availability → `INVALID_CONFIG`; in-range-but-unsatisfiable configs run
      and fail soft — never pre-blocked)
- [ ] Failure paths produce `status: "failed"` + structured `error` using
      **only the canonical codes** from `data-contracts.md` (`INVALID_CONFIG`,
      `COMPILE_ERROR`, `ESTIMATION_FAILED`, `TIMEOUT`, `ENGINE_CRASH`) —
      promise resolves, never hangs

## Correctness & robustness

- [ ] `configToInvocation` and `outputToResult` unit-tested (pure functions,
      tested against fixtures + captured real outputs)
- [ ] Timeout enforced on execution; two sequential runs don't interfere
- [ ] Cross-config sanity: same benchmark, ≥3 different architecture/QEC/
      budget configs → plausible, differing outputs (sanity-checked against
      Microsoft's published examples where available); results included in the
      acceptance walkthrough

## Quality

- [ ] Strict TypeScript; contract types imported from `contracts/types.ts`
      (copied verbatim until the scaffold wires it), never re-declared; no
      hardcoded absolute paths; no UI code anywhere in the track
- [ ] Engine invocation isolated so a heavy estimate cannot block the caller
- [ ] README for the engine module: how to run the harness, benchmark list,
      error codes, route-decision summary link

## Process

- [ ] Team branch `week-2/team-3` created Day 0; all feature PRs target it
- [ ] Team branch merged to `main` via reviewed PR by Wed Jul 15 EOD
- [ ] Checklist file updated with boxes checked
- [ ] Acceptance walkthrough prepared: live harness run (fixture in → real
      estimate → schema-valid result out), a failure case, the cross-config
      table, route recap

## Explicitly NOT required

- Any UI (harness is CLI/tests) · integration with Teams 1/2 code (week 3) ·
  SQLite persistence (Part 2) · update mechanisms or full benchmark library
  (Part 3) · cancel/progress streaming (week 3+) · imported user programs
  (feasibility ruling comes later; benchmarks suffice this week)
