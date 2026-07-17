# Week 3 — Team 1 (Sun Min + Emma) — Definition of Done: Run History UI + Comparison UI

The bar for Tuesday Jul 21 EOD.

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
- [ ] **Comparison — multi-run selection:** the user can select N runs to compare;
      a one-run and a many-run selection both render; the selected set drives the
      table and the charts
- [ ] **Comparison — table:** one column per selected run, one row per result field
      (the six defaults by default, with the week-2 field filter to add/remove rows
      via Team 2's field filter + `formatMetric`); each column identifies its run
      (name · application · architecture · QRE version)
- [ ] **Comparison — bar charts:** per-metric bars across the selected runs
      (physical qubits, runtime, logical cycle time, physical factory qubits, total
      error, code distance); labeled/formatted axes via `formatMetric`; every chart
      has a text equivalent and never relies on color alone. **Built with the
      approved charting library (Recharts or Plotly) — not hand-rolled**
- [ ] **Comparison — export stub:** the comparison-set export affordance is present
      and wired to a placeholder/preview (the real exporter is Part 3)

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
- [ ] **Comparison renders across the mock records** — a one-run and a many-run
      selection both render without `NaN`/`undefined`/overflow; the comparison table
      and bars take values from `formatMetric` (`value` + `unit`, never `display`);
      wide magnitudes and a single-run selection are handled cleanly
- [ ] **Carry-over from week 2:** the failure-path / Retry test is added, and
      the `toRunConfig` tests cover the Majorana cases the week-2 DoD named

## Quality

- [ ] Strict TypeScript; contract types imported from `contracts/types.ts`
      (copied verbatim until the scaffold wires them), never re-declared
- [ ] History surface is a **pure function of records + callbacks** — zero
      store/engine imports (grep-provable); placement/wiring is week-4 work
- [ ] List, filters, and per-run actions fully keyboard-navigable
- [ ] Visual pass matches the **reference Figma**
      (<https://frolicking-zabaione-b67d47.netlify.app/> — History **and Comparison**
      surfaces; deviations listed in review notes); legible in light and dark themes
- [ ] Reuses Team 2's `ResultsArea`/`ConfigSummary` for detail and `formatMetric`
      + the field filter for the comparison table/bars — no duplicated frontier
      table/graph or formatting code; comparison charts are built with the approved
      charting library (Recharts or Plotly), values formatted via `formatMetric`

## Process

- [ ] Team branch `week-3/team-1` created Day 0 (**Thu Jul 16**) off the
      **updated `main`**; all feature PRs target it
- [ ] Team branch merged to `main` via reviewed PR by **Tue Jul 21 EOD**
- [ ] Checklist file updated with boxes checked
- [ ] **Post-swap smoke check** recorded: after Team 3's engine lands behind
      IPC, the week-2 configure → Run → results flow still works and the Run
      Configuration surface is unregressed
- [ ] Acceptance walkthrough prepared — **History:** empty → list → search +
      filters → View Details (success + failed) → Delete → Export stub → Rerun
      reconstruction. **Comparison:** select runs → table + bar charts → field
      filter → single/many-run selection → comparison Export stub

## Explicitly NOT required

- The real SQLite store or `RunStore` write path (Team 2) · re-implementing
  `reconstructConfig` (it's provided in `contracts/` — call it) · rebuilding the
  frontier table/graph (reuse Team 2's components) · the real Markdown exporter
  for either a run or a comparison set (Part 3, week 6) · wiring Rerun into the
  live config form, wiring Comparison/History to the live store, or the
  save-after-run trigger (week-4 integration) · standing up the Electron main
  process or IPC (Team 3) · persistence of filter/search preferences across
  restarts
