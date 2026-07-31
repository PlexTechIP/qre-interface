# Data Contracts — RunConfig & RunResult

> **STATUS: v1.2.0.** This document describes the canonical estimation
> boundary. The committed artifacts under `contracts/` — JSON
> Schemas, `types.ts`, `benchmarks.json`, and fixtures — are the source of
> truth. Changes go through the contract-change process in
> `engineering-workflow.md`.

## Why these exist

Week 2 runs three parallel tracks: Configuration UI (Team 1), Output Display &
Filtering (Team 2), Engine & Execution (Team 3). The boundary between all
three is exactly two JSON shapes:

- **`RunConfig`** — what a configured run looks like going in.
- **`RunResult`** — what comes out.

Team 1 *produces* RunConfig. Team 3 *consumes* RunConfig and *produces*
RunResult. Team 2 *consumes* RunResult. Teams 1 and 2 build against a **mock
engine + fixtures**; Team 3 makes the real engine honor the same shapes. If
everyone conforms, integration in week 3 is a swap, not a rewrite.

## RunConfig

```jsonc
{
  "schemaVersion": "1.0.0",
  "id": "8f14e45f-0000-4000-8000-000000000000",
  "name": "Quantum Dynamics - GateBased 1e-4 - Surface - PSSPC",
  "createdAt": "2026-07-09T18:22:00Z",

  "application": {
    "type": "benchmark",
    "benchmarkId": "quantum-dynamics"
    // uploaded variant:
    // "type": "uploaded",
    // "filePath": "/abs/path/program.qs",
    // "format": "qsharp" | "openqasm" | "qir",
    // "addToLibrary": true
  },

  "architecture": {
    "type": "gateBased",
    "errorRate": 1e-4,
    "gateTime": 50,
    "measurementTime": 100,
    "twoQubitGateTime": null
    // majorana variant:
    // "type": "majorana",
    // "errorRate": 1e-5,
    // "operationTime": 1000
  },

  "qecCode": "surface_code",
  "magicStateFactory": "round_based",

  // A PIPELINE, not a choice. qdk applies PSSPC and then Lattice Surgery on
  // every estimate; each field below belongs to one of the two stages.
  "traceTransform": {
    "tStatesPerRotation": 20,   // PSSPC
    "ccxMagicStates": false,    // PSSPC
    "slowDownFactor": 1.0       // Lattice Surgery, fixed
  },

  "maxError": 1.0,
  "qreVersion": "qdk-qre-v1-fixture"
}
```

### Validation Rules

| Field | Rule |
|---|---|
| `application.type` | `"benchmark"` or `"uploaded"` |
| benchmark `benchmarkId` | String id from `contracts/benchmarks.json`; unknown ids fail soft with `INVALID_CONFIG` |
| uploaded `format` | `"qsharp"`, `"openqasm"`, or `"qir"` |
| `architecture.type` | `"gateBased"` (default) or `"majorana"` |
| gateBased `errorRate` | Default `1e-4`; **0 < x < 0.01** |
| gateBased `gateTime` | **Required, > 0**; serialized in ns |
| gateBased `measurementTime` | **Required, > 0**; serialized in ns |
| gateBased `twoQubitGateTime` | Optional; `null` or a positive number in ns |
| majorana `errorRate` | Default `1e-5`; **one of `1e-4`, `1e-5`, `1e-6`** |
| majorana `operationTime` | Default `1000`; **> 0**, serialized in ns |
| `qecCode` | Coupled to architecture: gateBased → `surface_code`; majorana → `three_aux` |
| `magicStateFactory` | Default `round_based`; `litinski19` only for gateBased with `errorRate <= 1e-3`; Majorana is always `round_based` |
| `traceTransform.tStatesPerRotation` | PSSPC stage. Default `20`; **5 <= x <= 20**. A sparse `5` is in range but has no feasible frontier point on qdk 1.30.0 — that is a failed run, not a validation error |
| `traceTransform.ccxMagicStates` | PSSPC stage. Boolean, default `false`; bound to the GSJ24 CCX secondary factory |
| `traceTransform.slowDownFactor` | Lattice Surgery stage. Fixed `1.0` |
| `maxError` | Default `1.0`; **0 < x <= 1**. In-range values can still be unsatisfiable; that is a failed run, not a validation error |
| `name` | Optional in the UI; when blank, auto-generate and serialize the generated value |

### Benchmarks

The starter benchmark ids are committed in `contracts/benchmarks.json`:

- `shors-factoring`
- `ekera-hastad-factoring`
- `quantum-dynamics`
- `grovers-search`
- `phase-estimation`

Uploaded programs (`qsharp`, `openqasm`, `qir`) can be added to the user's
local benchmark library via the upload flow's "Add Program" option.

## RunResult

A run returns a **Pareto frontier**: one or more non-dominated estimate rows
trading resources such as physical qubits against runtime. The Results Area
renders the frontier as a table and a scatter plot.

```jsonc
{
  "schemaVersion": "1.0.0",
  "runId": "8f14e45f-0000-4000-8000-000000000000",
  "status": "succeeded",
  "error": null,

  "frontier": [
    {
      "physicalQubits": { "value": 829766, "unit": "qubits", "display": "829,766" },
      "runtime": { "value": 19100000, "unit": "ns", "display": "19.1 ms" },
      "logicalCycleTime": { "value": 5200, "unit": "ns", "display": "5.2 us" },
      "factories": {
        "value": [{ "stateType": "T", "copies": 216 }],
        "unit": "factories",
        "display": "216 x T"
      },
      "totalError": { "value": 0.00042, "unit": "probability", "display": "4.2e-4" },
      "codeDistance": { "value": 19, "unit": "", "display": "19" },
      "additional": {
        "physicalFactoryQubits": { "value": 7197120, "unit": "qubits", "display": "7,197,120" },
        "expectedShots": { "value": 1000, "unit": "shots", "display": "1,000" },
        "source": { "value": "qsharp", "unit": "", "display": "Q#" }
      }
    }
  ],

  "raw": { /* the COMPLETE, unmodified engine output */ },
  "qreVersion": "qdk-qre-v1-fixture",
  "startedAt": "2026-07-09T18:22:03Z",
  "completedAt": "2026-07-09T18:22:06Z"
}
```

### The Six Default Result Fields

Every frontier row is guaranteed these six. The Results Area shows them by
default; History and Comparison reuse them.

| Field | Meaning |
|---|---|
| `physicalQubits` | Total physical qubits required |
| `runtime` | Total runtime of the algorithm |
| `logicalCycleTime` | Duration of one logical clock cycle |
| `factories` | Magic-state factories used, represented as state type × number of copies |
| `totalError` | Total logical error probability of the computation |
| `codeDistance` | Code distance of the error-correcting code |

A typical run reports **~10-15 fields** per row out of **37 possible**.
Everything beyond the six defaults is optional per row and lives in
`frontier[].additional`; filtering chooses what is in view, and `raw` always
has the complete engine output.

## Versioning note — v1.2.0 and the trace transform

`traceTransform` was a `psspc` | `latticeSurgery` discriminated union through
v1.1.0, which said the analyst picks one transform. They do not. PSSPC and
Lattice Surgery are sequential stages of one pipeline and qdk runs both on every
estimate — `PSSPC.q()` alone yields an empty frontier, and composing them in the
other order raises `unsupported instruction LATTICE_SURGERY in trace
transformation 'PSSPC'`. No UI control ever set the discriminant, and the
`latticeSurgery` branch silently discarded the T-states and CCX values the form
had collected.

v1.2.0 replaces the union with one object carrying both stages' parameters.

**Nothing migrates on disk.** Records are validated on save and never on read,
and they are immutable (Rerun mints a new record). Stored v1.1.0 records
therefore keep loading; History, Comparison, Rerun and the engine all read them
through `normalizeTraceTransform`, which maps a legacy `latticeSurgery` record
onto the PSSPC defaults it actually ran.

## Contract Rules

1. **`raw` is sacred.** Whatever the engine emits is stored verbatim and
   complete. `frontier` is a convenience projection; everything else stays
   reachable through `raw`.
2. **Producers fill every required field; consumers tolerate extras.**
   RunConfig validates strictly; RunResult consumers must not crash on unknown
   top-level fields, unknown optional result fields, or unknown `error.code`
   strings.
3. **All timestamps are UTC ISO 8601. All numeric values are numbers.**
   `display` carries the human form; never parse or compute from `display`.
4. **`status` is the only flow control.** On failure: `frontier: null`,
   populated `error`, engine diagnostics in `raw` when available, or
   `raw: null` only if the engine produced nothing.
5. **Versioned everything:** `schemaVersion` on both shapes; `qreVersion` on
   both sides. Config-side `qreVersion` is informational; result-side
   `qreVersion` is authoritative and runtime-read.

## Error Codes

The canonical failure codes are:

| Code | Meaning |
|---|---|
| `INVALID_CONFIG` | The config is schema-valid JSON but invalid for the engine or selected benchmark/upload |
| `COMPILE_ERROR` | The selected or uploaded program failed to compile |
| `ESTIMATION_FAILED` | The engine ran but could not produce a feasible estimate |
| `TIMEOUT` | The run exceeded the allowed execution timeout |
| `ENGINE_CRASH` | The engine process crashed or produced no usable output |

`error.message` is analyst-facing and should include a suggested next step.
Engine-native diagnostics belong in `raw`.

## Appendix — 37 Possible Result Fields

The engine can report any of these per frontier row (**bold** = the six
defaults). Team 2's filter operates over whatever arrives; Team 3 maps engine
output keys onto these names.

| # | Field | Meaning |
|---|---|---|
| 1 | **qubits** (`physicalQubits`) | Total physical qubits required |
| 2 | **runtime** | Total runtime of the algorithm |
| 3 | **error** (`totalError`) | Total logical error probability of the computation |
| 4 | **factories** | Magic-state factories used (state type × number of copies) |
| 5 | source | Which ISA/instruction set produced this result |
| 6 | PHYSICAL_COMPUTE_QUBITS | Physical qubits used for computation |
| 7 | PHYSICAL_FACTORY_QUBITS | Physical qubits used by magic-state factories |
| 8 | PHYSICAL_MEMORY_QUBITS | Physical qubits used for memory |
| 9 | LOGICAL_COMPUTE_QUBITS | Logical qubits used for computation |
| 10 | LOGICAL_MEMORY_QUBITS | Logical qubits used for memory |
| 11 | ALGORITHM_COMPUTE_QUBITS | Algorithm-level compute qubits (before encoding) |
| 12 | ALGORITHM_MEMORY_QUBITS | Algorithm-level memory qubits (before encoding) |
| 13 | **LOGICAL_CYCLE_TIME** (`logicalCycleTime`) | Duration of one logical clock cycle |
| 14 | CODE_CYCLE_TIME | Duration of one physical code cycle (syndrome-extraction round) |
| 15 | RUNTIME_SINGLE_SHOT | Runtime for a single shot of the algorithm |
| 16 | EXPECTED_SHOTS | Number of shots/repetitions expected |
| 17 | EVALUATION_TIME | Time spent computing the estimate itself |
| 18 | **DISTANCE** (`codeDistance`) | Code distance of the error-correcting code |
| 19 | NUM_TS_PER_ROTATION | T states used to synthesize each arbitrary rotation |
| 20 | BLOCK_SIZE | Logical block size |
| 21 | FEASIBILITY | Whether the configuration is feasible |
| 22 | LOSS | Qubit loss rate (hardware loss) |
| 23 | TARGET_YEAR | Target hardware year |
| 24 | NAME | Name/label of the result |
| 25 | ASSUMPTIONS | Modeling assumptions used |
| 26 | BASE_SYSTEM_COST | Fixed base cost of the system |
| 27 | SHOT_COST | Cost per shot |
| 28 | COST_PER_QUBIT | Cost per physical qubit |
| 29 | COST_PER_HOUR | Operating cost per hour |
| 30 | COST_PER_QUBIT_PER_HOUR | Cost per qubit per hour |
| 31 | ATOM_SPACING | Spacing between atoms (neutral-atom) |
| 32 | DATA_QUBIT_SPACING | Spacing between data qubits (neutral-atom) |
| 33 | VELOCITY | Max atom transport velocity (neutral-atom) |
| 34 | ACCELERATION | Max atom transport acceleration (neutral-atom) |
| 35 | SURFACE_CODE_ONE_QUBIT_TIME_FACTOR | Depth multiplier for one-qubit gates in syndrome extraction |
| 36 | SURFACE_CODE_TWO_QUBIT_TIME_FACTOR | Depth multiplier for two-qubit gates in syndrome extraction |
| 37 | MOLECULE | The molecule being estimated (chemistry) |

Non-numeric fields such as `source`, `FEASIBILITY`, `ASSUMPTIONS`, `NAME`, and
`MOLECULE` still follow the `{ value, unit, display }` envelope with a string
`display`.
