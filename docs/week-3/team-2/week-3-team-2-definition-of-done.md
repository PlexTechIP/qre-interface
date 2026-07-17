# Week 3 — Team 2 (Melody + Rishabh) — Definition of Done: Run Persistence + Rerun

The bar for Wednesday Jul 22 EOD.

## Functional

- [ ] A **SQLite `RunStore`** lives in `app/src/main/` and implements the
      committed API — `save`, `list`, `get`, `delete`, `query` — the exact
      interface Team 1 codes against
- [ ] **Every run saves as an immutable `RunRecord`** (assembled via the
      provided `makeRunRecord`): full `RunConfig` + full `RunResult` (verbatim
      `raw` included) + `savedAt`, keyed by `config.id`; **no update path exists**
      (write-once; Rerun makes a new record)
- [ ] **Query/filter API** returns records filtered by run-name search,
      application, physical architecture, error correction code, magic state
      factory, and QRE version — combinable; `list`/`query` newest-first
- [ ] The **provided `reconstructConfig(record, stamp)`** is wired into the load
      path (not re-implemented): `get(id)` → reconstruct → a `RunConfig` with a
      fresh `id`/`createdAt`, the rest carried from the record, coupling/
      availability rules intact
- [ ] A failed run record and a sparse/one-row run record persist and return
      **intact**, like any multi-row success

## Validation & correctness

- [ ] **Round-trip fidelity:** `get` after `save` equals what went in, `raw`
      and all — proven in the harness against the committed records + at least
      one real capture
- [ ] **Immutability** is structurally enforced (no mutate/update path) and
      asserted: re-saving produces a new record, never edits an existing one
- [ ] The reconstructed config **validates against
      `contracts/runconfig.schema.json`** and is re-runnable through
      `EstimatorService` for every committed record (the contract test covers
      this; extend it to any real captures you add)
- [ ] Query correctness tested: each filter selects the right records; combined
      filters intersect; newest-first ordering holds — matching the provided
      `queryRunRecords`/`matchesRunFilter` semantics
- [ ] Sequential saves don't interfere; the DB file is created/opened cleanly on
      first run; no hardcoded absolute paths
- [ ] **Carry-over from week 2:** the two forward-compat tests (unknown
      `error.code`, unknown result field still render) and the reverse
      selection-sync assertion (graph point → table row) are added to the
      week-2 Results suite

## Quality

- [ ] Strict TypeScript; record/API types imported from `contracts/types.ts`
      (copied verbatim until the scaffold wires them), never re-declared
- [ ] Persistence is **main-process only** — no SQLite access from the renderer;
      the store is reached through the typed `RunStore` boundary
- [ ] Uses `node:sqlite` (or PM-approved `better-sqlite3` fallback if its API
      blocked Part 2) — the choice and reason noted in review notes
- [ ] Harness runnable by anyone via a documented command; README covers the
      schema, the API, immutability guarantee, and how to run it

## Process

- [ ] Team branch `week-3/team-2` created Day 0 (**Thu Jul 16**) off the
      **updated `main`**; all feature PRs target it
- [ ] Team branch merged to `main` via reviewed PR by **Wed Jul 22 EOD**
- [ ] Checklist file updated with boxes checked
- [ ] **Post-swap smoke check** recorded: after the real engine lands behind
      IPC, the week-2 Results Area still renders real results unregressed
- [ ] Acceptance walkthrough prepared: save → filter by each field → get
      byte-faithful → reconstruct config (validates) → delete → immutability
      demonstrated

## Explicitly NOT required

- Any UI, including a debug panel (harness is CLI/tests) · the Run History UI,
  list, or filter controls (Team 1) · wiring the save-after-run trigger, the
  store swap, or the live Rerun-into-the-form navigation (week-4 integration) ·
  standing up the Electron main process / IPC (Team 3) · the real Markdown
  exporter (Part 3, week 6) · the multi-run comparison workspace / bar charts
  (Part 2, week 5) · cross-record migration/versioning beyond a first schema
  (later) · encryption/multi-user concerns (out of scope — local single-user app)
