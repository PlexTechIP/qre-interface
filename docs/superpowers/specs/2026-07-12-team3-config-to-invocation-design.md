# Team 3 — `configToInvocation` Design (Jessie's slice)

**Status:** Draft, week-2 Team 3 (Engine & Execution). Route: **B — `qdk` Python
subprocess** (primary per `docs/tech-stack.md`; a light Route A evidence spike
still owed for the DoD, out of scope for this doc).

## Scope

Team 3 splits `QreEngine implements EstimatorService` into three stages
(per `docs/week-2/team-3/week-2-team-3-technical-brief.md`). This doc covers
**only the first stage, owned by Jessie**: `configToInvocation`. Neil owns
`execute` + `outputToResult` (the Python subprocess wrapper and raw-output
mapping) — separate doc/PR, out of scope here except for the shared seam
defined below.

## Responsibility

Pure function: `RunConfig` in → `QreInvocation` out, or a validation failure
that the caller turns into `status: "failed"`, `error.code: "INVALID_CONFIG"`.
No engine calls, no subprocess, no I/O beyond reading benchmark source files
already stored in-repo.

## The seam: `QreInvocation`

The only shape Jessie's and Neil's code share. Not part of the frozen
`contracts/` — an internal implementation detail Team 3 owns.

```ts
interface QreInvocation {
  program: {
    sourcePath: string;      // resolved absolute path to .qs/.qasm/.ll(qir) source
    format: "qsharp" | "openqasm" | "qir";
    entryExpr: string;       // from benchmarks.json, or "" for uploads without one
  };
  architecture:
    | { type: "gateBased"; errorRate: number; gateTime: number; measurementTime: number; twoQubitGateTime: number | null }
    | { type: "majorana"; errorRate: 0.0001 | 0.00001 | 0.000001; operationTime: number };
  qecCode: "surface_code" | "three_aux";
  magicStateFactory: "round_based" | "litinski19";
  traceTransform:
    | { type: "psspc"; tStatesPerRotation: number; ccxMagicStates: boolean }
    | { type: "latticeSurgery"; slowDownFactor: 1.0 };
  maxError: number;
  timeoutMs: number;         // constant, set by configToInvocation (not user-configurable this week)
}
```

Neil confirms/edits this async before Tuesday's wire-up; either side can
propose a change since it's not contract-frozen.

## Validation rules (enforced exactly — no more, no less)

Straight from `docs/data-contracts.md` §Validation and the technical brief's
"Config semantics you enforce" section:

- `application.type` is `"benchmark"` or `"uploaded"`.
- Benchmark: `benchmarkId` must resolve in the local benchmark registry
  (seeded from `contracts/benchmarks.json` + Team 3's real sources); unknown
  id → `INVALID_CONFIG`.
- Uploaded: `format` is `qsharp`/`openqasm`/`qir`; file must exist and parse
  far enough to identify format mismatches → `INVALID_CONFIG`; actual compile
  failure is `COMPILE_ERROR` and happens downstream in `execute`, not here.
- Architecture → QEC coupling: `gateBased` ⇒ `surface_code`;
  `majorana` ⇒ `three_aux`. Any other pairing → `INVALID_CONFIG`.
- GateBased `errorRate` ∈ (0, 0.01); `gateTime`, `measurementTime` required
  and > 0; `twoQubitGateTime` null or > 0.
- Majorana `errorRate` ∈ {1e-4, 1e-5, 1e-6}; `operationTime` > 0.
- `litinski19` only for GateBased with `errorRate <= 1e-3`; Majorana is
  `round_based` only.
- PSSPC `tStatesPerRotation` ∈ [5, 20]; `latticeSurgery.slowDownFactor` fixed
  at 1.0.
- `maxError` ∈ (0, 1]. **In-range but unsatisfiable values are NOT validated
  here** — they pass through and fail downstream as `ESTIMATION_FAILED`.

Failures resolve the promise with a schema-valid failed `RunResult`
(`INVALID_CONFIG`, analyst-facing `error.message`) — never a rejection, per
`EstimatorService.run()`'s contract.

## Benchmark source wiring

All 5 ids in `contracts/benchmarks.json` get real, in-repo source programs
(`shors-factoring`, `ekera-hastad-factoring`, `quantum-dynamics`,
`grovers-search`, `phase-estimation`), stored under
`app/src/main/engine/benchmarks/` with id/name/description metadata
mirroring the contract file. `configToInvocation` resolves `benchmarkId` →
`{ sourcePath, format, entryExpr }` via this local registry.

Uploaded programs: resolve `filePath` directly; `addToLibrary` handling
(copying into the local registry) is in scope for this stage since it's a
config-time concern, not an execution concern.

## Testing plan

Unit tests (pure function, no subprocess):
- All 4 `contracts/fixtures/runconfig.*.json` fixtures → correct
  `QreInvocation` (or correct `INVALID_CONFIG` where expected — note
  `runconfig.failing.json` is schema-valid and should produce a *valid*
  invocation; its failure happens downstream in execution, not here).
- Boundary cases: Litinski19 at `errorRate` exactly 1e-3 (allowed) and
  1.01e-3 (rejected); Majorana with `magicStateFactory: litinski19`
  (rejected); unknown `benchmarkId`; malformed upload `format`.
- One uploaded-program case end-to-end (good file → valid invocation; bad/
  garbled file → `INVALID_CONFIG`).

## Claude + Codex workflow

Claude Code drives: writes `configToInvocation`, the validation logic,
benchmark registry, and the unit tests above. Before each PR into
`week-2/team-3`, run Codex as an independent review pass checking specifically:
validation rules match `data-contracts.md` exactly (no missing/extra rules),
all failure paths resolve rather than throw, benchmark→source mapping is
correct. Reconcile findings, then Neil does the human PR review per
`docs/engineering-workflow.md`.

## Out of scope for this doc

Python subprocess wrapper, `execute`, `outputToResult`, raw-output field
mapping, timeout/crash handling, conformance harness wiring (Neil's slice /
joint Tuesday integration), Route A spike.
