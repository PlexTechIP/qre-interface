# Week 4 — Team 2 — Technical Brief: Results · History · Comparison

Your track: the three surfaces a user spends their time in **after** a run
finishes. They all work — this week they get correct, complete, and pleasant.

You own `app/src/renderer/results/` and `app/src/renderer/history/` end-to-end.
Team 1 is in `renderer/components/`, `renderer/state/`, `renderer/constants/`
and `main/engine/`. **You share no files** — keep it that way, and if you think
you need to touch theirs, post in the channel first.

> **Records are immutable.** Nothing this week edits a saved run. Bulk delete
> removes records; everything else is presentation. If a feature seems to need a
> new field on `RunRecord`, that's a contract change — stop and post in the
> channel rather than reaching for one.

## 1. A Pareto curve per compared run

Today the Comparison page shows **bar charts** (`ComparisonCharts.tsx`, Recharts
`BarChart`) — one bar per run per metric, comparing single scalar values. That
answers "which run needs more qubits," but it throws away the shape of the
trade-off.

A run doesn't produce one point; it produces a **Pareto frontier** — the set of
non-dominated trade-offs between physical qubits and runtime
(`docs/project-overview.md`). Add a chart to the Comparison page that plots
**each selected run's full frontier as its own curve**, so an analyst can see
where two architectures cross over rather than just which is bigger at one
point.

- Physical qubits vs. runtime, matching the axes of the single-run
  `FrontierScatter` in `results/`.
- **One series per selected run**, clearly identified. Reuse the run
  short-names/labels the comparison table already derives
  (`comparisonModel.ts`).
- Recharts is already a dependency and already used on this page — use it. The
  week-2 `FrontierScatter` is hand-rolled SVG; don't copy that approach here, and
  don't rewrite it either.
- **Keep the accessibility bar from week 2:** every chart has a text equivalent
  (the comparison table is it) and never relies on colour alone — vary marker
  shape or add direct labels as well.
- Handle the awkward cases: a single selected run, a **failed** run (no
  frontier — it should be visibly absent, not a crash), a sparse one-row run
  (a single point, not an invisible line), and wide magnitude ranges.
- Format every axis tick and label through `formatMetric` so numbers read the
  same as everywhere else in the app.

## 2. The selected Pareto row should represent the run

`comparisonModel.ts:53`:

```ts
row: result.frontier?.[0] ?? null,
```

Comparison always summarizes a run by its **first** frontier point. History does
the same. But the user picks a row when they look at a result — `ResultsArea`
tracks `selectedIndex` (line 22), the metric cards and the detail panel follow
it, and then that choice is thrown away the moment they navigate.

Make the selection stick: the row a user selected while viewing a run is the row
that represents that run in Comparison (and in any History summary).

**Design constraint — read this before you build it.** `RunRecord` is
**immutable and PM-owned**. You may not add a `selectedRow` field to it. So the
selection lives outside the record. The straightforward answer is app-level
session state — a map of `runId → selectedIndex` held in the shell, defaulting to
`0` for runs the user hasn't opened. Persisting it across restarts would need a
store, which is **not** in scope this week.

Make the behaviour legible: if a run is being represented by row 3 of 5, the
comparison column should say so rather than silently differing from a colleague's
screen. Default remains row 1.

## 3. Export + Rerun on the Results page

`ResultsPage.tsx` renders a finished run and nothing else. Both actions already
exist and are already wired on the History surface —

- **Export** → `ExportStubDialog` (with `mode="complete"`, the real Markdown)
- **Rerun** → `reconstructConfig(record, stamp)` → the shell's `onRerunRequest`,
  which pre-fills the form and navigates (`App.tsx`)

— so this is placement and plumbing, not new capability. The friction today is
real though: a user finishes a run, wants to export it, and has to go find it in
History first.

One wrinkle: History acts on a **`RunRecord`**, while `ResultsPage` holds
`{ config, result }`. Save-after-run means the record exists in the store by the
time results render — resolve it (or assemble the same shape via
`makeRunRecord`) rather than forking the export/rerun paths.

## 4. Bulk delete on History

Per-row Delete exists (`RunHistoryList.tsx:184`) behind a confirm dialog. There's
no way to clear ten runs without ten confirmations.

The list **already has per-row checkboxes** — they drive the comparison
selection (`comparisonIds`). Decide deliberately whether bulk delete reuses that
same selection or needs its own, and say which in your PR:

- Reusing it is less UI, but "selected for comparison" and "selected for
  deletion" meaning the same thing is a footgun — a user who ticked four runs to
  compare could delete them by mis-clicking.
- A separate selection mode is more code and clearer intent.

Either way: one confirm step naming **how many** runs will be deleted, the list
updates afterwards, and the comparison selection prunes any deleted ids (the
existing single delete already does this — `RunHistoryContainer.tsx:177`).

## 5. Warn instead of navigating to an empty Comparison

The "Compare Selected" button in the History header navigates to Comparison
regardless of how many runs are ticked — including zero. The user lands on an
empty page and has to work out why.

Warn in place instead: keep them on History and tell them what's needed. Decide
the threshold and be consistent — comparing a single run does render, so the
question is whether "compare" with fewer than two selected is meaningful. The
PMs' lean is **two**, with the button disabled-with-explanation below that
rather than silently doing nothing. A disabled button with no explanation is the
same bug in a different costume.

## 6. Make the Comparison page look nicer

The loosest item on the list, so here's the specific bar. Comparison is the
app's differentiating surface (`docs/project-overview.md` §What "good" looks
like) and currently reads as a table and some charts stacked vertically.

Work against the **Figma reference**
(<https://frolicking-zabaione-b67d47.netlify.app/>) and aim at:

- A clear hierarchy — what's being compared, then the numbers, then the charts.
- Column headers that identify a run at a glance without swallowing the table.
- Sensible behaviour at 2 runs and at 6+ runs (horizontal scroll that doesn't
  break the page — wide content scrolls in its own container).
- Failed runs in a comparison that read as failed rather than as blank cells.
- Both themes legible; charts included.

List your deviations from Figma in the PR description rather than shipping them
silently.

## 7. Export gaps — improve how it saves, don't rewrite it

**The Markdown generators are done and correct. Do not rebuild them.**
`buildRunExportMarkdown` and `buildComparisonExportMarkdown` produce complete
output today. Two real gaps remain, both **stretch** for this week:

- **It saves like a web page.** `downloadMarkdown` builds a `Blob`, creates an
  `<a download>`, and clicks it. Inside a desktop app that means no path choice,
  no overwrite prompt, no cancel. The right fix is Electron's
  `dialog.showSaveDialog` from the main process behind IPC — which means a new
  IPC surface, so only start it if items 1–6 are landing comfortably.
- **The frontier table is lossy.** The run export emits the six default fields;
  a typical run reports ~10–15 of 37 (`docs/data-contracts.md`), with the rest in
  `frontier[].additional`. Adding them is a small, self-contained change to the
  existing generator — good value, low risk.

Take the second one if you have time. Leave the first if you don't.

## Boundaries — what is NOT yours this week

| Not yours | Whose |
|---|---|
| `renderer/components/`, `renderer/state/`, `renderer/constants/`, `main/engine/` — the whole Configuration surface | Team 1 |
| Neutral Atom, factory coupling, hyperparameters, the upload checker | Team 1 |
| The contract change Team 1 is drafting — read it, don't edit it | Team 1 + PMs |
| Architecture, setup, or agentic documentation | Team 3 |
| Any new field on `RunRecord` or `RunResult` | PMs, via contract-change |
| Persisting UI selections across app restarts | Out of scope — session state only |
| Packaging, installers, signing | Week 5+ |

## Quality bar

Strict TS, no `any`. Contract types imported from `app/src/shared/types.ts`,
never re-declared. **No record is ever mutated** — bulk delete removes, nothing
edits. Every chart has a text equivalent and never relies on colour alone. All
values formatted through `formatMetric` (`value` + `unit`, never `display`).
Single-run, many-run, failed, and sparse selections all render without `NaN`,
`undefined`, or a broken layout. Full keyboard operability across the list,
selection, actions, and comparison controls. `npm run typecheck` and `npm test`
green before every PR.
