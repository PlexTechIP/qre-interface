# Week 2 Overview — Part 1: Core Estimation Workflow (Three Parallel Tracks)

**Dates:** Tue Jul 7 → Tue Jul 14, 2026
**Deliverables due:** **Wednesday Jul 15 EOD** — Tue Jul 14 is a checkpoint meeting
**Goal:** the bulk of SOW **Part 1 (Core Estimation Workflow)** built across
three independent tracks, ready to integrate in week 3.

> ## Week 2 Contract Surface
>
> Build to the committed dashboard contract: **seven configuration inputs**
> (parameterized architectures, selectable
> magic-state factory, trace transform, max error, optional run name), a
> **Pareto-frontier result model** (table + graph of estimate rows; six
> default fields of 37 possible), the starter benchmark list, and in-scope
> program uploads (Q#/OpenQASM/QIR). `docs/data-contracts.md` and
> `contracts/` are the reference surface for the week. Raise every surprise in
> the channel.

## Track assignments

| Team | Track | One-line mission |
|---|---|---|
| **Team 1** (Sun Min + Emma) | **Run Dashboard (Configuration UI)** | The Run Dashboard surface: all seven inputs with their conditional rules, validate, emit a contract-conformant `RunConfig`, hand it to the engine interface |
| **Team 2** (Melody + Rishabh) | **Compare Dashboard (Output Display & Filtering)** | The Compare Dashboard surface: render any contract-conformant `RunResult` — Pareto frontier table + graph, six default fields, field filtering, full raw output access, loading/error states |
| **Team 3** (Neil + Jessie) | **Engine & Execution** | Run QRE for real, locally: consume a `RunConfig`, execute, emit a conformant frontier `RunResult`; identify + recommend the engine API/bundling route |

## How three dependent tracks run in parallel: the Day-0 contract freeze

These tracks obviously depend on each other — config feeds engine feeds
display. If all three waited on QRE actually running, we'd have one serial
track and two idle teams. Instead:

1. **The contract freeze.** `contracts/` holds the frozen artifacts: both
   JSON Schemas, the shared **`types.ts`** (contract types + the
   `EstimatorService` interface + the Team-1⇄Team-2 seam props),
   **`benchmarks.json`** (the canonical benchmark ids — UI options and engine
   registry use exactly these), and fixture pairs (baseline / large / sparse /
   a representative engine failure).
2. **Teams 1 and 2 build against the mock + fixtures, not the engine.**
   Team 1 builds the `MockEngine` to the spec in their technical brief (it
   returns the committed fixtures); Team 2 consumes the fixtures directly and
   never calls anything.
3. **Team 3 builds the real engine against the same contract**, with no UI —
   a test harness proves conformance against every committed config fixture
   (including the failing one).
4. **Week 3 = the swap.** Mock out, real engine in. If everyone honored the
   contract, integration is wiring, not rework — and a clean week-2 acceptance
   checkpoint passes the **swap gate** (`docs/timeline-and-milestones.md`), which pulls
   week-4 Part-2 work (SQLite, run history) forward into week 3. Conformance
   isn't ceremony; it's how the project buys schedule.

**Corollary — the contract is law.** No team edits `contracts/` in a feature
branch. Field missing? Fixture missing a case? Post in the channel tagging
both PMs; PMs arbitrate, notify affected teams, and land any dedicated
contract-change PR that updates schema + fixtures + version. Process details:
`docs/engineering-workflow.md`.

## Shared context for all teams

- **Team branches:** each team creates its own working branch off `main` at
  kickoff — `week-2/team-1`, `week-2/team-2`, `week-2/team-3` — and works
  from it all week (feature branches PR into the team branch; the team branch
  merges to `main` by **Wed Jul 15 EOD**, the week-2 deadline). Details:
  `docs/engineering-workflow.md`.
- **Design source:** build to the merged reference design from week 1's
  mockups (PMs publish the reference Figma link in the channel after the
  week-1 review).
- **Scaffold:** the **PMs land the app scaffold** (Electron + React + TS
  workspace, lint/format, folder layout per `docs/engineering-workflow.md`,
  `contracts/types.ts` wired into `app/src/shared/`) at the start of the week —
  pull it; don't build your own. If it isn't merged when you start, begin in a
  bare Vite React+TS app *structured to move into your `app/src/` home* and
  say so in the channel; don't serialize on it.
- **Where code goes:** `app/src/renderer/` (T1, T2), `app/src/main/` (T3),
  `app/src/shared/` (contract types — copied verbatim from `contracts/types.ts`,
  owned by PMs; plus the `MockEngine` once Team 1 lands it).
- **Checkpoint bar:** teams are not required to present week-2 work at the
  Tuesday meeting. Final acceptance uses your definition-of-done doc at the
  **Wed Jul 15 EOD** deadline.

## What week 2 does NOT include

- No SQLite persistence, no run history UI, no comparison page (Parts 2 —
  weeks 4–5). The History/Compare surfaces stay mocked-out navigation stubs.
- No export (Part 3).
- No cross-track integration — resist the urge to wire Config UI to the real
  engine "just to see." That's week 3, done deliberately.

## Team docs

- `team-1/` — checklist, definition-of-done, technical brief
- `team-2/` — checklist, definition-of-done, technical brief
- `team-3/` — checklist, definition-of-done, technical brief

Read all three of yours before writing code. The technical brief is the deep
context for your track; the checklist sequences the week.

There are intentionally no per-team integration docs for week 2. Track
boundaries and seam expectations live in the overview, technical briefs,
checklists, and definitions of done; explicit integration handoff docs start
in week 3, when cross-track wiring begins.
