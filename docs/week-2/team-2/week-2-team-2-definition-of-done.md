# Week 2 — Team 2 (Melody + Rishabh) — Definition of Done: Compare Dashboard (Output Display & Filtering)

The bar for Wednesday Jul 15 EOD.

## Functional

- [ ] **Pareto Frontier table** displayed prominently: one selectable row per
      estimate; the six default fields as columns (physical qubits, runtime,
      logical cycle time, factories used, total error, code distance) —
      each with unit and an in-place explanation
- [ ] **Pareto Frontier graph**: physical qubits vs. runtime scatter, one
      point per table row; labeled/formatted axes; a one-row frontier
      renders as an intentional-looking one-point plot
- [ ] **Selection sync**: clicking a graph point selects its table row and
      vice versa — one shared selection; selected state visible in both
- [ ] **Interactive visuals:** every graph point exposes a tooltip (exact +
      formatted values) on hover **and** keyboard focus — no mouse-only
      interactions
- [x] **Field filtering:** user selects which result fields are in view,
      applied across the detail display, table columns, and (where sensible)
      the graph; six defaults visible initially; filtered-out ≠ deleted (full
      output one interaction away); filter state survives switching results
      within the session
      — table/detail wired; graph wiring pending the graph component
- [ ] **Configuration summary** visible with results: application,
      architecture, QEC code, magic state factory, trace transform, max
      error, QRE version of the producing run
- [x] **Raw output explorer:** the complete `raw` blob is browsable
      (collapsible tree/grouped sections); nothing in the fixture is
      unreachable from the UI
- [ ] **All committed fixtures render correctly**, verified
      live: multi-row success, formatting-stress magnitudes (no overflow),
      sparse/single-row (no crashes/`undefined`/`NaN`; zero reads as a fact),
      failed (canonical error code + message + suggested next step; also
      renders if `raw` is `null`), plus empty and running states

## Correctness

- [ ] All numeric handling uses `value` + `unit` — nothing parses `display`
- [ ] Formatting module: unit-tested for large numbers, compact magnitudes
      (k/M/B/T), scientific notation, time-unit promotion
      (ns→µs→ms→s→min→hr→yr), thousands separators, zero, string fields
      passed through untouched, consistent significant figures
- [ ] Render tests: component mounts every fixture without error (enforced in
      the test suite, not just eyeballed), including the failed fixture with
      its `raw` replaced by `null` (the TIMEOUT/ENGINE_CRASH shape)
- [ ] Table + graph tested across extremes: one-row frontiers, zero values,
      and huge magnitudes render without `NaN`, overflow, or vanishing
      points; tooltip text comes from the formatting module
      (`value` + `unit`), never from parsing `display`
- [ ] An unrecognized `error.code` string still renders a usable failure
      view, and an unrecognized result field still renders in the table/
      filter (forward compatibility — fields and codes may be added by
      contract change)

## Quality

- [ ] Strict TypeScript; contract types imported from `contracts/types.ts`
      (copied verbatim until the scaffold wires it), never re-declared; `raw`
      treated as unknown-shaped and possibly-null (no assumed fields)
- [ ] Component accepts exactly `ResultsAreaProps` via props — zero fetching,
      zero `EstimatorService`/engine imports (grep-provable)
- [ ] Visual pass matches the merged reference design (deviations listed in
      review notes)
- [ ] Filtering controls keyboard-accessible; **interactive visuals
      keyboard-accessible too** (tooltips and selection by focus/keyboard);
      the table is the graph's text equivalent (same data, same order);
      selection never relies on color alone; legible in light and dark themes
- [ ] Visuals are **hand-rolled SVG/CSS components with plain props** — no
      charting library added this week without PM sign-off (the
      Recharts-vs-Plotly ruling ships with the week-5 comparison work)
- [ ] Formatting module + frontier table + scatter + tooltip primitives
      exported as reusable units (week 4–6 comparison/history/export work
      builds on them)

## Process

- [ ] Team branch `week-2/team-2` created Day 0; all feature PRs target it
- [ ] Team branch merged to `main` via reviewed PR by Wed Jul 15 EOD
- [ ] Checklist file updated with boxes checked
- [ ] Acceptance walkthrough prepared: success → frontier table + graph
      (tooltips, selection sync) → field filter → selected-row detail → raw
      explorer → formatting-stress → sparse/one-row → failed → empty

## Explicitly NOT required

- Calling the engine or mock engine (you receive data; you don't fetch it) ·
  run history/comparison surfaces (Part 2) · **multi-run comparison charts**
  (week 5 — this week's visuals are single-run: one run's frontier) ·
  adopting a charting library (Recharts/Plotly ruling comes with the
  comparison work) · animation polish beyond simple transitions · the stretch
  row-to-raw cross-linking · export views (Part 3) · persistence of filter
  preferences across app restarts · the selected-row "larger display" as a
  polished panel (strongly recommended; a clear selected-state elsewhere is
  the minimum)
