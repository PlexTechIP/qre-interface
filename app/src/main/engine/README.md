# QRE Engine module

`QreEngine implements EstimatorService` (contract types imported verbatim
from `app/src/shared/types.ts`, identical to `contracts/types.ts`).

## Route

**`qdk[qre]==1.29.1` Python subprocess** — in this team's technical brief and
checklist this is called "Route B"; `docs/tech-stack.md` numbers the same two
options the other way around ("Route A" = Python `qdk`, "Route B" = JS/WASM
`qsharp-lang`). This README follows the team-3 brief/checklist naming. See
`docs/week-2/team-3/route-decision-memo.md` for the full evidence, including
an honest note that the JS/WASM route was never spiked this cycle.

`app/src/main/engine/python/estimate.py` is the JSON-over-stdio wrapper
around `qdk.qre.estimate`: it builds the application/architecture/QEC/trace
objects from the invocation JSON, calls `qre.estimate(...)`, and prints a
single JSON object (`status: "success"` with `frontier`/`verbatim`, or
`status: "failed"` with `code`/`message`/`verbatim`) to stdout. Node's
`execute.ts` spawns this script, enforces the timeout, and never lets a
crash or malformed output propagate as an unhandled rejection.

## Running the harness

```bash
app/src/main/engine/python/setup_venv.sh   # one-time: creates .venv, installs qdk[qre]==1.29.1
cd app && npm run test                      # runs all vitest suites, including conformance.test.ts
cd app && npm run typecheck                 # tsc --noEmit -p tsconfig.node.json
```

`setup_venv.sh` creates `app/src/main/engine/python/.venv` and installs
`requirements.txt` (`qdk[qre]==1.29.1`) into it. All engine tests locate the
interpreter at `app/src/main/engine/python/.venv/bin/python3`, so the venv
must exist before running `npm run test`.

Test suites in this module (`vitest run`, 31 tests across 7 files):

- `configToInvocation.test.ts` — pure-function config validation/translation
- `execute.test.ts` — subprocess execution, timeout, crash handling
- `outputToResult.test.ts` — pure-function output mapping, including the
  31 non-default appendix fields and required-field failure handling
- `qreEngine.test.ts` — the `EstimatorService` entry point end-to-end
- `conformance.test.ts` — the conformance harness (below)
- `uploadedProgram.test.ts` — uploaded OpenQASM program, success and
  clean-failure paths
- `robustness.test.ts` — two sequential runs and two concurrent runs,
  asserting on `raw` (not just `runId`/`status`) so a subprocess stdout
  mix-up between concurrent runs would be caught

The conformance harness (`app/src/main/engine/conformance.test.ts`) runs the
real engine against all 4 frozen `contracts/fixtures/runconfig.*.json`
fixtures (`runconfig.benchmark.json`, `runconfig.large.json`,
`runconfig.sparse.json`, `runconfig.failing.json`) and validates the emitted
`RunResult` against `contracts/runresult.schema.json` with Ajv, including
confirming the failing fixture resolves to a schema-valid `failed` result
rather than a hang or rejection.

## Benchmark list

All 5 starter benchmarks from `contracts/benchmarks.json` (`shors-factoring`,
`ekera-hastad-factoring`, `quantum-dynamics`, `grovers-search`,
`phase-estimation`) have real Q# sources under
`app/src/main/engine/benchmarks/qsharp-project/src/`, registered in
`app/src/main/engine/benchmarkRegistry.ts` with matching id/name/description
metadata. Uploaded programs (Q#, OpenQASM, QIR — `RunConfig.application.type
=== "uploaded"`) are also supported; `uploadedProgram.test.ts` exercises a
worked OpenQASM example against `app/src/main/engine/uploads/sample-bell.qasm`
and a garbled-file failure against `app/src/main/engine/uploads/bad-sample.qasm`.

## Error codes

Canonical codes only, per `docs/data-contracts.md`: `INVALID_CONFIG`,
`COMPILE_ERROR`, `ESTIMATION_FAILED`, `TIMEOUT`, `ENGINE_CRASH`. Assigned by:

- `configToInvocation.ts` — `INVALID_CONFIG` for architecture/QEC mismatches,
  out-of-range numeric bounds, and unavailable factory combinations (never
  for an in-range-but-unsatisfiable config — that runs and lets the engine
  fail soft).
- `execute.ts` — `TIMEOUT` on a killed subprocess, `ENGINE_CRASH` on a
  nonzero exit / non-JSON stdout / unrecognized `status`.
- `estimate.py` — `COMPILE_ERROR` when the caught exception looks like a
  program-compile/resolve failure, `ESTIMATION_FAILED` otherwise (including
  an empty Pareto frontier).
- `outputToResult.ts` — `ESTIMATION_FAILED` if a frontier row is missing one
  of the six required default fields.

## Known gaps vs. the contract (flagged to PMs)

- **`Majorana.operation_time` has no effect.** `qdk[qre]==1.29.1`'s
  `Majorana` dataclass (`qdk.qre.models.Majorana`) only accepts `error_rate`
  — there is no `operation_time` constructor parameter at all in this
  package version. Internally, `Majorana.provided_isa` hardcodes
  `time=1000` (ns) for every instruction (state prep, measurement, T gate)
  regardless of configuration. `estimate.py`'s `build_architecture` reflects
  this: it constructs `Majorana(error_rate=architecture["errorRate"])` and
  never reads `architecture["operationTime"]`. `configToInvocation.ts` still
  validates `operationTime > 0` and threads it through the invocation JSON
  for forward-compatibility (and because the contract requires it on the
  wire), but it is silently dropped before reaching the qdk object and has
  no effect on any Majorana estimate. **Open question for PMs:** should the
  UI still expose this field for Majorana runs, or mark it read-only /
  informational until a package update exposes real control?
- **Several appendix property names don't exist in this qdk version.**
  `docs/data-contracts.md`'s appendix lists `SOURCE`, `BLOCK_SIZE`,
  `BASE_SYSTEM_COST`, `SHOT_COST`, `COST_PER_QUBIT`, `COST_PER_HOUR`,
  `COST_PER_QUBIT_PER_HOUR`, `DATA_QUBIT_SPACING`. None of these names exist
  on `qdk.qre.property_keys` in `1.29.1` (verified directly against the
  installed package), so `estimate.py`'s `PROPERTY_IDS` — built from
  `dir(property_keys)` — never includes them, and they never appear in
  `frontier[].additional`. `outputToResult.ts` still carries mapping entries
  for them so nothing needs to change if a future qdk version adds them.
- **`distance` and `codeCycleTime` aren't in the entry's flat properties
  dict.** They live on the QEC transform's instruction node in the result's
  provenance graph (`entry.source.nodes`, filtered to the `SurfaceCode` /
  `ThreeAux` transform) and `estimate.py`'s `find_qec_property` walks that
  graph to extract them. `logicalCycleTime` is derived as
  `distance * codeCycleTime` (confirmed against a real capture:
  distance 13 × codeCycleTime 350ns = logicalCycleTime 4550ns in
  `docs/week-2/team-3/qre-output-captures/multi-row-gatebased-psspc.output.json`).
