# Team 3 — QRE Engine & Execution: Design

**Status:** Draft, week-2 Team 3 (Engine & Execution). Route: **B — `qdk` Python
subprocess** (primary per `docs/tech-stack.md`; a light Route A evidence spike
still owed for the DoD, out of scope for this doc).

## Scope

Build `QreEngine implements EstimatorService` (from `contracts/types.ts`,
imported verbatim, never re-declared) end to end, in
`app/src/main/engine/`: consume a `RunConfig`, execute a real QRE estimation
via the Python `qdk[qre]` subprocess, and emit a conformant `RunResult`.

Per `docs/week-2/team-3/week-2-team-3-technical-brief.md`, the implementation
is three separately-testable stages:

1. **`configToInvocation(config)`** — pure function, `RunConfig` → engine
   invocation. Config-semantics validation, benchmark/upload source
   resolution.
2. **`execute(invocation)`** — the only stage that touches the engine. Spawns
   the Python subprocess, enforces a timeout, captures stdout/stderr, never
   lets a crash propagate as an unhandled rejection.
3. **`outputToResult(raw, config, timing)`** — pure function, raw qdk output →
   `RunResult` (frontier rows, `raw`, `status`/`error`/`qreVersion`/timestamps).

## Internal type: `QreInvocation`

The seam between stage 1 and stages 2–3. Not part of the frozen `contracts/`
— an implementation detail of this module.

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

## Stage 1 — `configToInvocation`

### Validation rules (enforced exactly — no more, no less)

Straight from `docs/data-contracts.md` §Validation and the technical brief's
"Config semantics you enforce" section:

- `application.type` is `"benchmark"` or `"uploaded"`.
- Benchmark: `benchmarkId` must resolve in the local benchmark registry
  (seeded from `contracts/benchmarks.json` + real sources); unknown id →
  `INVALID_CONFIG`.
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

### Benchmark source wiring

All 5 ids in `contracts/benchmarks.json` get real, in-repo source programs
(`shors-factoring`, `ekera-hastad-factoring`, `quantum-dynamics`,
`grovers-search`, `phase-estimation`), stored under
`app/src/main/engine/benchmarks/` with id/name/description metadata
mirroring the contract file. `configToInvocation` resolves `benchmarkId` →
`{ sourcePath, format, entryExpr }` via this local registry.

Uploaded programs: resolve `filePath` directly; `addToLibrary` handling
(copying into the local registry) is in scope here since it's a config-time
concern, not an execution concern.

## Stage 2 — `execute`

- Spawns the Python subprocess (`python3` + `qdk[qre]` invocation script,
  `QDK_PYTHON_TELEMETRY=none`), passes `QreInvocation` over JSON-over-stdio,
  reads the JSON response from stdout.
- Enforces a hard timeout (kill + `TIMEOUT` result); captures stderr for
  diagnostics.
- Never lets a subprocess crash propagate as an unhandled rejection — a crash
  resolves as `status: "failed"`, `error.code: "ENGINE_CRASH"`.
- Two sequential/concurrent runs must not interfere (no shared mutable state
  across invocations; each spawn is independent).

## Stage 3 — `outputToResult`

- Maps raw qdk output keys (e.g. `LOGICAL_CYCLE_TIME`, `PHYSICAL_FACTORY_QUBITS`,
  `DISTANCE`) onto the contract's `RESULT_FIELD_KEYS` per the
  `data-contracts.md` appendix.
- Builds `frontier`: one row per estimate, all six default fields required
  (numeric `value` + `unit` + `display`; `0` is legitimate) — a row missing a
  default field makes the whole run `failed`/`ESTIMATION_FAILED`.
- `raw` is the complete, unmodified engine output, verbatim — `null` only
  when the engine produced nothing (`TIMEOUT`/`ENGINE_CRASH`).
- `qreVersion` read from the engine/package at runtime, never hardcoded.
- Failure mapping uses only the canonical `error.code` enum: `INVALID_CONFIG`,
  `COMPILE_ERROR`, `ESTIMATION_FAILED`, `TIMEOUT`, `ENGINE_CRASH`.

## Conformance harness

CLI or test suite: feed each `contracts/fixtures/runconfig.*.json` fixture
through the full `QreEngine.run()`, validate the emitted `RunResult` against
`contracts/runresult.schema.json` with Ajv + ajv-formats. Must pass for all
4 fixtures, including `runconfig.failing.json` (schema-valid invocation that
resolves as a schema-valid **failed** result, not a hang or rejection).

## Testing plan

- **Stage 1 unit tests:** all 4 `runconfig.*` fixtures → correct
  `QreInvocation` (note: `runconfig.failing.json` is schema-valid and should
  produce a *valid* invocation — its failure happens downstream in
  execution). Boundary cases: Litinski19 at `errorRate` exactly 1e-3 (allowed)
  vs 1.01e-3 (rejected); Majorana with `litinski19` (rejected); unknown
  `benchmarkId`; malformed upload `format`; one good and one bad uploaded
  program.
- **Stage 2/3 unit tests:** against captured real qdk outputs — multi-row
  frontier, single-row frontier, formatting-stress (very large numbers), a
  real failure. One capture per architecture type, one per trace transform.
- **Cross-config sanity:** same benchmark across ≥3 architecture/QEC/factory
  combinations → plausible, differing outputs.
- **Conformance harness green** on all 4 fixtures end to end.

## Claude + Codex workflow

Claude Code drives: writes all three stages, the benchmark registry, the
Python subprocess wrapper, and the tests above. After each stage (or logical
chunk of work), run Codex as an independent review pass checking
specifically: validation rules match `data-contracts.md` exactly (no
missing/extra rules), all failure paths resolve rather than throw, the raw
key mapping is correct and complete, timeout/crash handling can't hang the
caller, `raw` is preserved verbatim. Reconcile Codex's findings before moving
to the next stage.

## Out of scope for this doc

Route A spike/decision memo, packaging/bundling for distribution, SQLite
persistence, any UI.
