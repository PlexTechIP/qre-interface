# QRE Engine module

`QreEngine implements EstimatorService` (contract types imported verbatim
from `app/src/shared/types.ts`, identical to `contracts/types.ts`).

## Route

**`qdk[qre]==1.29.1` Python subprocess** — in this team's technical brief and
checklist this is called "Route B"; `docs/tech-stack.md` numbers the same two
options the other way around ("Route A" = Python `qdk`, "Route B" = JS/WASM
`qsharp-lang`). This README follows the team-3 brief/checklist naming. See the
[route-decision memo](../../../../docs/week-2/team-3/route-decision-memo.md)
for the full decision and the [Route A findings](../../../../spikes/route-a/FINDINGS.md)
for the executed JS/WASM spike. That spike proved
that `qsharp-lang@1.29.1` can estimate Q# and OpenQASM in-process, but does not
expose the current composable model surface or QIR input required by this
contract; the Python subprocess is therefore the selected route.

`app/src/main/engine/python/estimate.py` is the JSON-over-stdio wrapper
around `qdk.qre.estimate`: it builds the application/architecture/QEC/trace
objects from the invocation JSON, calls `qre.estimate(...)`, and prints a
single JSON object (`status: "success"` with `frontier`/`verbatim`, or
`status: "failed"` with `code`/`message`/`verbatim`) to stdout. Node's
`execute.ts` spawns this script, enforces the timeout, and never lets a
crash or malformed output propagate as an unhandled rejection.

## Running the harness

POSIX setup:

```bash
app/src/main/engine/python/setup_venv.sh   # one-time: creates .venv, installs qdk[qre]==1.29.1
```

Windows PowerShell setup:

```powershell
app/src/main/engine/python/setup_venv.ps1  # one-time: creates .venv, installs qdk[qre]==1.29.1
```

Run the harness from either platform, from the repository root:

```bash
npm --prefix app run test         # fast local/pre-commit suite
npm --prefix app run test:engine  # real qdk/qre suite, including conformance
npm --prefix app run test:all     # every Vitest suite
npm --prefix app run typecheck    # tsc --noEmit -p tsconfig.node.json
```

Both setup scripts require the repository-pinned Python 3.13.14, create
`app/src/main/engine/python/.venv`, and install `requirements.txt`
(`qdk[qre]==1.29.1`) into it. The real engine tests resolve
`.venv/bin/python3` on POSIX and `.venv/Scripts/python.exe` on Windows. Set
`QRE_PYTHON_BIN` to an executable path to override that interpreter explicitly.
The venv must exist before running `npm run test:engine` or `npm run test:all`.

Test suites in this module:

- `pythonBin.test.ts` — Windows/POSIX venv and explicit-override resolution
- `benchmarkRegistry.test.ts` — frozen id/name/description parity
- `benchmarkSmoke.test.ts` — all five frozen ids through the real QDK engine
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
- `crossConfig.test.ts` — same benchmark across three distinct
  architecture/QEC/error-budget tuples, asserting positive metrics and
  distinct package-derived regression outputs

`npm --prefix app run acceptance` executes the four frozen fixture configs,
schema-validates their real results, and prints the concise evidence recorded
in `docs/week-2/team-3/acceptance-walkthrough.md`.

The conformance harness (`app/src/main/engine/conformance.test.ts`) runs the
real engine against all 4 frozen `contracts/fixtures/runconfig.*.json`
fixtures (`runconfig.benchmark.json`, `runconfig.large.json`,
`runconfig.sparse.json`, `runconfig.failing.json`) and validates the emitted
`RunResult` against `contracts/runresult.schema.json` with Ajv, including
requiring every expected-success fixture to return `status: "succeeded"`, a
nonempty frontier, and all six default result fields. The failing fixture must
resolve to a schema-valid `failed` result rather than a hang or rejection.

## Benchmark list

All 5 starter ids from `contracts/benchmarks.json` (`shors-factoring`,
`ekera-hastad-factoring`, `quantum-dynamics`, `grovers-search`, and
`phase-estimation`) resolve to runnable Q# sources under
`app/src/main/engine/benchmarks/qsharp-project/src/`. The Shor and
Ekerå–Håstad programs are explicitly representative resource-estimation
stand-ins for their modular-arithmetic workloads, not faithful implementations
of the complete algorithms.

The wrapper has application constructors for Q#, OpenQASM, and QIR uploads.
This week proves **OpenQASM** end-to-end: `uploadedProgram.test.ts` estimates
`uploads/sample-bell.qasm` and confirms a garbled OpenQASM file fails soft.
Uploaded Q# and QIR remain follow-ups; they are not claimed as end-to-end
proven here.

The six real wrapper captures are indexed by
`docs/week-2/team-3/qre-output-captures/manifest.json`. They cover multi-row,
single-row, formatting-stress, real compile-failure, both architecture types,
and both contract-selected trace-transform configurations.

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

## Decisions of record and known gaps

- **`Majorana.operationTime`: known engine-mapping gap.**
  `qdk[qre]==1.29.1`'s
  `Majorana` dataclass (`qdk.qre.models.Majorana`) only accepts `error_rate`
  — there is no `operation_time` constructor parameter at all in this
  package version. Internally, `Majorana.provided_isa` hardcodes
  `time=1000` (ns) for every instruction (state prep, measurement, T gate)
  regardless of configuration. The wrapper therefore builds
  `Majorana(error_rate=…)` only: `operationTime` is validated and retained in
  the invocation, but is not consumed by this QDK version. It is recorded as
  a known gap rather than represented as effective. Follow-up: map it if a
  future QDK version exposes a parameter.
- **Trace-transform composition:** the frozen contract models PSSPC and
  Lattice Surgery as a one-of selection, while `qdk.qre` produces the required
  estimate through a composed `PSSPC * LatticeSurgery` trace pipeline. The
  selected transform carries the user's parameters and the two selections
  produce distinct valid estimates, as the committed captures demonstrate.
  Follow-up: implement a true one-of mapping after verifying that QDK supports
  a lone transform for these workloads.
- **`source` is provisional.** The current `frontier[].additional.source`
  value records the application input format (`qsharp`, `openqasm`, or `qir`).
  The frozen contract describes this field as the ISA/instruction-set source,
  which QDK 1.29.1 does not expose as a flat result property. Consumers should
  treat the current value as provisional until a true ISA mapping is agreed.
- **Several appendix property names don't exist in this qdk version.**
  `docs/data-contracts.md`'s appendix lists `BLOCK_SIZE`, `BASE_SYSTEM_COST`,
  `SHOT_COST`, `COST_PER_QUBIT`, `COST_PER_HOUR`,
  `COST_PER_QUBIT_PER_HOUR`, and `DATA_QUBIT_SPACING`. None of these names exist
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
