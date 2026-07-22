# Week 3 — Team 2 (Melody + Rishabh) — Checklist: Run Persistence + Rerun

**Due: Tuesday Jul 21 EOD** — Day 0 is Thu Jul 16; Tue Jul 21 is a checkpoint
meeting.
Read first: `../week-3-overview.md`, `week-3-team-2-technical-brief.md`,
`docs/data-contracts.md`, `docs/tech-stack.md` §Persistence. Check items off as
you go (edit + commit).

This week rotates you from the frontend (Results Area) into the **backend**
(persistence). No UI — your surface is a `RunStore` API + a test/CLI harness.

## A. Day 0

- [ ] **Create your team branch** `week-3/team-2` off the **updated `main`**
      (after the week-2 integration merge) — feature branches PR into it; it
      merges to `main` by **Tue Jul 21 EOD**
      (`docs/engineering-workflow.md`). Do **not** branch off a week-2 branch
- [ ] Attend the Tuesday meeting; confirm the week-3 assignment (persistence +
      Rerun, backend) and the deadline
- [ ] Read the **run-record contract** (already committed on `main`) — the
      `RunRecord` shape, the `RunStore` API you implement, the **provided**
      `reconstructConfig` Rerun helper, and the reference **`InMemoryRunStore`**
      (`app/src/shared/runStore.ts`) whose behaviour your SQLite store must
      reproduce. Import the types from `contracts/`, never re-declare them;
      propose any missing field to the PMs (channel), don't add it locally
- [ ] Confirm the persistence tech: **`node:sqlite`** (built into Node
      `24.18.0`, avoids Electron native-module rebuilds) — flag to PMs in the
      channel **today** if its API blocks you, so the tabled `better-sqlite3`
      fallback can be approved (`docs/tech-stack.md`)

## B. The persistence store

- [ ] Stand up the SQLite store in **`app/src/main/`** (main-process only; the
      renderer never touches SQLite — `docs/tech-stack.md` §Architecture)
- [ ] Schema/migration for run records: a stable table keyed by record id,
      storing the full `RunConfig` + full `RunResult` (+ `savedAt`) — with the
      filterable values (application, architecture, QEC code, factory, QRE
      version, name, date) denormalized into indexed columns for query speed
- [ ] **`RunStore implements` the committed API:** `save`, `list`, `get`,
      `delete`, `query` — the exact interface Team 1 codes against (see technical
      brief §The API)

## C. Immutable records + query API

- [ ] **Save every run as an immutable record:** assemble a `RunRecord` from
      `(RunConfig, RunResult)` + runtime `qreVersion` + timestamps; **no update
      path exists** — records are write-once, Rerun creates a new record (a
      stated non-negotiable, `docs/tech-stack.md`)
- [ ] Store the **complete, verbatim `RunResult`** including the full `raw`
      blob — persistence is full-fidelity; nothing QRE emitted is dropped on the
      way to disk (reproducibility is an SOW objective)
- [ ] **Query/filter API** over saved records: filter by run-name search,
      application, physical architecture, error correction code, magic state
      factory, and QRE version — combinable; `list` returns newest-first;
      round-trips a record byte-faithfully (`get` after `save` equals what went
      in)
- [ ] Handles a **failed** run record and a **sparse/one-row** run record the
      same as a multi-row success (persist and return them intact)

## D. Rerun reconstruction

- [ ] **Reuse the provided `reconstructConfig(record, stamp)`**
      (`contracts/types.ts`) — the canonical, already-unit-tested Rerun helper
      (fresh `id`/`createdAt` from the stamp, the rest of the config carried from
      the record, coupling/availability rules preserved). Do **not** re-implement
      it; import it where the load path needs it (see technical brief §Rerun)
- [ ] Confirm it fits your load path end-to-end: `get(id)` a saved record →
      `reconstructConfig` → the reconstructed config **validates against
      `contracts/runconfig.schema.json`** and is re-runnable through
      `EstimatorService` (the contract test already proves this for every
      committed record — extend it to any real captures you add)
- [ ] The pre-fill target is a **`RunConfig`** (the frozen shape), not Team 1's
      `FormState`; hydrating the live form from it is Team 1's week-4 work —
      coordinate in the channel if the seam needs anything more

## E. Robustness, cleanup + acceptance prep

- [ ] **Harness** (CLI or test suite, runnable by anyone via a documented
      command): save → query/filter → get → reconstruct → delete, proven against
      the committed records + at least one real capture; immutability asserted
      (no update path; re-save is a new record)
- [ ] Sequential saves don't interfere; the store opens/creates its DB file
      cleanly on first run; no hardcoded absolute paths
- [ ] **Carry-over cleanup from week 2** (does not block, close it out before
      fully rotating off Results): add the two **forward-compat tests** the DoD
      named (unknown `error.code`, unknown result field still render) and the
      **reverse selection-sync assertion** (graph point → table row)
- [ ] **Verify your week-2 surface still works after the swap** — once the real
      engine is behind IPC, confirm the Results Area still renders real results
      (a short smoke check; report regressions in the channel)
- [ ] Walk through `week-3-team-2-definition-of-done.md` — every box checkable
- [ ] Acceptance walkthrough: harness run live (save a run → filter by each
      field → get it back byte-faithful → reconstruct its config → delete),
      immutability demonstrated, Rerun reconstruction shown validating
- [ ] PR(s) merged to `main` by **Tue Jul 21 EOD** — final acceptance from
      `main`, not a branch
