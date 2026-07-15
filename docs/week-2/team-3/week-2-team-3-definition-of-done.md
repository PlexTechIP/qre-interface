# Week 2 — Team 3 (Neil + Jessie) — Definition of Done: Engine & Execution

The bar for Wednesday Jul 15 EOD.

## Decision & de-risking

- [x] **The contract engine surface identified with evidence** (real output
      showing frontier rows + factory/transform control) and both packaging
      routes spiked (working code or documented failure): A (QDK JS/WASM npm)
      and B (`qdk` Python subprocess) — Route A's executed not-viable finding
      is in `spikes/route-a/FINDINGS.md`; Route B's six real capture pairs are
      indexed by `qre-output-captures/manifest.json`
- [x] **Decision memo** — API-generation finding,
      route findings, packaging implications, version-pinning plan,
      recommendation, and any spec'd fields the public packages don't expose
      (a stakeholder question for the PMs) — complete in
      `route-decision-memo.md`, including explicit closeout decisions for
      Majorana `operationTime` and composed trace transforms
- [ ] **Real contract-shaped captures delivered to the PMs** (multi-row +
      single-row frontiers, formatting-stress, a real failure; both
      architecture types; both transforms) for fixture verification — as early
      as possible — all six pairs are committed and ready; receipt by the PMs
      still requires human confirmation

## Functional

- [x] `QreEngine implements EstimatorService` (imported from the frozen
      `contracts/types.ts`) merged on the team branch, on the chosen route
- [x] Given each committed (frozen) `runconfig.*` fixture, the engine
      executes a **real QRE estimation locally** (no cloud, no network) and
      resolves with a `RunResult` — including the failing fixture, which
      resolves with a schema-valid **failed** result, not a hang or rejection;
      the approved sparse fixture now uses the QDK-feasible
      `tStatesPerRotation: 20`
- [x] Emitted `RunResult` **validates against the frozen
      `contracts/runresult.schema.json`** for every fixture input — proven by
      the strengthened conformance harness, runnable on POSIX and Windows via
      the documented commands
- [x] Every success returns a **`frontier` with ≥1 row**, each row carrying
      the five numeric default metrics plus structured `factories`, each with
      its contract unit/display shape (0 and an empty factory list are
      legitimate; a missing default field ⇒ failed with
      `ESTIMATION_FAILED`), plus further appendix fields reported by the engine
- [x] **`raw` contains the complete, unmodified engine output**: the wrapper
      emits the complete JSON-safe QDK table serialization under the dedicated
      verbatim key, and `outputToResult` preserves that blob without re-keying
      or pruning; on process failure, complete stdout/stderr/exit-code
      diagnostics are retained and `raw` is `null` only when the process
      produced no output. Synthetic and committed-real-capture tests cover
      both behaviors
- [x] `qreVersion` read from the engine/package at runtime; timestamps
      populated; `status` correct
- [x] All five frozen `contracts/benchmarks.json` ids exist as real
      runnable sources in-repo with id/name/description metadata mirroring
      the contract file; **at least one uploaded program (Q#/OpenQASM/QIR)
      proven end-to-end**, with bad uploads failing soft — all five ids have
      runnable Q# sources and OpenQASM is proven end-to-end; Shor and
      Ekerå–Håstad are representative workload stand-ins, and registry
      id/name/description values mirror the frozen list. Uploaded Q#/QIR are
      follow-ups, not claimed as this week's proof
- [ ] **Config semantics enforced exactly** per `data-contracts.md`
      §Validation (arch→QEC coupling, numeric bounds, Litinski19
      availability → `INVALID_CONFIG`; in-range-but-unsatisfiable configs run
      and fail soft — never pre-blocked) — validation rules are enforced, but
      exact engine mapping remains open for Majorana `operationTime` and the
      contract's one-of trace-transform model; both are explicit decisions of
      record in the route memo
- [x] Failure paths produce `status: "failed"` + structured `error` using
      **only the canonical codes** from `data-contracts.md` (`INVALID_CONFIG`,
      `COMPILE_ERROR`, `ESTIMATION_FAILED`, `TIMEOUT`, `ENGINE_CRASH`) —
      promise resolves, never hangs

## Correctness & robustness

- [x] `configToInvocation` and `outputToResult` unit-tested (pure functions,
      tested against committed config fixtures and captured real outputs)
- [x] Timeout enforced on execution; two sequential runs don't interfere
- [x] Cross-config sanity: same benchmark, ≥3 different architecture/QEC/
      budget configs → plausible, differing outputs (sanity-checked against
      Microsoft's published examples where available); results included in the
      acceptance walkthrough — the three-tuple real-engine test and its actual
      comparison table are recorded in `acceptance-walkthrough.md`

## Quality

- [x] Strict TypeScript; contract types imported from `contracts/types.ts`
      (copied verbatim until the scaffold wires it), never re-declared; no
      hardcoded absolute paths; no UI code anywhere in the track
- [x] Engine invocation isolated so a heavy estimate cannot block the caller
- [x] README for the engine module: how to run the harness, benchmark list,
      error codes, route-decision summary link

## Process

- [x] Team branch `week-2/team-3` created Day 0; all feature PRs target it
- [ ] Team branch merged to `main` via reviewed PR by Wed Jul 15 EOD
- [x] Checklist file updated with boxes checked
- [x] Acceptance walkthrough prepared: live harness run (fixture in → real
      estimate → schema-valid result out), a failure case, the cross-config
      table, route recap — recorded with reproducible commands and actual output
      in `acceptance-walkthrough.md`

## Explicitly NOT required

- Any UI (harness is CLI/tests) · integration with Teams 1/2 code (week 3) ·
  SQLite persistence (Part 2) · update mechanisms or full benchmark library
  (Part 3) · cancel/progress streaming (week 3+) · imported user programs
  (feasibility ruling comes later; benchmarks suffice this week)
