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
├── tech-stack.md              ← Electron / React / TypeScript / SQLite / QRE v3
├── engineering-workflow.md    ← git, branches, PRs, reviews, repo conventions
├── data-contracts.md          ← RunConfig & RunResult JSON shapes (v1)
├── features-and-fields.md     ← THE FIELD SPEC: every application type, field,
│                                range, default, and tooltip copy
├── architecture.md            ← end-to-end app, IPC, engine, and store architecture
├── setup-and-troubleshooting.md ← clean-machine setup and real failure fixes
├── agentic-integration-research.md ← standing reference: MCP, BYO-key, and the
│                                structured-output finding (read its Currency note)
├── glossary.md                ← QRE and project terminology
├── week-1/                    ← Tue Jun 30 → Tue Jul 7, 2026
│   ├── week-1-overview.md
│   ├── week-1-mockup-spec.md  ← shared Figma mockup requirements (all teams)
│   ├── team-1/                ← Sun Min + Emma
│   ├── team-2/                ← Melody + Rishabh
│   └── team-3/                ← Mockup
├── week-2/                    ← Tue Jul 7 → Tue Jul 14 checkpoint; due Wed Jul 15 EOD
│   ├── week-2-overview.md
│   ├── team-1/                ← Configuration UI
│   ├── team-2/                ← Output Display & Filtering
│   └── team-3/                ← Engine & Execution
├── week-3/                    ← Thu Jul 16 → due Tue Jul 21 EOD
│   ├── week-3-overview.md
│   ├── team-1/                ← Run History UI + Comparison UI
│   ├── team-2/                ← SQLite persistence + Rerun
│   └── team-3/                ← Integration — the mock→real swap
├── week-4/                    ← Fri Jul 24 → due Wed Jul 29 EOD
│   ├── week-4-overview.md
│   ├── team-1/                ← Run Configuration
│   ├── team-2/                ← Results · History · Comparison
│   └── team-3/                ← Engine upgrade + documentation
└── week-5/                    ← Fri Jul 31 → due Wed Aug 5 EOD
    ├── week-5-overview.md
    ├── team-1/                ← MCP server research (documentation only)
    ├── team-2/                ← LLM interface (bring-your-own API key)
    └── team-3/                ← The configuration surface, end to end
```

Each team folder for a week contains the docs the PMs publish for that week's
track. Common files:

| Document | Purpose |
|---|---|
| `week-N-team-X-checklist.md` | Every task for the week, in order, as checkboxes |
| `week-N-team-X-definition-of-done.md` | The objective bar your work must clear by that week's PM-announced due date |
| Technical brief / spec docs | Deeper context specific to your week's assignment |
| Coordination / integration docs *(when present)* | Cross-team handoffs and sync points for weeks that actually include integration work |

Weeks 2–4 have no separate per-team integration docs: cross-track seams (the
frozen contract, the `RunStore` API, the IPC boundary) are described in each
week's overview and technical briefs, and coordinated in the channel. A
dedicated integration doc appears only when a week's handoffs need one.

## Reading order

1. **First week on the project:** `project-overview.md` → `tech-stack.md` →
   `engineering-workflow.md` → `architecture.md` →
   `setup-and-troubleshooting.md` → `glossary.md` (skim) → your team's folder
   for the current week.
2. **Every week after:** the current week's `week-N-overview.md` → your team's
   folder. Re-read `data-contracts.md` whenever your work touches RunConfig or
   RunResult.

## Ground rules

- **Weekly folders are published one week at a time.** Week 5+ docs will appear
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
