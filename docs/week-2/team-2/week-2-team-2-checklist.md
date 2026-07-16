# Week 2 — Team 2 (Melody + Rishabh) — Checklist: Compare Dashboard (Output Display & Filtering)

**Due: Wednesday Jul 15 EOD** —
Read first: `../week-2-overview.md`, `week-2-team-2-technical-brief.md`,
`docs/data-contracts.md`. Check items off as you go (edit + commit).

## A. Day 0

- [ ] **Create your team branch** `week-2/team-2` off `main` — all your
      feature branches PR into it; it merges to `main` by Wed Jul 15 EOD
      (`docs/engineering-workflow.md`)
- [ ] Attend Tuesday meeting; note the merged reference design decisions for
      the Results Area (PMs post the reference Figma link)
- [ ] Read `docs/data-contracts.md` **v1** end-to-end — especially the
      frontier `RunResult` shape, the six default fields, and the 37-field
      appendix (your filter's universe) — and your technical brief; raise
      surprises in the channel **today**. Use the committed `contracts/`
      artifacts (schema, `types.ts`, fixtures with `runconfig.*` partners)
- [ ] Pull the app scaffold (PMs land it at the start of the week); if it's
      not merged by Wed, start in a bare Vite React+TS app structured to move
      into `app/src/renderer/`, and say so in the channel

## B. Foundations

- [ ] `ResultsArea` component contract: accepts exactly `ResultsAreaProps`
      (`result` + `phase` + optional `config` — unchanged by the contract note)
      — no fetching, no engine knowledge, renders any conformant object (see
      technical brief §Component contract)
- [ ] Fixture harness: a dev-only switcher that feeds each committed fixture
      (with its partner config) into your surface
- [ ] Number formatting utilities, unit-tested: thousands separators, compact
      magnitudes (k/M/B/T), scientific notation (~1e-19), time-unit promotion
      (ns → µs → ms → s → min → hr → yr), zero, and string fields passed
      through (`source`, `FEASIBILITY`, …) — always from `value`, never
      parsing `display`

## C. Core display & visuals

- [ ] **Pareto Frontier table** — one selectable row per estimate; columns =
      the six default fields (physical qubits, runtime, logical cycle time,
      factories used, total error, code distance) + filter-added fields;
      values formatted via the formatting module
- [ ] **Pareto Frontier graph** — physical qubits vs. runtime scatter, one
      point per row; labeled, formatted axes; a one-point frontier still
      looks intentional (see technical brief §Visuals)
- [ ] **Table ⇄ graph selection sync** — clicking a point selects its row and
      vice versa (one shared selection state)
- [ ] **Selected-row detail** (the "larger display") — the selected row's
      full reported field set shown prominently (strongly recommended; at
      minimum the selection must be visibly reflected somewhere beyond the
      highlight)
- [ ] Each default field labeled with unit + a short in-place explanation
      (analyst audience — what does "logical cycle time" mean for me?)
- [ ] **Configuration summary** alongside results: what produced this result
      (from the `config` prop — application, architecture, QEC code, factory,
      transform, max error, QRE version)
- [x] **Everything else from `raw`**: structured, browsable view of the full
      QRE output (collapsible tree or grouped sections) — nothing QRE emits
      is unreachable
      — `RawExplorer.tsx`; handles `raw: null` (TIMEOUT/ENGINE_CRASH) and `{}`.

## D. Filtering, interactivity & states

- [x] **Field filtering controls** (SOW Part 1.7): user selects which result
      fields are in view — applied to the detail display, the table's
      columns, and (where sensible) the graph — over the ~10–15 fields a run
      reports (six defaults start visible; the 37-field appendix is the
      universe); full output remains one click away; selection survives
      switching between results this session (in-memory is fine)
      — `FieldFilter.tsx`, wired into `ResultsArea`/`FrontierTable`/`SelectedRowDetail`.
      Graph wiring pending the graph component (blocked, see below).
- [ ] **Interactive visuals:** every graph point shows a tooltip (exact +
      formatted values, from the formatting module) on **hover and keyboard
      focus**; table↔graph selection sync keyboard-operable; visuals hold up
      on single-row frontiers, zero values, and year-scale/1e-19-scale
      magnitudes. Stretch if time allows: selected row links into the matching
      `raw` section in the explorer
      — **blocked:** no graph component exists yet (tracked under C). Table/detail
      side of "holds up on single-row/zero/huge-magnitude" is done and tested.
- [x] **States:** loading/running (skeleton or progress per reference design),
      **failed** (renders `error.code`/`error.message` usefully + next step;
      canonical codes per `data-contracts.md`, unknown codes tolerated; works
      with `raw` diagnostics present AND with `raw: null`), **empty** (no run
      yet), **sparse** (few fields, zeros, single-row frontier — renders
      without crashes, `undefined`, or `NaN`)
- [x] Formatting-stress data renders legibly (year-scale runtimes,
      billion-scale counts, 1e-19 rates — no overflow, no unreadable raw
      exponents where the design says otherwise)
- [ ] Unit tests: formatting utils; component renders every fixture without
      error **including table + graph** (one-row, zero-value, and
      huge-magnitude cases); field filtering shows/hides across views;
      selection sync works
      — table + detail + filtering covered (`ResultsArea.test.tsx`,
      `RawExplorer.test.tsx`); graph render/selection-sync tests blocked on
      the graph component existing.

## E. Polish + acceptance prep

- [ ] Visual pass against the reference design — needs the merged Figma
      reference + a human eyeball pass, not done here
- [ ] Walk through `week-2-team-2-definition-of-done.md` — every box checkable
      — not yet: graph-dependent boxes still open
- [ ] Acceptance walkthrough via the fixture switcher: success → **frontier
      table + graph (tooltips, point↔row selection)** → field filtering →
      selected-row detail → raw explorer → formatting-stress data → sparse
      (**one-row frontier, still legible**) → failed → empty
      — blocked on the graph step; everything else in the sequence works today
- [ ] PR(s) merged to `main` by Wed Jul 15 EOD — final acceptance from `main`
      — **not merged; this date has passed** — reconfirm the real deadline
      with PMs before treating this as done
