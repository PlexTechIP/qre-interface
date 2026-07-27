# Week 4 — Team 1 (Sun Min + Emma) — Definition of Done: Run Configuration

The bar for **Wed Jul 29 EOD**. Demoed from `main`, not a branch.
Field types, ranges, and defaults are graded against **the Features and Fields
Google Doc** (link pinned in the project channel).

## Functional

- [ ] **Your work is built and verified on the engine version that ends the week
      pinned** — Team 3's 1.30.0 bump if it landed, 1.29.1 if it didn't, stated
      either way in your PR
- [ ] **No dead options remain.** Trapped Ion, Dynamic Memory Compute, and the
      four private QEC codes are deleted — not disabled, not badged. Nothing is
      rendered "unavailable because the engine can't do it"
- [ ] **Manual Logical Counts works.** It's a third Application Type in the
      **Application section**, carries all seven count fields, and a manual-counts
      run **estimates end to end from the UI** and lands in History
- [ ] **Neutral Atom runs.** Selectable with its full field set, serialized,
      mapped through the adapter, producing a **real estimate** — demonstrated
      live
- [ ] **Low-Move Surface Code pairs with Neutral Atom** through the derivation
      rule, as GateBased→Surface and Majorana→Three-Aux already do
- [ ] **GSJ24 Factory, GSJ24 CCX Factory, and Magic Up-to-Clifford** are
      selectable and reach the engine
- [ ] **Memory Optimization and Secondary Factory are serialized** — neither is
      component-local state any more
- [ ] **Magic State Factory is multi-select**, with the spec's per-architecture
      availability constraints; **Litinski19 availability matches the spec**
      (Superconducting **or** Neutral Atom)
- [ ] **Secondary Factory is multi-select** — Magic Up-to-Clifford and GSJ24 CCX
      can both be active at once
- [ ] **GSJ24 CCX Factory ↔ CCX Magic States move together** in both directions;
      **Magic Up-to-Clifford remains unavailable under Majorana**
- [ ] **Hyperparameters are in `RunConfig`** and appear in the saved run record —
      `toRunConfig.ts:53` no longer drops them
- [ ] **Upload validation is pre-flight**: a missing, unreadable,
      wrong-extension, or implausible file produces a clear message in the form
      before the run launches — verified against `uploads/bad-sample.qasm`

## Validation & correctness

- [ ] **The contract change landed as one PM-reviewed PR** — schema + `types.ts`
      + version bump together, with the architecture→QEC pairing encoded in the
      schema, not only in the UI
- [ ] The four deferred week-3 contract questions were **not** bundled into it
- [ ] **Field types, ranges, and defaults match the Features and Fields Google
      Doc** — any deviation is stated in the PR with a reason
- [ ] **Every newly-enabled value has a test** proving a config using it
      validates against the schema **and** estimates successfully through the
      adapter
- [ ] **No control holds a value that never reaches `RunConfig`** —
      grep-checkable: no `useState` in `MicroArchitectureSection.tsx` standing in
      for a config field
- [ ] **Recorded-only fields are honestly labelled.** A benchmark hyperparameter
      that is serialized but does not yet change the estimate does not look like
      one that does
- [ ] **No invented analytic mappings** — per-benchmark formulas turning
      hyperparameters into logical counts are explicitly out of scope
- [ ] Existing behaviour is unregressed: Superconducting and Majorana runs, the
      Litinski19 fallback, and the Rerun pre-fill path all still work

## Quality

- [ ] Strict TypeScript; no `any` at boundaries; contract types imported from
      `app/src/shared/types.ts`, never re-declared
- [ ] Configuration surface passes a keyboard + label pass and is legible in both
      light and dark themes
- [ ] Visual pass against the Figma reference; deviations listed in the PR
      description rather than silently shipped
- [ ] `npm run typecheck`, `npm test`, and `npm run test:engine` green on the
      merge commit

## Process

- [ ] Team branch `week-4/team-1` created at kickoff off a current `main`
- [ ] Contract-change PR opened early and chased in the channel; not a last-day
      merge
- [ ] **Halfway gate honored** — Manual Logical Counts or Neutral Atom producing
      a real estimate by mid-week, or an escalation posted
- [ ] Checklist file updated with boxes checked
- [ ] Team branch merged to `main` via reviewed PR by **Wed Jul 29 EOD**;
      teammate reviews first, and a PM reviews the contract + engine-adapter seam
- [ ] Acceptance walkthrough rehearsed: 1.30.0 → no dead options → Manual
      Logical Counts run → Neutral Atom run → GSJ24 CCX coupling → multi-select
      factories → bad upload rejected → hyperparameters in the saved record

## Explicitly NOT required

- **Zip/folder uploads for Saved Programs** and **Cirq as a fourth input
  format** — real spec items, deliberately deferred to week 5; flag them, don't
  start them · **per-benchmark analytic mappings** that make hyperparameters
  move the numbers — serialization only this week · rewriting the Q# benchmark
  programs · building out `qdk.estimator` as a second engine path (ruled out —
  it's the legacy generation, and `LogicalCounts` is already reachable from
  `qdk.qre`) · **ruling on** the four deferred contract questions — report what
  1.30.0 changes · anything in `renderer/results/` or `renderer/history/`
  (Team 2) · the Markdown exporter or save dialog (Team 2) · architecture,
  setup, or agentic documentation (Team 3) · packaging or installers (week 6) ·
  redesigning the Configuration layout
