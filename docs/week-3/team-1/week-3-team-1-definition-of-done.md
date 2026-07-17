# Week 3 — Team 1 (Sun Min + Emma) — Definition of Done: Run History UI

The bar for Wednesday Jul 22 EOD.

## Functional

- [ ] **Run History list** renders one row per saved record, showing run name,
      application, physical architecture, QEC code, magic state factory, QRE
      version, and date/time; rows are selectable; newest-first by default
- [ ] **Search + filters** work over the record set: run-name search
      (substring, case-insensitive) plus filters for application, physical
      architecture, error correction code, magic state factory, and QRE version
      — combinable; options derived from the records present; a filtered-to-empty
      result and a "no runs yet" empty state are visibly distinct
- [ ] **View Details** renders the selected record's saved `RunResult` by
      **reusing Team 2's `ResultsArea` + `ConfigSummary`** (`ResultsAreaProps`,
      `phase: "done"`) — a saved run displays like a fresh one, **including a
      saved failed run**
- [ ] **Delete** removes a record via `RunStore.delete(id)` behind a confirm
      step; the list updates and no record is mutated
- [ ] **Export Markdown** affordance present per run, wired to a
      placeholder/preview **stub** (the real generator is Part 3)
- [ ] **Rerun** affordance present per run; emits the selected record to the
      Rerun seam and (against mock records) yields the reconstructed pre-fill
      config — the live-form navigation is explicitly deferred to week 4

## Validation & correctness

- [ ] The surface consumes a **`RunStore`** (the provided `InMemoryRunStore`
      this week) and the `RunRecord`/`RunStore` types from `contracts/types.ts` —
      no direct database access, no engine imports
- [ ] Records are treated as **immutable**: search, filter, and selection never
      mutate a record; Delete is the only removal
- [ ] Renders **every committed mock run record** without error — verified live
      — including a sparse/one-row record and a **failed** saved run (rendered
      through Team 2's failure view)
- [ ] Search + each filter tested (shows/hides the right records; combined
      filters intersect); a saved failed run opens in View Details without
      crashing
- [ ] **Carry-over from week 2:** the failure-path / Retry test is added, and
      the `toRunConfig` tests cover the Majorana cases the week-2 DoD named

## Quality

- [ ] Strict TypeScript; contract types imported from `contracts/types.ts`
      (copied verbatim until the scaffold wires them), never re-declared
- [ ] History surface is a **pure function of records + callbacks** — zero
      store/engine imports (grep-provable); placement/wiring is week-4 work
- [ ] List, filters, and per-run actions fully keyboard-navigable
- [ ] Visual pass matches the merged reference design (deviations listed in
      review notes); legible in light and dark themes
- [ ] Reuses Team 2's `ResultsArea`/`ConfigSummary` for detail — no duplicated
      frontier table/graph code

## Process

- [ ] Team branch `week-3/team-1` created Day 0 (**Thu Jul 16**) off the
      **updated `main`**; all feature PRs target it
- [ ] Team branch merged to `main` via reviewed PR by **Wed Jul 22 EOD**
- [ ] Checklist file updated with boxes checked
- [ ] **Post-swap smoke check** recorded: after Team 3's engine lands behind
      IPC, the week-2 configure → Run → results flow still works and the Run
      Configuration surface is unregressed
- [ ] Acceptance walkthrough prepared: empty → list → search + filters → View
      Details (success + failed) → Delete → Export stub → Rerun reconstruction

## Explicitly NOT required

- The real SQLite store or `RunStore` write path (Team 2) · re-implementing
  `reconstructConfig` (it's provided in `contracts/` — call it) · rebuilding the
  frontier table/graph (reuse Team 2's components) · the real Markdown exporter
  (Part 3, week 6) · wiring Rerun into
  the live config form, the store swap, or the save-after-run trigger (week-4
  integration) · the multi-run comparison workspace / bar charts (Part 2,
  week 5) · standing up the Electron main process or IPC (Team 3) · persistence
  of filter/search preferences across restarts
