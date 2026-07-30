# Route A spike: QDK JS/WASM npm package

Date: 2026-07-12  
Decision: **not viable for the Team 3 engine contract**

## Executive result

The npm candidate is **`qsharp-lang`**, not `qsharp`. Its Q# compiler exposes a `getEstimates(program, expression, paramsJson)` method backed by the QDK WASM module. Version 1.29.1 produced real resource estimates entirely inside Node for Q# and OpenQASM, including a 12-point legacy Pareto frontier. However, this is the **legacy resource-estimator API and model**, not the current composable `qdk.qre` estimator required by the contract. It does not expose the named Three-Aux, Round-Based, Litinski19, or Lattice Surgery models/transforms, and it does not accept QIR as estimator input. The current Microsoft documentation exposes those models through the Python `qdk.qre` module and explicitly recommends that module over the estimator in the QDK extension.

A follow-up run against an isolated, exact install of **Python `qdk[qre]==1.29.1`** confirms that Route B does expose and execute those missing capabilities. It produced real estimates with Three-Aux, Round-Based, Litinski19, chained PSSPC + Lattice Surgery transforms, QIR input, and a four-row Pareto frontier under `max_error=0.01`. Route B can populate all six required contract fields, but the Python QRE does **not** natively expose eight of the 37 optional appendix fields. Details and the PM questions are recorded below.

## Package and installation

| Item | Finding |
|---|---|
| Correct npm name | `qsharp-lang` (`qsharp` is not Microsoft's current QDK language/WASM package) |
| Evaluated version | 1.29.1, matching the team's pinned QDK version and the locally installed official `quantum.qsharp-lang-vscode-1.29.1` extension |
| Node tested | v22.15.1 |
| WASM size | 5,095,331 bytes (4.86 MiB) |
| Runnable fallback payload | 5,166,283 bytes (4.93 MiB): WASM plus the bundled compiler/worker glue |
| Scratch spike size after samples | 5.38 MiB |
| npm install result | Not completed in this environment. The shell had npm offline mode plus a dead proxy; after overriding both, direct registry/CDN access still timed out. Therefore the registry's `dist.unpackedSize`, tarball size, and a generated lockfile are **not claimed** here. |

`package.json` records the intended dependency as `qsharp-lang@1.29.1`. To avoid turning an infrastructure failure into a product conclusion, the runtime probes use the version-matched compiler bundle and WASM from the locally installed official QDK extension. The copied compiler bundle is generated from the npm package source; the only spike modification is exporting its already-bundled `Compiler`, WASM initializer, and worker adapter.

Package identity and API were cross-checked against the [official QDK npm package manifest](https://github.com/microsoft/qdk/blob/main/source/npm/qsharp/package.json), the [official compiler source](https://github.com/microsoft/qdk/blob/main/source/npm/qsharp/src/compiler/compiler.ts), and the [npm package mirror](https://socket.dev/npm/package/qsharp-lang). The official source manifest names the package `qsharp-lang`; the compiler interface exposes `getEstimates`, while `ProgramConfig.projectType` only routes source projects through the compiler.

## Feature coverage

Status is against the requested **current contract surface**, not merely whether the legacy estimator has a roughly analogous concept.

| Required feature | Status | Evidence |
|---|---|---|
| GateBased + `surface_code` | **Supported (legacy model)** | A real run with `qubit_gate_ns_e4`, `surface_code`, and error budget 0.01 succeeded: 4,130 physical qubits and 320,000 ns runtime. |
| Majorana + Three-Aux | **Partial** | Legacy Majorana (`qubit_maj_ns_e6`) succeeds, but only with the old `surface_code`/`floquet_code` QEC parameter model. The named `ThreeAux` model is not exposed. |
| Round-Based factory | **Partial** | The legacy estimator internally searches up to three distillation rounds and reports round/unit details, but it has no selectable `RoundBasedFactory` object or ISA query. |
| Litinski19 factory | **Missing** | No named Litinski19 factory or factory-selection API is exported. Passing current model-shaped parameters fails parsing. |
| PSSPC trace transform | **Partial** | Legacy output explicitly says it schedules using PSSPC, but PSSPC is an internal fixed assumption, not an exposed/selectable trace transform. |
| Lattice Surgery trace transform | **Missing** | No named/selectable Lattice Surgery trace transform is exposed by `getEstimates`. |
| Maximum-error cap | **Supported with legacy semantics** | `errorBudget: 0.01` is honored as the total allowed failure probability. The current `max_error`/ISA exploration API is absent. |
| Multi-row Pareto frontier | **Supported, schema mismatch** | `estimateType: "frontier"` produced 12 Pareto points. Each point has 43 legacy formatted fields plus nested structures, rather than the contract's approximately 37-field row shape. |
| Full current architecture/QEC/factory composition | **Missing** | Passing `architecture: Majorana`, `qecScheme: ThreeAux`, `factory: Litinski19Factory`, trace transform names, and `maxError` returns `Qsc.Estimates.IOError.CannotParseJSON` (`missing field errorCorrectionThreshold`). |

Microsoft's current QRE docs list `ThreeAux`, `RoundBasedFactory`, and `Litinski19Factory` as composable models in `qdk.qre`, and show the ISA query syntax in Python ([error-correction models](https://learn.microsoft.com/en-us/azure/quantum/qre-build-error-correction-models)). The same docs warn that the estimator in the QDK extension will be deprecated and direct users to `qdk.qre`. The current architecture docs similarly expose `GateBased` and `Majorana` as Python models ([architecture models](https://learn.microsoft.com/en-us/azure/quantum/qre-build-architecture-models)).

## Route B cross-check: `qdk[qre]==1.29.1`

This follow-up was run independently after the Route A spike so the decision memo does not assume that "available in current Python docs" means "available in the exact pinned package." The package was installed into `spikes/route-a/.python-venv/`; no production engine code, teammate venv, or existing Python setup was changed. Both `qdk` and its `qsharp` dependency self-reported version **1.29.1**. The probe ran on Python 3.11.13; this verifies the pinned package API and engine behavior, not the separate Python 3.13 packaging choice.

The complete machine-readable evidence is [output-samples/python-route-b-report.json](output-samples/python-route-b-report.json), generated by [python-route-b-probe.py](python-route-b-probe.py).

| Required Python capability | Result from a real 1.29.1 run |
|---|---|
| GateBased + Surface Code | **Supported and executed.** `GateBased(...)` + `SurfaceCode.q()` produced real frontier rows. |
| Majorana + Three-Aux | **Supported and executed.** A Majorana/Three-Aux/Round-Based run returned one row; the QEC provenance node identifies `ThreeAux`, distance 3, and 12,000 ns code-cycle time. |
| Round-Based factory | **Supported and executed.** The tight-cap run used `RoundBasedFactory` and reports a T-state factory with six copies, 85 runs, 500 states, and error rate `2.13035e-7` at its first frontier point. |
| Litinski19 factory | **Supported and executed.** `SurfaceCode.q() * Litinski19Factory.q()` returned a real row. |
| PSSPC | **Supported and executed.** `PSSPC.q(num_ts_per_rotation=20, ccx_magic_states=False)` was applied in the successful runs and `NUM_TS_PER_ROTATION=20` appears in row properties. |
| Lattice Surgery | **Supported and executed.** `LatticeSurgery.q(slow_down_factor=1.0)` was applied after PSSPC in every successful feature run. |
| QIR input | **Supported and executed.** OpenQASM was compiled to a 76,254-character textual QIR module, passed to `QIRApplication(input=...)`, and estimated successfully. |
| Maximum-error cap | **Supported and enforced.** `estimate(..., max_error=0.01)` returned four rows, all below the cap; their errors range from about `1.065e-4` to `2.876e-4`. |
| Multi-row Pareto frontier | **Supported.** The same cap-constrained run returned four non-dominated rows, from 8,772 qubits / 1,936,550 ns through 14,308 qubits / 880,250 ns. |

### Important transform semantics

In `qdk.qre` 1.29.1, PSSPC and Lattice Surgery are **sequential stages**, not interchangeable choices. The package's default trace query is equivalent to:

```python
PSSPC.q() * LatticeSurgery.q()
```

PSSPC converts rotations and optional CCX operations into magic-state-based operations; Lattice Surgery then converts the trace into the form consumed by the logical ISA. In the probe, PSSPC alone yielded no estimable rows for the Round-Based configurations, while the chained pipeline produced the expected rows and factories. This conflicts with the frozen product configuration, which presents `psspc` and `lattice_surgery` as mutually exclusive trace-transform values. Route B has the capabilities, but `configToInvocation` cannot honestly map that product choice one-to-one without a PM decision.

### Contract frontier mapping

The Python return value is an `EstimationTable` of `EstimationTableEntry` objects, not a ready-made `RunResult.frontier` row. An adapter is required, but **all six contract-required fields are available or deterministically derivable**:

| Required contract field | Python 1.29.1 source |
|---|---|
| `physicalQubits` | `entry.qubits` |
| `runtime` | `entry.runtime` in ns |
| `totalError` | `entry.error` |
| `factories` | `entry.factories`; each `FactoryResult` exposes `copies`, `runs`, `states`, and `error_rate` |
| `codeDistance` | `DISTANCE` on the SurfaceCode/ThreeAux instruction provenance node |
| `logicalCycleTime` | `DISTANCE * CODE_CYCLE_TIME` from that same QEC provenance node |

The appendix lists **37 possible fields**, not 37 fields required on every row. Version 1.29.1 has native core values/property keys for **29 of 37**. These eight have no native QRE value/property key:

- `source`
- `BLOCK_SIZE`
- `BASE_SYSTEM_COST`
- `SHOT_COST`
- `COST_PER_QUBIT`
- `COST_PER_HOUR`
- `COST_PER_QUBIT_PER_HOUR`
- `DATA_QUBIT_SPACING`

`source` can be populated safely from the engine invocation (`qsharp`, `openqasm`, or `qir`), so it need not be lost. The other seven are neither QRE outputs nor derivable from the current contract inputs. They should be omitted from `frontier[].additional` unless the PMs add a source of truth; `raw` should continue to preserve the full unmodified QRE result.

### Stakeholder questions for the decision memo

1. **Transform semantics:** Should the UI's PSSPC/Lattice Surgery choice be changed to represent the real sequential `PSSPC -> LatticeSurgery` pipeline (with the choice controlling PSSPC knobs/presets), or is a genuinely alternative transform behavior intended? The exact 1.29.1 engine does not support the frozen one-of mapping as written.
2. **Optional appendix gaps:** Is it acceptable that the seven non-derivable fields listed above remain absent unless future architecture/cost inputs are added? This is contract-valid because only the six defaults are mandatory, but the memo should not imply that Python emits all 37.
3. **Majorana operation time:** `Majorana` 1.29.1 accepts only `error_rate`; its operation time is fixed internally. Should the current `architecture.operationTime` input be ignored/rejected for Majorana, or should the contract be revised? This is separate from model availability but affects whether Route B can honor every input.

## Real run and output shape

Yes, the WASM package's legacy estimator ran for real in-process from Node.

- Default Q# run: 77,330 physical qubits, 704,000 ns runtime.
- Gate/surface/error-budget run: 4,130 physical qubits, 320,000 ns runtime.
- Legacy Majorana run: 17,940 physical qubits, 144,000 ns runtime.
- Pareto run: 12 points, ranging from 35,378 qubits at 89,600,000 ns to 13,818 qubits at 388,278,800 ns.

The verbatim Pareto result is [output-samples/qsharp-pareto-frontier.json](output-samples/qsharp-pareto-frontier.json). Other verbatim runs and the consolidated probe report are in [output-samples/](output-samples/).

The legacy frontier itself is genuine. Microsoft documents `estimateType: "frontier"` as producing multiple qubit/runtime tradeoffs ([legacy target parameters](https://learn.microsoft.com/en-us/azure/quantum/overview-resources-estimator)). This does not establish compatibility with the new `qdk.qre` result schema or the dashboard contract.

## Input formats

| Input | Status in npm/WASM estimator | Probe result |
|---|---|---|
| Q# | **Supported** | Direct Q# source plus expression estimated successfully. |
| OpenQASM 3 | **Supported** | A two-qubit OpenQASM program estimated successfully: 2,882 physical qubits and 28,000 ns runtime. |
| QIR | **Missing as estimator input** | A QIR/LLVM source passed with `projectType: "qir"` failed with `syntax error`; the exported compiler configuration has no QIR input project type. The compiler can **emit** QIR via `getQir`, which is a different capability. |

The broader current QRE supports Q#, OpenQASM, and QIR, but Microsoft documents that surface as part of the current Python QRE pipeline ([QRE overview](https://learn.microsoft.com/en-us/azure/quantum/intro-to-resource-estimation)). It is not exposed by the npm `getEstimates` entry point tested here.

## Event-loop blocking and worker isolation

The direct API is async in TypeScript but the WASM computation occurs synchronously on the calling thread. A heavy estimate took about 1,151 ms and delayed a `setTimeout(..., 0)` by the same 1,151 ms, demonstrating main-thread event-loop blocking.

Worker isolation is feasible and was demonstrated, not just inferred. The npm package includes a compiler worker protocol and a Node `worker_threads` adapter. Running the same heavy estimate in a worker took about 1,633 ms wall-clock while a 10 ms timer on the main thread fired 96 times. See [output-samples/worker-report.json](output-samples/worker-report.json). Electron would therefore need a worker for nontrivial estimates even though the engine remains in-process at the application level.

## Reproduction

From this directory:

```powershell
# One-time isolated Python setup for the Route B cross-check:
python -m venv .python-venv
python -m pip --python .\.python-venv\Scripts\python.exe install "qdk[qre]==1.29.1"

npm run probe
npm run probe:worker
npm run probe:python
```

The scripts currently use `vendor-extension-fallback/` because npm registry access was unavailable during the spike. With registry access, the next packaging-only check would be `npm install` followed by replacing the fallback import with the public `qsharp-lang` exports; it would not change the missing current-QRE model surface established by the official typings/source and parameter parser.

## Verdict

**Route A is not viable for the Team 3 contract.** The QDK npm/WASM package is capable enough to produce genuine legacy single-point and Pareto resource estimates in Node, supports Q# and OpenQASM, and can be isolated in a worker thread. Its clean in-process packaging is therefore technically real. But it exposes the older target-parameter estimator, not the current composable QRE that owns Three-Aux, Round-Based and Litinski19 factories, the PSSPC-to-Lattice-Surgery trace pipeline, QIR application input, and the current frontier model. Bridging those gaps would mean implementing or binding substantial new QRE surface rather than integrating an existing npm API.

**Route B is technically viable for the six-field required `RunResult` frontier and all requested QRE model families, but it is not "contract-complete with no questions."** The adapter must extract QEC properties from provenance nodes, the product's transform choice does not match QDK's sequential pipeline, seven optional appendix fields have no QRE or config source, and Majorana operation time is not configurable in 1.29.1. Those three items belong explicitly in the memo's PM-question section.
