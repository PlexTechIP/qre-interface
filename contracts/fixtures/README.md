# Contract Fixtures

Frozen inputs/outputs for week 2+. Teams 1 and 2 build against these; Team 3's
real engine must reproduce the same shapes, proven by the conformance harness.
Contract reference: `docs/data-contracts.md` and the root schemas in
`contracts/`.

## The pairs — config in, result out

Each `runconfig.*` fixture is paired with a `runresult.*` fixture
(`runId` = config `id`). The conformance harness runs **all four** configs;
expected outcomes:

| RunConfig fixture | → RunResult fixture | Expected | What it exercises |
|---|---|---|---|
| `runconfig.benchmark.json` | `runresult.success.json` | `succeeded` | Multi-row Pareto frontier: Quantum Dynamics, GateBased / Surface Code / Round-Based / PSSPC |
| `runconfig.large.json` | `runresult.success-large.json` | `succeeded` | Formatting stress: Shor's Factoring, Litinski19, Lattice Surgery, tens of millions of qubits and year-scale runtime |
| `runconfig.sparse.json` | `runresult.success-sparse.json` | `succeeded` | Majorana path: Three-Aux QEC, Round-Based only, one-row frontier, zero factory qubits |
| `runconfig.failing.json` | `runresult.failed.json` | `failed` | A schema-valid config the engine cannot satisfy: tight `maxError` maps to `ESTIMATION_FAILED`, `frontier: null`, diagnostics in `raw` |

## Fixture Notes

The committed fixtures are contract fixtures sized to exercise the UI and
engine conformance harness immediately. Team 3 should keep the same contract
shape when wiring the real QRE adapter and preserve complete raw engine output
for each run.

The fixture set intentionally covers:

- a multi-row frontier,
- a single-row frontier,
- a formatting-stress result,
- a real failure,
- at least one GateBased and one Majorana configuration,
- at least one PSSPC and one Lattice Surgery configuration.

## Notes for consumers

- `frontier[].*.value` is always a number for the six default numeric fields.
  `factories.value` is an array of `{ stateType, copies }`.
- Optional fields live under `frontier[].additional` using the same
  `{ value, unit, display }` envelope. Numeric optional fields should use
  numeric values; non-numeric appendix fields may use strings, booleans,
  arrays, or objects.
- **Never compute from `display`.** Math, sorting, plotting, and comparisons
  use `value` + `unit`.
- A frontier can contain one row. A value can legitimately be `0`. Missing
  optional fields simply are not offered by the filter.
- `raw` is schema-less by design. In real runs it must be the complete,
  unmodified engine output.

Missing a case? Request a fixture addition via the contract-change process —
don't invent one locally.
