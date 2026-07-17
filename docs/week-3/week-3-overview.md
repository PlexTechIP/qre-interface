# Week 3 Overview — The Swap + Part 2 Starts (Three Parallel Tracks)

**Dates:** Thu Jul 16 → Tue Jul 21, 2026
**Deliverables due:** **Tuesday Jul 21 EOD** — the Tue Jul 21 5–6pm meeting is
the checkpoint; final acceptance is EOD that same day. Microsoft check-in Fri Jul 17
**Goal:** the week-2 **mock→real swap** (integration) lands, and — because the
week-2 **swap gate passed** — the start of SOW **Part 2 (Run History,
Traceability)** is pulled forward and built in parallel behind a frozen
run-record contract.

> ## Week 3 Contract Surface
>
> Two surfaces are live this week. The **estimation boundary**
> (`RunConfig`/`RunResult`, `EstimatorService`) is unchanged and now moves
> across a real process boundary — Team 3 wires the real engine behind the same
> interface. The **new surface is the run record**: a PM-owned
> **`RunRecord`** shape (the producing `RunConfig` + its `RunResult` + the
> runtime `qreVersion` + timestamps, immutable) and a **`RunStore`
> persistence/query API** (`save` / `list` / `get` / `delete` / `query`) over
> saved records, plus a **Rerun reconstruction** helper (`reconstructConfig` —
> record → a config that pre-fills the Run Configuration form). It is **already
> committed to `main`** — the PMs landed it directly, ahead of kickoff, so
> there is no PR to wait on. The record shape is deliberately minimal —
> `{ schemaVersion, id, config, result, savedAt }`; the engine version and the
> run's launch time are read from `result.qreVersion` / `config.createdAt`, not
> duplicated. It all lives in `contracts/types.ts` +
> `contracts/runrecord.schema.json` + `contracts/fixtures/runrecord.*.json`,
> with a reference `InMemoryRunStore` in `app/src/shared/`. It stays
> **PM-owned**: propose changes in the channel; PMs land them via
> contract-change. Raise every surprise in the channel.

## Track assignments

| Team | Track | One-line mission |
|---|---|---|
| **Team 3** (Neil + Jessie) | **Integration — the swap** | Stand up the Electron main process + typed IPC bridge, run the **real QRE** behind `EstimatorService`, swap `MockEngine → QreEngine`, verify configure → run → real estimation → results end-to-end, and close the pending engine/contract decisions |
| **Team 1** (Sun Min + Emma) | **Part 2 — Run History UI + Comparison UI** (frontend) | **Two full page tabs, built to the Figma reference.** **History:** the list of saved runs, per-run **View Details** (reusing Team 2's Results components), **Delete**, **Export-Markdown** stub, and search + filters. **Comparison:** multi-run selection, a side-by-side comparison table + per-run bar charts, and a comparison **Export** stub — both built against **mock run records** |
| **Team 2** (Melody + Rishabh) | **Part 2 — Run Persistence + Rerun** (backend) | A **SQLite** persistence layer that saves every run as an **immutable record**, a **query/filter/load API** over saved records, and the **Rerun** data path (record → reconstructed config) — built to the same `RunStore` API Team 1 consumes |

## Why Part 2 starts now — the swap gate passed

The week-2 acceptance checkpoint cleared the objective **swap gate**
(`docs/timeline-and-milestones.md`): Team 3's conformance harness is green on
every committed `runconfig.*` fixture (including the failing one → a schema-valid
failed result), Team 1's emitted `RunConfig` validates against the canonical
schema live, and the Team-1 ⇄ Team-2 Results seam (`ResultsAreaProps`) works
against the MockEngine including the failure path. Per the timeline, **a passing
gate pulls Part-2 work (SQLite persistence, immutable run records, run history
UI) forward into week 3**. So week 3 is not a pure integration week: Team 3
carries the integration, and Teams 1 and 2 open Part 2 in parallel. This buys
buffer before the **midterm (Fri Jul 24, Part 1 verifiably complete)** rather
than scope risk — the swap still has to land cleanly.

## Building on the already-merged integration

Teams 1 and 2 do **not** do integration this week. Their week-2 code is **already
merged onto `main`** — the app runs end-to-end against the MockEngine (configure →
Run → running → Team 2's `ResultsArea`), typecheck/tests/build green.

**How the PMs merged Team 1 + Team 2 (what `main` now is).** The PMs composed
the two surfaces into one app off-branch and landed it on `main` (commits
`ee188e4` "integrate run config (team 1) with results area (team 2)" →
`d731f19` "merge team 1 + team 2 integration"). The recipe, so you know exactly
what you're building on:

- **Team 2's branch was the baseline** (`week-2/team-2-frontier-table-detail` —
  the live one, not the empty `week-2/team-2`). Its app shell, `styles.css`
  (design tokens + light/dark), and `ThemeToggle` are the project's default look
  by construction.
- **Team 1's form + run flow dropped in** on top (`RunConfiguration.tsx`, its
  `components`/`state`/`constants`, `mockEngine.ts`, and the schema/fixtures
  under `shared/contracts/`). Team 1's `App.tsx`/`main.tsx`/`styles.css` were
  **not** pulled — one shell, one stylesheet, both Team 2's.
- **The seam was swapped, not rebuilt.** Team 1 had built its `ResultsSeam` as a
  *disposable stub* against the same `ResultsAreaProps`; the merge replaced it
  with Team 2's real `<ResultsArea>` (a 3-edit functional swap) and deleted the
  stub. Team 1's producer-side chrome (Retry / Edit-configuration, the
  `rejected` branch) stayed Team 1's.
- **Contract imports were canonicalized** to `shared/types` (the duplicate
  `shared/contracts/types.ts` was dropped; the schema + fixtures stayed).
- **Team 1's form was restyled onto Team 2's tokens** — its markup kept, its
  hardcoded values replaced with `var(--…)` so the form inherits Team 2's
  palette **and dark mode** (Team 1 had only styled light).
- **Verified before landing:** defaults path → running → Team 2's frontier
  table + scatter; "Simulate failure" → failed result at the seam with working
  Retry/Edit; dark mode correct on both surfaces; `typecheck` + `test` green.
- **Explicitly deferred to this week:** Team 3's engine — the app still talks to
  `MockEngine`, and the sparse-fixture contract decision travels with Team 3
  (below), so it didn't block the merge.

Week 3 starts from that `main`:

- **Team 1** builds **two** new renderer surfaces — the **History** tab and the
  **Comparison** tab — both **reusing Team 2's already-merged Results components**
  (`ResultsArea` for a saved run's detail; the `formatMetric` module + field
  filter for the comparison table/bars) rather than re-implementing them. Both are
  built to the **Figma** reference design.
- **Team 2** builds the persistence layer in the Electron main process
  (`app/src/main/`), behind the `RunStore` API — the same surface Team 1 codes
  against.
- **Team 3's swap must not regress their surfaces.** The engine moves behind
  `EstimatorService` via IPC; the renderer keeps talking to the same interface.
  A brief "verify your surface still works after the swap" check is on each of
  Team 1's and Team 2's checklists, but their **primary** week-3 work is Part 2.

## How three tracks run in parallel (again): the run-record freeze

Part 2 has the same dependency shape week 2 had — the History UI needs records
to show, and Rerun spans Team 2's load path (record → the provided
`reconstructConfig`) and Team 1's week-2 config form. We decouple it the same
way:

1. **The run-record contract is already frozen (landed on `main`).** The PMs
   committed the **`RunRecord`** shape, the **`RunStore`** query/persistence API,
   and the `reconstructConfig` Rerun helper to `contracts/types.ts` — plus
   `runrecord.schema.json` and a **committed set of mock saved run records**
   (`contracts/fixtures/runrecord.*.json`, mirroring week-2's fixtures: multi-row,
   sparse/one-row, a failed run, varied applications/architectures/QRE versions
   so filters have something to bite on). A reference **`InMemoryRunStore`** ships
   alongside in `app/src/shared/` — the behaviour the SQLite store must match.
2. **Team 1 builds the History UI against the mock records + the `RunStore`
   API** (the provided `InMemoryRunStore`, seeded with `MOCK_RUN_RECORDS`),
   never against a real database. It imports the record/API types from
   `contracts/`, never re-declares them.
3. **Team 2 builds the real SQLite store behind the same `RunStore` API**, with
   no UI — reproducing `InMemoryRunStore`'s behaviour and reusing the provided
   `reconstructConfig` / query helpers rather than re-deriving them; a test/CLI
   harness proves save→query→load and immutability against the same records.
4. **Week 4 = the store swap.** Real SQLite store in, mock records out — the same
   play as this week's engine swap. If both sides honored the `RunStore`
   contract, wiring the save-after-run trigger and the live Rerun path is
   integration, not rework.

**Corollary — the contract is still law.** No team edits `contracts/` in a
feature branch, including the new run-record artifacts. Field missing on the
record? Query filter under-specified? Post in the channel tagging both PMs;
PMs arbitrate and land the dedicated contract-change PR (schema + types +
fixtures + version). This is also the mechanism that closes Team 3's engine
decisions below. Process details: `docs/engineering-workflow.md`.

## Shared context for all teams

- **Team branches:** each team creates its own working branch off the **updated
  `main`** at kickoff (Day 0 = **Thu Jul 16**) — `week-3/team-1`,
  `week-3/team-2`, `week-3/team-3` — and works from it all week (feature branches
  PR into the team branch; the team branch merges to `main` by **Tue Jul 21
  EOD**). Start from `main` **after** the week-2 integration merge (`d731f19`);
  do not branch off a week-2 team branch. Details:
  `docs/engineering-workflow.md`.
- **Assignments this week:** Team 3 **holds** the engine track through the swap
  (continuity beats novelty mid-integration); Teams 1 and 2 open the Part-2
  tracks (History UI / persistence). Weekly rotation resumes once the seams
  stabilize — don't assume you keep your week-3 area.
- **Design source — reference the Figma.** Build the History and Comparison tabs
  to the **reference design (Figma):** <https://frolicking-zabaione-b67d47.netlify.app/>
  (the History and Comparison frames specifically). The surfaces are also specified
  in `docs/project-overview.md` §The four main surfaces; reuse the week-2 Results
  visuals for run detail and `formatMetric` for the comparison table/bars. Where
  Figma and this doc disagree on layout, follow Figma and flag it.
- **Where code goes:** `app/src/renderer/` (Team 1 — History UI),
  `app/src/main/` (Team 2 — SQLite `RunStore`; Team 3 — Electron main + engine +
  IPC), `app/src/shared/` (PM-owned contract types + the reference
  `InMemoryRunStore`, `reconstructConfig`, and `MOCK_RUN_RECORDS` — already
  landed).
- **Handoff discipline:** the swap and the store swap are cross-team. The
  outgoing side of any seam leaves an updated module README + known-issues note
  (rotation begins next week; the incoming pair needs it).
- **Checkpoint bar:** final acceptance uses your definition-of-done doc at the
  **Tue Jul 21 EOD** deadline, from `main` — not a branch.

## What week 3 does NOT include

- **No *live* comparison/history data.** Both tabs read the **mock run records**
  this week; wiring them to Team 2's real SQLite store is week-4 integration. (The
  Comparison workspace itself — multi-run select, table, bar charts, export stub —
  **is** in Team 1's scope now; see the team-1 docs. History renders single-run
  detail by reusing the week-2 Results visuals.)
- **No real export.** Team 1 ships an **Export-Markdown stub** (the affordance +
  a placeholder/preview), not the real Markdown generator (Part 3, week 6).
- **No store-swap or Rerun end-to-end wiring.** Team 1 builds against mock
  records; Team 2 builds the real store + the pure Rerun reconstruction behind
  the API. Connecting the real store, the save-after-run trigger, and the live
  Rerun-into-the-form path is **week-4 integration**, done deliberately.
- **Charting library — ruled: use Recharts or Plotly.** The PMs have signed off on
  a charting library for the comparison bar charts (Recharts recommended as the
  lighter React-native fit; either is approved). **Do not hand-roll the comparison
  bars.** Keep the same accessibility bar as week 2 (every chart has a text
  equivalent — the comparison table — and never relies on color alone) and format
  ticks/labels with Team 2's `formatMetric`. Team 2's existing week-2 scatter stays
  as-is; this ruling covers the new comparison charts only.
- **No new estimation-contract scope.** Team 3's job is to make the real engine
  honor the *existing* `RunConfig`/`RunResult` contract and to resolve the
  acknowledged gaps through the contract-change process — not to expand it.

## Team docs

- `team-1/` — checklist, technical brief, definition-of-done (Run History UI + Comparison UI)
- `team-2/` — checklist, technical brief, definition-of-done (Persistence + Rerun)
- `team-3/` — checklist, technical brief, definition-of-done (Integration / the swap)

Read all three of yours before writing code. The technical brief is the deep
context for your track; the checklist sequences the week. Cross-track seams (the
IPC boundary, the `RunStore` API, the Rerun reconstruction target) are described
in the overview and the technical briefs — coordinate on them in the channel as
they firm up.
