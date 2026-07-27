# Timeline & Milestones — Summer 2026

Planning cycles are anchored on the weekly PlexTech team meeting
(**Tuesdays 5–6pm**), but task deadlines are PM-announced week by week and may
fall after the Tuesday meeting. Microsoft check-ins are **every Friday**.

> Weeks 1–4 are finalized and published (see their folders). Weeks 5+ are the
> PMs' working plan and may shift — each week's folder is published once
> finalized.
>
> **Re-baselined Fri Jul 24** — see §The week-4 re-baseline below. Week 3
> absorbed all of Part 2, so the old week-4 and week-5 rows (persistence, run
> history, comparison wiring) are **already delivered** and have been collapsed;
> Part 3 now opens in week 4. Dates below are the current plan; earlier drafts
> of this table are superseded.

| Week | Dates (2026) | Focus | SOW Part | Key events |
|---|---|---|---|---|
| **1** | Tue Jun 30 → Tue Jul 7 | Onboarding + high-fidelity Figma mockups (all teams, same task) | Pre-work | Historical checkpoint: mockups presented at the Tue 7/7, 5–6pm meeting. Microsoft check-in Fri 7/3. |
| **2** | Tue Jul 7 → Tue Jul 14 | Part 1 build, 3 parallel tracks: Config UI (T1), Output Display (T2), Engine & Execution (T3) | Part 1 | Tuesday 7/14 is a checkpoint meeting only; **week-2 tasks are due Wed 7/15 EOD**. |
| **3** | Tue Jul 14 → Tue Jul 21 | **Delivered** (merges landed Jul 21–24). Integration + Part 2 (the **swap gate passed**). T3 = the swap (Electron main + IPC + real engine behind `EstimatorService`); T1 = Run History **+ Comparison** UI; T2 = SQLite persistence + immutable run records + query API + Rerun reconstruction. The PMs then integrated the three tracks: real store over IPC, save-after-run, live Rerun, comparison against real records | Part 1 + Part 2 | Rotation: T3 held the engine through the swap. Check-in Fri 7/17. |
| **4** | **Fri Jul 24 → Wed Jul 29** | **Published.** Correctness + polish + documentation. T1 = **Run Configuration made real** (delete options the engine can't run, enable **Neutral Atom** / Low-Move / GSJ24 / Magic Up-to-Clifford / Yoked, fix factory coupling, settle the hyperparameter route); T2 = **Results · History · Comparison** (Pareto curve per compared run, selected row represents the run, Export + Rerun on Results, bulk delete, compare warning, visual polish); T3 = **documentation** (architecture, setup/troubleshooting, and the agentic-integration memo) — no production code | Part 1 + 2 hardening; Part 3 groundwork | **Midterm delivered to Microsoft Fri Jul 24** (Part 1 complete). Short week: Day 0 Fri Jul 24, checkpoint meeting Tue Jul 28, **deadline Wed Jul 29 EOD**. |
| **5** | Wed Jul 29 → Tue Aug 4 | Export hardening (native save dialog, full-field output) + **QRE version tracking end-to-end**; program library / persisted uploads; **UX/market-research track returns** | Part 3 | Check-in Fri 7/31 (signing + update-channel + imported-programs asks go out here). |
| **6** | Tue Aug 4 → Tue Aug 11 | **Packaging** (electron-builder, the Python bundling decision, cross-platform matrix, signing once Microsoft answers); pull-oriented update mechanism | Part 3 → Part 4 | Check-in Fri 8/7. Packaging risk is the summer's largest open item — the ~428 MB Python venv drives it. |
| **7** | Tue Aug 11 → Tue Aug 18 | Bug bash, performance, accessibility, cross-platform verification, documentation | Part 4 | Check-in Fri 8/14. |
| **8** | Tue Aug 18 → Tue Aug 25 | Final polish, signed installers verified, documentation, final presentation draft | Part 4 | Check-in Fri 8/21. |
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
Teams 1 and 2 open Part 2 (run history **+ comparison** UI / SQLite persistence +
Rerun) behind a frozen run-record contract. See `docs/week-3/week-3-overview.md`.

## The week-4 re-baseline (Fri Jul 24)

Week 3 shipped its own scope **and** everything the table had tabled for weeks
4–5. On `main` at the midterm: the real engine runs behind IPC as the only
engine, the SQLite store persists every completed run automatically, History and
Comparison read that real store, and Rerun works end to end into the live
configuration form. Typecheck and the unit suite are green (178 tests).

Two consequences:

1. **The old week-4 and week-5 rows are done**, so they were collapsed rather
   than repeated, and everything after them moved up a slot.
2. **Week 3 ran ~3 days long** (merges landed Jul 21–24), so week 4 is a short
   six-day week — **Fri Jul 24 → Wed Jul 29**, checkpoint at the Tue Jul 28
   meeting, deadline Wed Jul 29 EOD. Weeks 5+ return to the Tuesday cadence.

Net: the calendar lost about a week; the scope gained more than that. The
**Fri Aug 28 final deliverable does not move.**

**Week 4 spends that buffer on correctness rather than new scope.** An audit at
the midterm found controls in the Run Configuration form that the engine never
sees — benchmark hyperparameters are validated and then dropped
(`app/src/renderer/state/toRunConfig.ts:53`), Secondary Factory and Memory
Optimization are component-local state, and several options are greyed out as
"Private" that QRE 1.29.1 actually supports (`NeutralAtom`,
`SurfaceCodeLowMove`, `GSJ24Factory`, `GSJ24CCXFactory`, `MagicUpToClifford`,
both Yoked codes). A tool that returns the same answer when you change a setting
teaches users not to trust it, so that gets fixed before anything new is added.
Week 4 also spends a full pair on documentation: after three weeks the engine,
IPC, and Python setup are understood by exactly two people.

**Still open, deliberately.** Four contract questions Team 3 raised in week 3
(sparse-fixture `tStatesPerRotation`, Majorana `operationTime` being inert on
1.29.1, the trace transforms not being a true one-of, and the provisional
`source` field) have **no PM ruling yet** — see
`docs/week-3/team-3/contract-decision-proposals.md`. They are tracked as known
issues; no team works around them in a feature branch.

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
