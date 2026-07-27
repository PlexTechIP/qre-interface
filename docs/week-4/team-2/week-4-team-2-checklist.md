# Week 4 — Team 2 (Melody + Rishabh) — Checklist: Results · History · Comparison

**Due: Wednesday Jul 29 EOD** — the single deadline for the week.
**Tue Jul 28** 5–6pm is the checkpoint meeting.
Read first: `../week-4-overview.md`, `week-4-team-2-technical-brief.md`,
`docs/project-overview.md` §The four main surfaces (items 2–4), and the **Figma
reference** (<https://frolicking-zabaione-b67d47.netlify.app/>).
Check items off as you go (edit + commit).

Your mission in one line: **the surfaces a user lives in after a run finishes
should read like a finished product.**

**Work split — fill this in at kickoff and commit it:**

- Melody: _______________________
- Rishabh: _______________________
- Shared / pairing on: _______________________

## A. Day 0

- [ ] **Confirm `main` is current before branching.** The PMs land the week-3
      UI/UX polish merge at kickoff; wait for the go in the channel, then create
      `week-4/team-2` off `main`. Feature branches PR into it; it merges to
      `main` by **Wed Jul 29 EOD**
- [ ] `nvm use` (Node **24.18.0**), `npm ci` in `app/`, then
      `npm run typecheck && npm test` — confirm green before you change anything
- [ ] Do a few real runs so you have records to work with, then walk all three
      surfaces and reproduce the gaps: select row 3 of a result → go to
      Comparison → watch it show row 1; click "Compare Selected" with nothing
      ticked; try to delete five runs
- [ ] Read `history/comparisonModel.ts`, `history/ComparisonCharts.tsx`, and
      `results/ResultsArea.tsx` — everything this week either extends or
      re-plumbs those three

## B. Pareto curves on the Comparison page

- [ ] A chart plotting **each selected run's full Pareto frontier as its own
      curve** — physical qubits vs. runtime, matching the single-run scatter's
      axes
- [ ] **One clearly-identified series per run**, reusing the run labels
      `comparisonModel.ts` already derives
- [ ] Built with **Recharts** (already a dependency and already used on this
      page) — don't hand-roll SVG, don't rewrite the week-2 `FrontierScatter`
- [ ] Every axis tick and label formatted through `formatMetric`
- [ ] **Accessibility bar holds:** the chart has a text equivalent (the
      comparison table) and never relies on colour alone
- [ ] Edge cases render cleanly: **one** selected run, a **failed** run (visibly
      absent, not a crash), a **sparse one-row** run (a visible point, not an
      invisible line), and wide magnitude ranges

## C. The selected row represents the run

- [ ] The frontier row a user selects while viewing a result becomes the row
      that represents that run in **Comparison** — replacing the hardcoded
      `frontier?.[0]` at `comparisonModel.ts:53`
- [ ] Selection is held as **app-level session state** (`runId → selectedIndex`),
      defaulting to row 1 for runs never opened. **No new field on `RunRecord`** —
      the record is immutable and PM-owned
- [ ] The comparison column **says which row it's showing** when it isn't row 1,
      so two people's screens can't silently disagree
- [ ] **Slippage flag:** the moment you know a section will not land, post in
      the channel — do not save it for the checkpoint meeting

## D. Results page actions + bulk delete

- [ ] **Export** on the Results page, reusing the existing complete-Markdown
      dialog — no second generator
- [ ] **Rerun** on the Results page, reusing `reconstructConfig` + the shell's
      existing rerun handoff — no second reconstruction path
- [ ] Both resolve the run's `RunRecord` (save-after-run means it exists) rather
      than forking the History paths
- [ ] **Bulk delete on History:** select multiple runs and delete them together
- [ ] Your PR states **deliberately** whether bulk delete reuses the existing
      comparison checkboxes or gets its own selection, and why — "selected to
      compare" and "selected to delete" meaning the same thing is a footgun
- [ ] One confirm step naming **how many** runs will be deleted; the list updates
      afterwards; deleted ids are pruned from the comparison selection

## E. Compare-selected warning + comparison polish

- [ ] **"Compare Selected" no longer navigates to an empty page.** Below the
      threshold (PM lean: **two** runs) the user stays on History and is told what
      they need — a disabled button with no explanation doesn't count
- [ ] Comparison page **visual pass against Figma**: clear hierarchy, run-
      identifying column headers, sensible layout at 2 runs **and** at 6+
- [ ] **Wide content scrolls in its own container** — the page body never scrolls
      horizontally
- [ ] **Failed runs in a comparison read as failed**, not as blank cells
- [ ] Both themes legible, charts included; full keyboard operability across the
      list, selection, actions, and comparison controls
- [ ] Deviations from Figma listed in the PR description

## F. Export gaps — stretch only

**Do not rebuild the Markdown generators. They exist and they're correct.**

- [ ] *(stretch, low risk)* The run export includes **every
      `frontier[].additional` field present on the row**, not just the six
      defaults — a typical run reports ~10–15 of 37 fields
- [ ] *(stretch, only if B–E are comfortably done)* Saving uses Electron's
      **`dialog.showSaveDialog`** over IPC instead of the `Blob` + `<a download>`
      path, with cancel and write-failure handled as normal outcomes

## G. Acceptance prep

- [ ] Walk through `week-4-team-2-definition-of-done.md` — every box checkable
- [ ] Acceptance walkthrough rehearsed: run three estimates → select row 3 on one
      → compare all three → **the curves chart shows three frontiers and the
      table reflects row 3** → export and rerun straight from the Results page →
      bulk-delete two runs → click Compare with one run ticked and get a warning
- [ ] `npm run typecheck && npm test` green; PR(s) merged to `main` by
      **Wed Jul 29 EOD** — acceptance from `main`, not a branch

## Blockers & escalation

- **24-hour rule:** anything blocking you for more than 24 hours goes in the
  channel, tagged to both PMs.
- **If a feature seems to need a new `RunRecord` field**, stop and post. Records
  are immutable and PM-owned; the answer is almost always session state.
- **Stay out of Team 1's files.** They are rewriting the Configuration surface
  and landing a contract change this week. If you need something from
  `renderer/components/`, `renderer/state/`, or `main/engine/`, ask in the
  channel rather than editing it.
