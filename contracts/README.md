# contracts/ — The Frozen Data Contract

**This folder is the v1.0.0 contract surface.**
It is PM-owned: no team edits anything here in a feature branch. Field missing?
Fixture missing a case? Post in the channel tagging both PMs + affected teams;
a dedicated contract-change PR updates schema + fixtures + version together
(process: `docs/engineering-workflow.md`). Narrative reference:
`docs/data-contracts.md`.

## Contents

| File | What it is |
|---|---|
| `runconfig.schema.json` | Canonical JSON Schema for `RunConfig` (strict: seven-input shape, parameterized architectures, architecture-derived QEC, factory/transform rules, `maxError`) |
| `runresult.schema.json` | Canonical JSON Schema for `RunResult` (tolerant top-level output, `frontier` rows on success, status/error coupling) |
| `types.ts` | Canonical TypeScript types + `EstimatorService` interface + the Team-1⇄Team-2 seam props (`ResultsAreaProps`). Copy verbatim into your workspace until the shared scaffold wires it; never re-declare shapes |
| `benchmarks.json` | Canonical v1 starter benchmark list (five entries) plus supported upload formats |
| `fixtures/` | Config/result fixture pairs — see `fixtures/README.md` for the pairing table |

## Validation notes

- Schemas are **JSON Schema draft-07**; validate with Ajv + **ajv-formats**
  (`uuid`, `date-time` formats are load-bearing).
- `RunConfig` is validated strictly at the producer (Team 1's submit-level
  validation, the MockEngine, and the real engine all reject off-schema input).
- `RunResult` consumers must **tolerate unknown extra top-level fields**,
  unknown optional result fields in `frontier[].additional`, and unknown
  `error.code` strings. The canonical codes remain `INVALID_CONFIG`,
  `COMPILE_ERROR`, `ESTIMATION_FAILED`, `TIMEOUT`, `ENGINE_CRASH`.
- On success, `frontier` is an array with at least one row. Every row carries
  the six default fields: `physicalQubits`, `runtime`, `logicalCycleTime`,
  `factories`, `totalError`, and `codeDistance`.
- On failure, `frontier` is `null`, `error` is populated, and `raw` contains
  engine diagnostics when the engine produced any.

## Version facts

"QRE v3" is the estimator **generation**. The engine **package/API** still
self-reports its own version string, and `RunResult.qreVersion` is the
authoritative value for reproducibility. Fixture files use `qdk-qre-v1-fixture`
as a stable fixture version string; the real engine adapter replaces that with
the runtime-read package version.
