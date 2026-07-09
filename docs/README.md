# QRE Dashboard — Documentation Home

Welcome! This folder is the single source of truth for the PlexTech × Microsoft
Quantum Resource Estimator (QRE) Dashboard project, Summer 2026.

**If you are a developer, you should be able to do your job for any given week by
reading (1) the project-wide docs below once, and (2) your team's folder for the
current week.**

## How this folder is organized

```
docs/
├── README.md                  ← you are here
├── project-overview.md        ← what we're building and why (read first)
├── timeline-and-milestones.md ← week-by-week map of the whole summer
├── team-directory.md          ← teams, PMs, stakeholders, meetings, comms
├── tech-stack.md              ← Electron / React / TypeScript / SQLite / QRE v3
├── engineering-workflow.md    ← git, branches, PRs, reviews, repo conventions
├── data-contracts.md          ← RunConfig & RunResult JSON shapes (v1)
├── glossary.md                ← QRE and project terminology
├── week-1/                    ← Tue Jun 30 → Tue Jul 7, 2026
│   ├── week-1-overview.md
│   ├── week-1-mockup-spec.md  ← shared Figma mockup requirements (all teams)
│   ├── team-1/                ← Sun Min + Emma
│   ├── team-2/                ← Melody + Rishabh
│   └── team-3/                ← Neil + Jessie
└── week-2/                    ← Tue Jul 7 → Tue Jul 14 checkpoint; due Wed Jul 15 EOD
    ├── week-2-overview.md
    ├── team-1/                ← Configuration UI
    ├── team-2/                ← Output Display & Filtering
    └── team-3/                ← Engine & Execution
```

Each team folder for a week contains the docs the PMs publish for that week's
track. Common files:

| Document | Purpose |
|---|---|
| `week-N-team-X-checklist.md` | Every task for the week, in order, as checkboxes |
| `week-N-team-X-definition-of-done.md` | The objective bar your work must clear by that week's PM-announced due date |
| Technical brief / spec docs | Deeper context specific to your week's assignment |
| Coordination / integration docs *(when present)* | Cross-team handoffs and sync points for weeks that actually include integration work |

Week 2 intentionally has no per-team integration docs: the three tracks build
separately against the frozen contract, mock engine, and fixtures. Integration
handoff docs resume when cross-track wiring starts in week 3.

## Reading order

1. **First week on the project:** `project-overview.md` → `team-directory.md` →
   `tech-stack.md` → `engineering-workflow.md` → `glossary.md` (skim) → your
   team's folder for the current week.
2. **Every week after:** the current week's `week-N-overview.md` → your team's
   folder. Re-read `data-contracts.md` whenever your work touches RunConfig or
   RunResult.

## Ground rules

- **Weekly folders are published one week at a time.** Week 3+ docs will appear
  as the PMs finalize each week's plan. Don't plan ahead off stale assumptions —
  assignments rotate.
- **Checklists are living documents.** Check items off in your team's checklist
  as you complete them (commit the edit). PMs read these to track progress
  between meetings.
- **If a doc conflicts with something a PM said more recently, say so** in the
  slack/imessage so the doc gets fixed. Docs are only useful if
  they're true.
- **Deadlines are real.** Weekly tasks are typically assigned around the Tuesday
  meeting, but the exact due date/time is PM-announced in that week's docs.
  Progress is reported to Microsoft during POC meetings weekly on Fridays. Plan
  your 10–14 weekly hours accordingly.
