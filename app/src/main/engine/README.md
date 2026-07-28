# QRE Engine module

`QreEngine implements EstimatorService` (contract types imported verbatim
from `app/src/shared/types.ts`, identical to `contracts/types.ts`).

## Route

**`qdk[qre]==1.30.0` Python subprocess** — in this team's technical brief and
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

## Electron IPC boundary

The Electron main process owns one `QreEngine` instance and registers
`estimator:run`. The sandboxed preload exposes only
`window.estimator.run(config): Promise<RunResult>`; it never exposes
`ipcRenderer` or Node globals. The handler catches unexpected exceptions and
resolves an `ENGINE_CRASH` result, so engine failures do not reject the IPC
request. `execute.ts` tracks live Python children and the main process kills
them during `before-quit` and `window-all-closed`.

`npm run dev` first bundles `main.cjs` and `preload.cjs`, starts Vite, then
launches Electron. `npm run build` produces `dist/` and `dist-electron/`.

## Running the harness

POSIX setup:

```bash
app/src/main/engine/python/setup_venv.sh   # one-time: creates .venv, installs requirements.txt
```

Windows PowerShell setup:

```powershell
app/src/main/engine/python/setup_venv.ps1  # one-time: creates .venv, installs requirements.txt
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
(`qdk[qre]==1.30.0`) into it. The real engine tests resolve
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
real engine against the 4 builder configs from `app/src/shared/testing`
(benchmark, large, sparse, failing) and validates the emitted
`RunResult` against `app/src/shared/contracts/runresult.schema.json` with Ajv, including
requiring every expected-success fixture to return `status: "succeeded"`, a
nonempty frontier, and all six default result fields. The failing fixture must
resolve to a schema-valid `failed` result rather than a hang or rejection.

## Benchmark list

All 5 starter ids from `app/src/shared/contracts/benchmarks.json` (`shors-factoring`,
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

The eight real wrapper captures are indexed by
`docs/week-2/team-3/qre-output-captures/manifest.json`. They cover multi-row,
single-row, Litinski19, formatting stress, real compile and estimation failures,
both architecture types, and both contract-selected trace configurations.

## Error codes

Canonical codes only, per `docs/data-contracts.md`: `INVALID_CONFIG`,
`COMPILE_ERROR`, `ESTIMATION_FAILED`, `TIMEOUT`, `ENGINE_CRASH`. Assigned by:

- `configToInvocation.ts` — `INVALID_CONFIG` for architecture/QEC mismatches,
  out-of-range numeric bounds, and unavailable factory combinations (never
  for an in-range-but-unsatisfiable config — that runs and lets the engine
  fail soft).
- `execute.ts` — `TIMEOUT` on a killed subprocess, `ENGINE_CRASH` on a
  nonzero exit / non-JSON stdout / unrecognized `status`.
- `estimate.py` — `COMPILE_ERROR` only for QDK's structured `QSharpError`
  exception type, `ESTIMATION_FAILED` otherwise (including an empty Pareto
  frontier). Message substrings are not used for classification.
- `outputToResult.ts` — `ESTIMATION_FAILED` if a frontier row is missing one
  of the six required default fields.

## Decisions of record and known gaps

The four contract items below remain proposals pending PM arbitration; this
branch does not treat them as approved contract changes. Evidence and proposed
mappings are in `docs/week-3/team-3/contract-decision-proposals.md`.

- **`Majorana.operationTime`: known engine-mapping gap.**
  On `qdk[qre]==1.29.1`, the `Majorana` dataclass
  (`qdk.qre.models.Majorana`) only accepted `error_rate`; there was no
  `operation_time` constructor parameter, and `Majorana.provided_isa`
  hardcoded `time=1000` (ns). The wrapper therefore builds
  `Majorana(error_rate=…)` only. In `qdk[qre]==1.30.0`, `Majorana` exposes a
  `time` parameter, so the engine surface changed. This branch reports that
  finding but does not map `operationTime` yet; doing so changes estimate
  behavior and should move through the PM-owned contract decision.
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
  which QDK 1.29.1 did not expose as a flat result property. Consumers should
  treat the current value as provisional until a true ISA mapping is agreed.
- **Several appendix property names were absent in qdk 1.29.1.**
  `docs/data-contracts.md`'s appendix lists `BLOCK_SIZE`, `BASE_SYSTEM_COST`,
  `SHOT_COST`, `COST_PER_QUBIT`, `COST_PER_HOUR`,
  `COST_PER_QUBIT_PER_HOUR`, and `DATA_QUBIT_SPACING`. These names were not
  present in `qdk.qre.property_keys` in `1.29.1`; they are present in
  `1.30.0`. `estimate.py` builds `PROPERTY_IDS` from `dir(property_keys)`, so
  newly emitted values can flow through without a mapping-table change.
- **`distance` and `codeCycleTime` aren't in the entry's flat properties
  dict.** They live on the QEC transform's instruction node in the result's
  provenance graph (`entry.source.nodes`, filtered to the `SurfaceCode` /
  `ThreeAux` transform) and `estimate.py`'s `find_qec_property` walks that
  graph to extract them. `logicalCycleTime` is derived as
  `distance * codeCycleTime` (confirmed against a real capture:
  distance 13 × codeCycleTime 350ns = logicalCycleTime 4550ns in
  `docs/week-2/team-3/qre-output-captures/multi-row-gatebased-psspc.output.json`).

## Python distribution plan

Local development uses the checked-in setup scripts and a repo-relative venv.
For packaged builds, ship a platform-specific Python 3.13.14 runtime plus the
pinned wheels beside `dist-electron/python`, then resolve it relative to the
installed app resources. Build one artifact per OS/architecture; do not share a
venv between platforms. The runtime increases installer size substantially and
all native binaries must be included in code-signing, notarization, malware
scanning, and SBOM work. Deep packaging is deferred to Part 3/4; the current
build intentionally copies wrapper sources but not the development `.venv`.
