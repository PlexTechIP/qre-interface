# Timeline & Milestones — Summer 2026

Planning cycles are anchored on the weekly PlexTech team meeting
(**Tuesdays 5–6pm**), but task deadlines are PM-announced week by week and may
fall after the Tuesday meeting. Microsoft check-ins are **every Friday**.

> Weeks 1–3 are finalized and published (see their folders). Weeks 4+ are the
> PMs' working plan and may shift — each week's folder is published once
> finalized.

| Week | Dates (2026) | Focus | SOW Part | Key events |
|---|---|---|---|---|
| **1** | Tue Jun 30 → Tue Jul 7 | Onboarding + high-fidelity Figma mockups (all teams, same task) | Pre-work | Historical checkpoint: mockups presented at the Tue 7/7, 5–6pm meeting. Microsoft check-in Fri 7/3. |
| **2** | Tue Jul 7 → Tue Jul 14 | Part 1 build, 3 parallel tracks: Config UI (T1), Output Display (T2), Engine & Execution (T3) | Part 1 | Tuesday 7/14 is a checkpoint meeting only; **week-2 tasks are due Wed 7/15 EOD**. |
| **3** | Tue Jul 14 → Tue Jul 21 | **Published.** Integration + Part 2 start (the **swap gate passed** — see below). T3 = the swap (Electron main + IPC + real engine behind `EstimatorService`, mock→real, verify end-to-end, close contract decisions); T1 = Run History UI (against mock records); T2 = SQLite persistence + immutable run records + query API + Rerun reconstruction | Part 1 + Part 2 (pulled forward) | Rotation: T3 holds the engine track through the swap; T1/T2 open the Part-2 tracks. Deadline PM-announced. Check-in Fri 7/17. |
| **4** | Tue Jul 21 → Tue Jul 28 | Run persistence (SQLite), immutable run records, run history UI — **continuation if started in week 3**, otherwise starts here; buffer + midterm hardening | Part 2 | **Midterm deliverable to Microsoft Fri Jul 24** (Part 1 complete). |
| **5** | Tue Jul 28 → Tue Aug 4 | Comparison workspace: multi-run selection, comparison table + per-run bar charts; rerun workflow | Part 2 | Check-in Fri 7/31. |
| **6** | Tue Aug 4 → Tue Aug 11 | Export (Markdown-first, summary + detailed views, metadata); QRE version tracking end-to-end | Part 3 | Check-in Fri 8/7. |
| **7** | Tue Aug 11 → Tue Aug 18 | Pull-oriented update mechanism (app + benchmark library); packaging groundwork (installers) | Part 3 | Check-in Fri 8/14. |
| **8** | Tue Aug 18 → Tue Aug 25 | Packaging (macOS + Windows), polish, bug bash, documentation, final presentation draft | Part 4 | Check-in Fri 8/21. |
| **9** | Tue Aug 25 → Fri Aug 28 | Buffer + final presentation, final report, handoff docs, recommendations | Part 4 (+5 if time) | **Final deliverable + report Fri Aug 28.** |

## Fixed commitments (from the SOW)

- **Midterm deliverable:** Fri **Jul 24** — Part 1 (Core Estimation Workflow) verifiably complete.
- **Final deliverable + report:** Fri **Aug 28**.
- **Microsoft check-ins:** weekly, Fridays, with Jeffrey Lai, Simon Wong,
  Hariharan Ragunathan, Justin Hogaboam.
- **Individual effort:** 10–14 hours per developer per week.

## The week-3 swap gate (how weeks 3 and 4 can merge)

The contract freeze exists so the week-3 mock→real swap is **wiring, not
rework**. Whether week 3 stays a pure integration week or absorbs the start of
week 4's Part-2 scope is decided by an objective gate at the **week-2
acceptance checkpoint (Wed Jul 15 EOD)**:

1. Team 3's conformance harness is green on **every** committed
   `contracts/fixtures/runconfig.*` fixture
   (including the failing one mapping to a schema-valid failed result),
2. Team 1's emitted `RunConfig` validates against the canonical schema live,
   and
3. Teams 1+2 verify the agreed Results seam (`ResultsAreaProps` in
   `contracts/types.ts`) working against the MockEngine — including the
   failure path rendered by Team 2's surface.

**All three pass →** the swap is scheduled after the week-2 acceptance
checkpoint, and the
week-3 folder is published with Part 2 work (SQLite persistence, immutable run
records, run history UI) starting mid-week. **Any fail →** week 3 stays pure
integration/hardening and Part 2 holds to week 4 as tabled. Either way the
midterm (Fri Jul 24) requires Part 1 verifiably complete — passing the gate
buys buffer, not scope risk.

**Resolution (week-2 acceptance):** the gate **passed** — Team 3's conformance
harness is green on every committed fixture (including the failing one →
schema-valid failed result), Team 1's emitted `RunConfig` validates against the
canonical schema, and the Team-1 ⇄ Team-2 Results seam works against the
MockEngine including the failure path. Accordingly the **week-3 folder is
published with Part 2 pulled forward**: Team 3 runs the integration/swap while
Teams 1 and 2 open Part 2 (run history UI / SQLite persistence + Rerun) behind a
frozen run-record contract. See `docs/week-3/week-3-overview.md`.

## How weekly planning works

- On/before each Tuesday meeting, PMs (Davyn + Preston) publish the next week's
  folder under `docs/week-N/` with per-team checklists, definitions of done,
  technical briefs/specs, the exact due date/time for that week, and
  coordination/integration docs when that week's work needs explicit handoffs.
- From **week 3 onward**, team assignments follow a rotation format (announced
  weekly by the PMs) so every pair touches backend, frontend/UI, and UX/research
  work across the summer. Details land in each week's folder — don't assume
  you keep your week-2 area.
- Each Tuesday meeting: teams checkpoint current progress as useful, then
  receive or confirm the next week's assignment and due date. Final acceptance
  happens at that week's announced deadline. Week 2 specifically does not
  require a developer presentation.
