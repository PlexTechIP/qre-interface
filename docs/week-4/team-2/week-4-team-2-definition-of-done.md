# Week 4 — Team 2 (Melody + Rishabh) — Definition of Done: Results · History · Comparison

The bar for **Wed Jul 29 EOD**. Demoed from `main`, not a branch.

## Functional

- [ ] **Pareto curves on the Comparison page:** each selected run's full frontier
      plots as its own clearly-identified curve (physical qubits vs. runtime),
      built with Recharts
- [ ] **The selected frontier row represents the run.** Selecting row 3 while
      viewing a result makes row 3 the row Comparison shows for that run;
      `comparisonModel.ts` no longer hardcodes `frontier?.[0]`
- [ ] The comparison column **states which row it's showing** when it isn't row 1
- [ ] **Export** and **Rerun** are available directly on the Results page, reusing
      the existing dialog and the existing `reconstructConfig` handoff
- [ ] **Bulk delete** on History: multiple runs deleted together behind one
      confirm that names how many
- [ ] **"Compare Selected" warns instead of navigating** when fewer than the
      threshold (two) are selected — the user stays on History and is told what's
      needed
- [ ] The Comparison page has had a real visual pass and reads as a finished
      surface at **2 runs and at 6+**

## Validation & correctness

- [ ] **No record is mutated anywhere.** Bulk delete removes records; everything
      else is presentation. **No new field was added to `RunRecord`** — the
      selected-row state lives in app session state
- [ ] Deleted ids are pruned from the comparison selection; the list refreshes
      from the store after a delete
- [ ] **Charts handle the awkward cases** without `NaN`, `undefined`, or a broken
      layout: a single selected run, a **failed** run (visibly absent, not a
      crash), a **sparse one-row** run (a visible point), and wide magnitude
      ranges
- [ ] **Failed runs in a comparison read as failed**, not as blank cells
- [ ] Every chart has a **text equivalent** and never relies on colour alone
- [ ] All values formatted through `formatMetric` (`value` + `unit`, never
      `display`) — exported and on-screen numbers agree
- [ ] Results-page Export and Rerun resolve the run's `RunRecord` rather than
      forking the History code paths — one exporter, one reconstruction path
- [ ] Tests cover: the selected-row-drives-comparison behaviour, bulk delete, and
      the below-threshold compare warning

## Quality

- [ ] Strict TypeScript; no `any`; contract types imported from
      `app/src/shared/types.ts`, never re-declared
- [ ] **Wide content scrolls in its own container** — the page body never scrolls
      horizontally at any selection size
- [ ] Full keyboard operability across the history list, selection, per-run
      actions, and the comparison controls
- [ ] Legible in **both** light and dark themes, charts included
- [ ] Visual pass against the Figma reference; deviations listed in the PR
      description rather than silently shipped
- [ ] **No files under `renderer/components/`, `renderer/state/`,
      `renderer/constants/`, or `main/engine/` were modified** — that's Team 1's
      surface this week
- [ ] `npm run typecheck` and `npm test` green on the merge commit

## Process

- [ ] Team branch `week-4/team-2` created at kickoff off a current `main`
- [ ] Slippage was flagged in the channel as soon as it was known, not at the
      checkpoint
- [ ] The bulk-delete selection decision (reuse the comparison checkboxes vs. a
      separate mode) is **stated and justified** in the PR description
- [ ] Checklist file updated with boxes checked
- [ ] Team branch merged to `main` via reviewed PR by **Wed Jul 29 EOD**;
      teammate reviews first
- [ ] Acceptance walkthrough rehearsed: three runs → select row 3 on one →
      compare → curves + table reflect the selection → export and rerun from the
      Results page → bulk delete → below-threshold compare warning

## Explicitly NOT required

- **Rewriting the Markdown generators** — they exist and are correct; only *how
  it saves* and *which fields it includes* are open, and both are stretch ·
  the native save dialog if items B–E didn't land comfortably · anything in the
  Configuration surface: Neutral Atom, factory coupling, hyperparameters, the
  upload checker (all Team 1) · editing the contract change Team 1 is drafting ·
  any new field on `RunRecord` or `RunResult` · persisting UI selections across
  app restarts (session state only) · architecture, setup, or agentic
  documentation (Team 3) · packaging, installers, or signing · a redesign — polish
  within the existing tokens and the Figma reference
