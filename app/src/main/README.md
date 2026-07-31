# `app/src/main/` — Run persistence + Rerun (SOW Part 2)

The main-process, SQLite-backed implementation of the committed `RunStore`
boundary (`app/src/shared/types.ts`). No UI
lives here — this is the store, the Rerun load path, and a runnable harness.
See `docs/week-3/team-2/week-3-team-2-technical-brief.md` for the original
brief and `docs/architecture.md` for the current end-to-end architecture.

## Files

| File | What it is |
|---|---|
| `sqliteRunStore.ts` | `SqliteRunStore implements RunStore` — `save`/`list`/`get`/`delete`/`query` over `node:sqlite` |
| `sqliteRunStore.test.ts` | Schema/migration, round-trip fidelity, immutability, and query-parity tests against `InMemoryRunStore` |
| `rerun.ts` | `loadForRerun(store, id, stamp)` — the Rerun load path: `get(id)` → the committed `reconstructConfig` |
| `rerun.test.ts` | Proves the load path end to end, incl. one run captured through a fake estimator (`shared/testing`) |
| `dataDir.ts` | `resolveDefaultDatabasePath()` — computes the DB file location at runtime; never a hardcoded absolute path |
| `harness.ts` | The runnable proof described below |

The Electron main process also wires the QRE engine and the IPC surfaces that
the renderer consumes. `main.ts` registers `estimator:run` against `QreEngine`,
constructs the SQLite store after `app.whenReady()`, and registers store
handlers. `preload.ts` exposes only `window.estimator`, `window.store`, and
`window.files`; renderer code does not receive `ipcRenderer`, SQLite, Node
globals, or direct engine access.

## Schema

Each row stores the complete `RunRecord` as JSON (`record_json`) for
full-fidelity round trips — nothing is reshaped or dropped, `raw` included.
Alongside it, the columns the History filters need are denormalized and
indexed for query speed; they are a storage detail, not a change to the
record shape, defined in `app/src/shared/types.ts`:

```
run_records (
  id                   TEXT PRIMARY KEY,  -- === config.id === result.runId
  schema_version       TEXT,
  record_json          TEXT,              -- the full RunRecord, verbatim
  name                 TEXT,              -- config.name (indexed, case-insensitive)
  application          TEXT,              -- applicationKey(config) (indexed)
  architecture         TEXT,              -- config.architecture.type (indexed)
  qec_code             TEXT,              -- config.qecCode (indexed)
  magic_state_factory  TEXT,              -- config.magicStateFactory (indexed)
  qre_version          TEXT,              -- result.qreVersion — authoritative (indexed)
  created_at           TEXT,              -- config.createdAt — launch time (indexed, sort key)
  saved_at             TEXT               -- tie-break for equal created_at (indexed, sort key)
)
```

`PRAGMA user_version` tracks the schema version so reopening an existing
database file is safe and migration-aware.

## The API

```ts
interface RunStore {
  save(record: RunRecord): Promise<void>;   // write-once; rejects a duplicate id
  list(): Promise<RunRecord[]>;             // newest-first
  get(id: string): Promise<RunRecord | null>;
  delete(id: string): Promise<void>;
  query(filter: RunFilter): Promise<RunRecord[]>;
}
```

`RunFilter` fields — `nameSearch` (substring, case-insensitive, trimmed),
`application`, `architecture`, `qecCode`, `magicStateFactory`, `qreVersion` —
are combinable (intersection); `query`/`list` always return newest-first.
SQLite narrows the indexed exact-match fields; `queryRunRecords` (the
committed helper) is kept as the final authority for name-search and
ordering, so this store's observable behavior matches `InMemoryRunStore`.

## Immutability guarantee

There is **no update path** — it isn't expressible through this API. `save`
rejects a duplicate `id` with `RunRecordExistsError` instead of overwriting.
Rerunning a saved run means reconstructing a **new** config (`rerun.ts`),
running it, and saving the result as a **new** record; the original is never
touched. `get`/`list`/`query` all hand back parsed copies, so mutating a
returned record cannot corrupt stored state.

## Rerun

`loadForRerun(store, id, stamp)` is the load path: it fetches the saved
record and hands it to the provided, already-unit-tested `reconstructConfig`
helper, which stamps a fresh `id`/`createdAt` and carries everything else
forward (coupling/availability rules intact). The result is a `RunConfig` —
the frozen shape — not Team 1's `FormState`; hydrating the live form from it
is week-4 integration work.

## Running the harness

```
npm run harness
```

Runs a self-contained, documented proof of the full surface: `save` (every
committed record plus one run captured live through `MockEngine`, not a
static fixture) → `list`/`query` (every History filter field) → `get`
(byte-faithful, `raw` included) → `reconstruct` (the Rerun load path) →
immutability (a duplicate save is rejected; Rerun saves as a new record,
original untouched) → `delete`. Each step prints its result; the script
exits non-zero if any check fails.

By default it runs against a throwaway temp directory so repeat runs never
collide with leftover state (records are write-once, so re-saving the same
committed fixtures into a persisted file would fail on the second run). Set
`QRE_DB_PATH` to point it at a real file instead — e.g. the location
`resolveDefaultDatabasePath()` resolves to — and that file is left in place
afterwards so you can inspect it with the `sqlite3` CLI or reopen it with
another `SqliteRunStore`.

For clean-machine setup, Python venv provisioning, and common local failures,
see `docs/setup-and-troubleshooting.md`.
