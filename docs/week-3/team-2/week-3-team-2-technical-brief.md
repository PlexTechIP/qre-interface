# Week 3 — Team 2 — Technical Brief: Run Persistence + Rerun

Your track: the **persistence layer** — SOW Part 2 (Run History, Traceability).
You save every run as an immutable record, expose a query/filter/load API over
saved records, and provide the Rerun reconstruction path. **No UI.** This week
rotates you from the Results Area (frontend) into the backend; your "interface"
is a `RunStore` API + a harness, and your customer is Team 1's History UI (this
week, against a mock; next week, against your real store).

> Runs are **immutable**: you never edit a run, you **rerun** it. Every saved
> run carries the full configuration, the full result, the QRE version, and
> timestamps, and stays byte-faithful so any run can be re-derived later
> (`docs/project-overview.md` §What "good" looks like; `docs/tech-stack.md`
> §Non-negotiables). Immutability and full-fidelity `raw` are what make history
> trustworthy and comparison meaningful.

## The record you own (PM-owned shape — you implement, you don't freeze it)

A **`RunRecord`** is an immutable saved run, and it is deliberately minimal:
`{ schemaVersion, id, config, result, savedAt }`, where
`id === config.id === result.runId`. It embeds the complete `RunConfig` and
`RunResult` (verbatim `raw` and all); the engine version and the run's launch
time are **not** duplicated — they're read from `result.qreVersion` and
`config.createdAt`. The type is **already committed in `contracts/types.ts`**
(with `contracts/runrecord.schema.json`) — **import it, never re-declare it**; if
you need a value the record doesn't derive, propose it to the PMs (channel),
don't add it locally. You own how records are *stored*; the SQL columns you index
(application, architecture, QRE version, name, date, …) are your denormalization
of those derived values — a storage detail, not a change to the record shape.
Team 1 is the *consumer* of the read/query side.

## The API (the contract that makes the store swap free)

Team 1 builds their History UI against the reference **`InMemoryRunStore`**
(`app/src/shared/runStore.ts`, seeded with `MOCK_RUN_RECORDS`) this week; you
build the **real SQLite `RunStore` behind the same interface**, reproducing that
store's observable behaviour (write-once immutability, newest-first ordering,
copy-on-read, and the `queryRunRecords`/`matchesRunFilter` filter semantics).
Same play as week 2's MockEngine ↔ QreEngine: if both honor the committed API,
the week-4 swap (in-memory out, SQLite in) is wiring, not rework.

```ts
// already committed in contracts/types.ts (Part 2 additions)
interface RunStore {
  save(record: RunRecord): Promise<void>;   // write-once; your write path
  list(): Promise<RunRecord[]>;             // newest-first
  get(id: string): Promise<RunRecord | null>;
  delete(id: string): Promise<void>;
  query(filter: RunFilter): Promise<RunRecord[]>;
}
```

## Persistence tech

- **`node:sqlite`** — the SQLite API built into Node `24.18.0` (Electron's
  embedded Node line). Prefer it: it avoids Electron native-module rebuilds
  (`docs/tech-stack.md` §Persistence). If its release-candidate API blocks you,
  **flag PMs early** — the tabled fallback is `better-sqlite3@12.11.1`, which
  needs PM sign-off before you adopt it.
- **Main-process only.** The store lives in `app/src/main/`. The renderer never
  opens SQLite directly — it crosses the typed boundary (this week the mock
  `RunStore`; next week your store via the same API, reached over IPC that
  Team 3 is standing up). No hardcoded absolute paths; the DB file resolves from
  the app's data dir.

## Storing runs — full fidelity, write-once

- **Assemble the record** with the provided `makeRunRecord(config, result,
  savedAt)` (`contracts/types.ts`) — it keys the record by `config.id` and
  enforces `result.runId === config.id`. The result-side `qreVersion` is the
  authoritative reproducibility anchor; the record does not copy it.
- **Persist the complete `RunResult`, `raw` and all.** `raw` is sacred
  (`docs/data-contracts.md` §Contract Rules) — Team 1's detail view, Part 3's
  export, and reproducibility all depend on verbatim fidelity through the store.
  A `get` after `save` must equal what went in.
- **Write-once.** There is **no update path**. A record is never mutated after
  it's saved; iterating on a run means Rerun → a *new* record. Design the schema
  and API so mutation isn't even expressible.
- **The failure and sparse cases persist like any other.** A failed run
  (`status: "failed"`, `frontier: null`, populated `error`, possibly
  `raw: null`) and a sparse/one-row success round-trip intact — don't special-
  case them out.

## Query & filter — the History UI's data source

The query API backs Team 1's filters; the SOW fixes the filter set:

| Filter | Source field |
|---|---|
| Run name (search) | `name` (substring, case-insensitive) |
| Application | `config.application` (benchmark id or uploaded) |
| Physical architecture | `config.architecture.type` |
| Error correction code | `config.qecCode` |
| Magic state factory | `config.magicStateFactory` |
| QRE version | result-side `qreVersion` |

Filters are combinable (they intersect); `list`/`query` return **newest-first**;
index the queried columns so history stays responsive as runs accumulate.

## Rerun — the reconstruction path (provided; wire it into your load path)

Rerun is "load a saved record → reconstruct a config that pre-fills the Run
Configuration form." The reconstruction helper is **already provided and
unit-tested** — reuse it, don't re-implement it:

```ts
// contracts/types.ts — PROVIDED
function reconstructConfig(
  record: RunRecord,
  stamp: { id: string; createdAt: string },  // fresh id + createdAt for the new run
): RunConfig;
```

- It carries the record's configuration into a **new** run (the stamp supplies a
  fresh `id`/`createdAt`; Rerun makes a new run, never edits the old one),
  preserves everything else, and keeps the coupling/availability rules intact
  (arch→QEC, Litinski19 availability, transform sub-fields) so the reconstructed
  config is legal and re-runnable.
- The reconstructed config **validates against `contracts/runconfig.schema.json`**
  — it's the same shape Team 1's form emits via `toRunConfig` (the contract test
  proves this for every committed record).
- **The pre-fill target is a `RunConfig`** (the frozen shape), not Team 1's
  `FormState`. Your job is to make sure it drops cleanly out of your load path
  (`get(id)` → `reconstructConfig`); hydrating the *live* form from it and
  navigating there is **week-4 integration** and Team 1's form work — coordinate
  in the channel if the seam needs anything more.

## Boundaries — what is NOT yours this week

| Not yours | Whose |
|---|---|
| The Run History UI, list, filters UI, per-run action buttons | Team 1 (they consume your read/query API + the Rerun seam) |
| Wiring the save-after-run trigger, the store swap, the live Rerun navigation | Week-4 integration |
| Standing up the Electron main process / IPC bridge | Team 3 (you place your store in `app/src/main/`; the renderer reaches it over the IPC Team 3 builds) |
| The real Markdown exporter | Part 3 (week 6) |
| The multi-run comparison workspace / bar charts | Part 2, week 5 |
| The `RunRecord`/`RunStore` schema + the estimation contract | PMs, via contract-change process — you *propose*, they arbitrate |

## Quality bar

Strict TS, no `any` at boundaries; record/API types imported from `contracts/`,
never re-declared; the SQLite store round-trips every committed record
byte-faithfully (including `raw`, the failed case, and the sparse case) and
reproduces `InMemoryRunStore`'s behaviour (write-once immutability, newest-first,
copy-on-read, the provided filter semantics); the provided `reconstructConfig` is
wired into the load path (not re-implemented); no hardcoded absolute paths; a
README documents the schema, the API, and how to run the harness.
