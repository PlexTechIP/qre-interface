# Week 2 Team 3 acceptance walkthrough

Recorded on July 15, 2026 from `week-2/team-3` using Python 3.13.14 and
`qdk[qre]==1.29.1`. All estimates ran locally through the Python subprocess;
no cloud service or network execution was involved.

## Reproduce from Windows PowerShell

```powershell
app/src/main/engine/python/setup_venv.ps1
npm --prefix app run typecheck
npm --prefix app run test
npm --prefix app run test:engine
npm --prefix app run acceptance
```

The final recorded gates were:

```text
typecheck:   passed
fast tests:  6 files passed, 37 tests passed
real engine: 9 files passed, 28 tests passed
```

`npm --prefix app run acceptance` executes all four frozen configs through
`QreEngine`, validates every resulting `RunResult` with Ajv against the frozen
`contracts/runresult.schema.json`, and exits nonzero if an expected success or
failure has the wrong status.

## Live successful fixture

Input: [`runconfig.benchmark.json`](../../../contracts/fixtures/runconfig.benchmark.json)

Actual summary printed by the acceptance harness:

```json
{
  "fixture": "runconfig.benchmark.json",
  "config": {
    "application": "quantum-dynamics",
    "architecture": "gateBased",
    "qecCode": "surface_code",
    "traceTransform": "psspc",
    "maxError": 1
  },
  "schemaValid": true,
  "status": "succeeded",
  "frontierRows": 1,
  "firstRow": {
    "physicalQubits": 426,
    "runtimeNs": 585900,
    "logicalCycleTimeNs": 1050,
    "factories": [{ "stateType": "T", "copies": 1 }],
    "totalError": 0.2218502264687556,
    "codeDistance": 3
  },
  "error": null,
  "rawPresent": true,
  "qreVersion": "1.29.1"
}
```

The complete wrapper output, including its verbatim QDK blob, is committed as
[`single-row-gatebased-psspc.output.json`](qre-output-captures/single-row-gatebased-psspc.output.json).

The conformance run also proved real, schema-valid successes for
`runconfig.large.json` (two rows) and the approved `runconfig.sparse.json`
revision (two rows), as well as the expected failure below.

## Live failure fixture

Input: [`runconfig.failing.json`](../../../contracts/fixtures/runconfig.failing.json)

Actual summary printed by the same acceptance run:

```json
{
  "fixture": "runconfig.failing.json",
  "config": {
    "application": "quantum-dynamics",
    "architecture": "gateBased",
    "qecCode": "surface_code",
    "traceTransform": "psspc",
    "maxError": 1e-12
  },
  "schemaValid": true,
  "status": "failed",
  "frontierRows": 0,
  "firstRow": null,
  "error": {
    "code": "ESTIMATION_FAILED",
    "message": "The estimator found no feasible Pareto frontier point; relax maxError or adjust the model."
  },
  "rawPresent": true,
  "qreVersion": "1.29.1"
}
```

The engine returned an empty verbatim entry list with statistics showing zero
feasible jobs. It resolved normally rather than throwing or hanging. A separate
real malformed-program capture proves the `COMPILE_ERROR` path:
[`real-compile-failure.output.json`](qre-output-captures/real-compile-failure.output.json).

## Three-tuple cross-config comparison

`crossConfig.test.ts` runs the same Quantum Dynamics benchmark sequentially for
three distinct architecture/QEC/error-budget tuples. These are QDK-derived
values pinned by the test and backed by the committed captures.

| Architecture / QEC / budget | Rows | First-row qubits | Runtime (ns) | Logical cycle (ns) | Total error | Distance | T factories |
|---|---:|---:|---:|---:|---:|---:|---:|
| GateBased / Surface / `maxError=1` | 1 | 426 | 585,900 | 1,050 | `0.2218502264687556` | 3 | 1 |
| GateBased / Surface / `maxError=0.01` | 5 | 25,085 | 2,538,900 | 4,550 | `0.00038368947294057` | 13 | 17 |
| Majorana / ThreeAux / `maxError=1` | 2 | 1,209 | 10,602,000 | 45,000 | `0.34310688736840955` | 3 | 8 |

Evidence: [`single-row-gatebased-psspc`](qre-output-captures/single-row-gatebased-psspc.output.json),
[`multi-row-gatebased-psspc`](qre-output-captures/multi-row-gatebased-psspc.output.json),
and [`majorana-three-aux`](qre-output-captures/majorana-three-aux.output.json).

## Capture-set verification

[`manifest.json`](qre-output-captures/manifest.json) records six QDK 1.29.1
input/output pairs: multi-row, single-row, compile failure, Majorana/ThreeAux,
lattice surgery, and formatting stress. The `formatting-stress-wide-frontier`
case returned five rows spanning 25,085–43,365 physical qubits and
1,674,000,000–4,352,400,000 ns runtime, with all eight appendix properties
reported by this QDK/configuration path.

Regenerate the set with:

```powershell
& app/src/main/engine/python/.venv/Scripts/python.exe app/src/main/engine/python/capture_pm_outputs.py
```

## Route-decision recap

The selected route is the pinned Python `qdk.qre` subprocess. The JS/WASM
alternative was spiked and found not viable for this contract's current
composable model and QIR surface; see
[`spikes/route-a/FINDINGS.md`](../../../spikes/route-a/FINDINGS.md) and the
[`route-decision-memo.md`](route-decision-memo.md).

Decisions of record while PMs were unavailable:

- **Majorana `operationTime`:** the wrapper builds `Majorana(error_rate=...)`
  only. `operationTime` is validated and retained in the invocation but is not
  consumed by QDK 1.29.1. This is a documented engine-mapping gap, with a
  follow-up to map it if QDK exposes a parameter.
- **Trace-transform one-of:** QDK 1.29.1 requires the sequential PSSPC and
  lattice-surgery pipeline, while the product contract models them as one-of.
  The selected transform supplies the user's parameters and produces distinct
  valid estimates. True one-of behavior remains a follow-up after verifying
  that QDK supports a lone transform.
