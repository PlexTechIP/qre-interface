# Engineering Workflow

## Repository

- **GitHub repo:** https://github.com/patjandra/microsoft-qre-dashboard
- `main` is protected in spirit: **no direct pushes** once the app scaffold
  exists — everything lands via PR.

## Branching & PRs

- **Every team works from its own team branch.** At week kickoff (Day 0),
  create `week-N/team-X` from `main` (e.g., `week-2/team-1`) — this is the
  branch your team works from all week.
- Day-to-day work happens on short-lived feature branches off your team
  branch, named `week-N/team-X/short-description`
  (e.g., `week-2/team-1/config-form-validation`), merged into the **team
  branch** via reviewed PRs.
- Merging earlier/more often is encouraged whenever the
  branch is green; don't sit on a week of unmerged work if Thursday's state
  is already review-ready.
- Team branches merge to `main` by that week's PM-announced deadline, which may
  be after the Tuesday meeting. The week folder is the source of truth for the
  exact day/time.
- **PR review:** your teammate reviews first. Anything that touches a shared
  contract or another team's surface also needs a PM (or owning team) review —
  the current week's overview / technical brief (and any integration doc, when
  one exists) tells you which surfaces those are.
- Every PR description answers: *what changed, how to verify it, which
  checklist item it advances.*

## Where things live

The **PMs own and land the app scaffold** (Electron + React + TS workspace,
lint/format config, this layout, `contracts/types.ts` wired into
`app/src/shared/`) at the start of week 2 — teams should *pull* it, not build
their own. If it isn't merged when you start, begin in a bare Vite React+TS
app **structured to move into your `app/src/` home below** and say so in the
channel; don't serialize on it.

```
/                     repo root
├── docs/             this documentation
├── contracts/        THE FROZEN CONTRACT: JSON Schemas, types.ts,
│                     benchmarks.json, real captured fixtures (law from 7/7)
├── app/              Electron + React + TypeScript application
│   ├── src/main/     Electron main process: engine (T3), store, exporter
│   ├── src/renderer/ React UI (T1: configuration, T2: results)
│   └── src/shared/   contract types (from contracts/), EstimatorService, MockEngine
└── design/           exported mockup assets, Figma links
```
