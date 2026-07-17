# Week 3 — Team 1 (Sun Min + Emma) — Checklist: Run History UI

**Due: Wednesday Jul 22 EOD** — Day 0 is Thu Jul 16; Tue Jul 21 is a checkpoint
meeting.
Read first: `../week-3-overview.md`, `week-3-team-1-technical-brief.md`,
`docs/project-overview.md` §The four main surfaces (Run History Area),
`docs/data-contracts.md`. Check items off as you go (edit + commit).

## A. Day 0

- [ ] **Create your team branch** `week-3/team-1` off the **updated `main`**
      (after the week-2 integration merge) — all your feature branches PR into
      it; it merges to `main` by **Wed Jul 22 EOD**
      (`docs/engineering-workflow.md`). Do **not** branch off a week-2 branch
- [ ] Attend the Tuesday meeting; confirm the week-3 assignment (History UI,
      frontend) and the deadline
- [ ] Read the **run-record contract** (already committed on `main`) end-to-end —
      the `RunRecord` shape, the `RunStore` query/persistence API, and the
      `reconstructConfig` Rerun helper in `contracts/types.ts`, plus the committed
      **mock run-record fixtures** (`contracts/fixtures/runrecord.*.json`,
      exported as `MOCK_RUN_RECORDS`). Import those types from `contracts/`
      (`app/src/shared/types.ts`), never re-declare them. Raise anything
      surprising in the channel **today**
- [ ] Confirm you are **reusing Team 2's already-merged Results components**
      (`ResultsArea` / `ConfigSummary`) for run detail — you render saved runs,
      you do not rebuild the frontier table/graph

## B. Foundations

- [ ] **Build against mock records + the `RunStore` API, never a database.**
      Use the provided **`InMemoryRunStore`** (`app/src/shared/runStore.ts`)
      seeded with **`MOCK_RUN_RECORDS`** so the whole surface works before
      Team 2's SQLite store exists — the UI talks only to the `RunStore`
      interface (no need to hand-roll a mock store)
- [ ] History surface **component contract:** a pure function of the record
      list + selection + action callbacks (`onViewDetails`, `onRerun`,
      `onDelete`, `onExport`) — no direct SQLite/engine knowledge, no fetching
      beyond the injected `RunStore` (see technical brief §Component contract)
- [ ] Record types imported from `contracts/types.ts` (the new `RunRecord` /
      `RunStore` additions), never re-declared

## C. The history list, search & filters

- [ ] **Run History list** — one row per saved record; columns show run name,
      application, physical architecture, QEC code, magic state factory, QRE
      version, and date/time; rows selectable; newest-first default order
- [ ] **Search** by run name (substring, case-insensitive), applied over the
      records the `RunStore` returns
- [ ] **Filters** (SOW Part 2) over the record set — **run name (search),
      application, physical architecture, error correction code, magic state
      factory, QRE version** — combinable; each filter's options derive from
      what's present in the records; a "no matches" state reads as intentional
- [ ] **Empty state** — no saved runs yet reads as orientation ("run something
      to see it here"), not blank space
- [ ] Filtering/search hide from *view*; they never mutate or delete records
      (records are immutable — deletion is the only removal, and it's explicit)

## D. Per-run actions

- [ ] **View Details** — render the selected record's saved `RunResult` by
      **reusing Team 2's `ResultsArea`** (pass the record's `result` + `config`
      as `ResultsAreaProps`, `phase: "done"`) plus the `ConfigSummary` — a saved
      run displays exactly like a fresh one, including a failed saved run
- [ ] **Delete** — removes a record via `RunStore.delete(id)`, with a confirm
      step; the list updates; deleting never edits a record (immutability holds)
- [ ] **Export Markdown (stub)** — the per-run affordance is present and wired
      to a placeholder/preview (e.g. a modal or copyable stub payload); the
      **real** Markdown generator is Part 3 (week 6) — build the seam, not the
      exporter
- [ ] **Rerun (affordance + seam)** — the per-run Rerun action feeds the
      selected record to the provided **`reconstructConfig(record, stamp)`**
      (`contracts/types.ts`), which returns the pre-fill `RunConfig`; against mock
      records, demonstrate that the action produces the reconstructed config
      payload. **Wiring it into the live Run Configuration form is week-4
      integration** — build the affordance and the handoff, not the navigation

## E. Polish, cleanup + acceptance prep

- [ ] **Carry-over cleanup from week 2** (does not block, close it out before
      rotating): add the **failure-path / Retry test** the week-2 DoD named, and
      round out the **Majorana cases** in the `toRunConfig` tests
- [ ] **Verify your week-2 surface still works after the swap** — once Team 3's
      engine is behind the IPC boundary, re-run the configure → Run → results
      flow against the real engine and confirm your Run Configuration surface is
      unchanged (a short smoke check; report regressions in the channel)
- [ ] Visual pass against the reference design (History surface); keyboard
      navigation across the list, filters, and per-run actions
- [ ] Walk through `week-3-team-1-definition-of-done.md` — every box checkable
- [ ] Acceptance walkthrough: empty → list of mock records → search + each
      filter → View Details (success **and** failed saved run) → Delete →
      Export-Markdown stub → Rerun produces a reconstructed config
- [ ] PR(s) merged to `main` by **Wed Jul 22 EOD** — final acceptance from
      `main`, not a branch
