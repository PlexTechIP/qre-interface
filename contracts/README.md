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
| `runrecord.schema.json` | **(Part 2, added week 3)** Canonical JSON Schema for `RunRecord` — an immutable saved run. Embeds the `RunConfig` and `RunResult` schemas by `$ref` and adds the persistence identity + `savedAt`. Register all three schemas in one Ajv instance to resolve the refs |
| `types.ts` | Canonical TypeScript types + `EstimatorService` interface + the Team-1⇄Team-2 seam props (`ResultsAreaProps`) **+ the Part-2 run-record surface** (`RunRecord`, `RunStore`, `RunFilter`, `reconstructConfig`, `makeRunRecord`, `applicationKey`, `queryRunRecords`). Copy verbatim into your workspace until the shared scaffold wires it; never re-declare shapes |
| `benchmarks.json` | Canonical v1 starter benchmark list (five entries) plus supported upload formats |
| `fixtures/` | Config/result fixture pairs **and mock run records** — see `fixtures/README.md` for the tables |

## Part 2 — the run-record surface (added week 3)

The estimation boundary (`RunConfig`/`RunResult`/`EstimatorService`) is
unchanged. Part 2 adds a **new surface** for persistence, history, and rerun:

- **`RunRecord`** — an immutable saved run: `{ schemaVersion, id, config,
  result, savedAt }`, where `id === config.id === result.runId`. The record does
  not duplicate the run's launch time or engine version (those stay on
  `config.createdAt` and the authoritative `result.qreVersion`), so no copy can
  drift.
- **`RunStore`** — the persistence/query API Team 1's Run History UI consumes
  and Team 2's SQLite store implements: `save` (write-once — a duplicate id is
  rejected; records are immutable), `list`/`query` (newest-first), `get`,
  `delete`. `InMemoryRunStore` in `app/src/shared/runStore.ts` is the reference
  behaviour (the MockEngine of this boundary); the SQLite store must reproduce
  it. `queryRunRecords`/`matchesRunFilter` in `types.ts` single-source the
  filter/sort semantics.
- **`reconstructConfig(record, stamp)`** — the Rerun path: reconstructs a
  `RunConfig` (fresh `id`/`createdAt`, everything else carried) that pre-fills
  the form and is re-runnable through `EstimatorService`.

Mock run records for Team 1 live in `fixtures/runrecord.*.json` (exported typed
as `MOCK_RUN_RECORDS` from `app/src/shared/runRecordFixtures.ts`).

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
