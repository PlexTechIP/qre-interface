# Timeline & Milestones — Summer 2026

Planning cycles are anchored on the weekly PlexTech team meeting
(**Tuesdays 5–6pm**), but task deadlines are PM-announced week by week and may
fall after the Tuesday meeting. Microsoft check-ins are **every Friday**, except
where a row below says otherwise.

> Weeks 1–6 are finalized and published (see their folders). Weeks 7+ are the
> PMs' working plan and may shift — each week's folder is published once
> finalized.
>
> **Re-baselined twice.** First on **Fri Jul 24** (§The week-4 re-baseline):
> week 3 absorbed all of Part 2, so the old week-4 and week-5 rows were collapsed
> and Part 3 opened in week 4. Again on **Mon Aug 10** (§The week-6 re-baseline):
> week 6 runs twelve days and absorbs what was the week-7 slot, so the table is
> now **eight weeks, not nine**. Dates below are the current plan; earlier drafts
> are superseded.

| Week | Dates (2026) | Focus | SOW Part | Key events |
|---|---|---|---|---|
| **1** | Tue Jun 30 → Tue Jul 7 | Onboarding + high-fidelity Figma mockups (all teams, same task) | Pre-work | Historical checkpoint: mockups presented at the Tue 7/7, 5–6pm meeting. Microsoft check-in Fri 7/3. |
| **2** | Tue Jul 7 → Tue Jul 14 | Part 1 build, 3 parallel tracks: Config UI (T1), Output Display (T2), Engine & Execution (T3) | Part 1 | Tuesday 7/14 is a checkpoint meeting only; **week-2 tasks were due Wed 7/15 EOD**. |
| **3** | Tue Jul 14 → Tue Jul 21 | **Delivered** (merges landed Jul 21–24). Integration + Part 2 (the **swap gate passed**). T3 = the swap (Electron main + IPC + real engine behind `EstimatorService`); T1 = Run History **+ Comparison** UI; T2 = SQLite persistence + immutable run records + query API + Rerun reconstruction. The PMs then integrated the three tracks | Part 1 + Part 2 | Rotation: T3 held the engine through the swap. Check-in Fri 7/17. |
| **4** | **Fri Jul 24 → Wed Jul 29** | **Delivered.** Correctness + polish + documentation. T1 = Run Configuration made real; T2 = Results · History · Comparison; T3 = the qdk 1.30.0 bump, then architecture + setup documentation and the agentic-integration memo | Part 1 + 2 hardening; Part 3 groundwork | **Midterm delivered to Microsoft Fri Jul 24** (Part 1 complete). Short week: Day 0 Fri Jul 24, checkpoint Tue Jul 28, **deadline Wed Jul 29 EOD**. |
| **5** | **Fri Jul 31 → Wed Aug 5** | **Delivered, with gaps — see §The week-6 re-baseline.** Re-scoped after the Fri Jul 31 POC. T3 = the configuration surface end to end; T1 = MCP server research (documentation only); T2 = the LLM interface (bring-your-own API key, natural language → draft config). PMs landed contract **v1.4.0** at kickoff | Part 1 + 2 polish; agentic stretch goal opens | Short week: Day 0 Fri Jul 31, checkpoint Tue Aug 4, **deadline Wed Aug 5 EOD**. The Fri 7/31 POC produced the field-level UI action list. Final merges landed Fri Aug 7 – Sun Aug 9. |
| **6** | **Fri Aug 7 → Tue Aug 18** | **Published.** Tracks rotate; the theme is getting the project ready to be looked at by strangers. T1 = **deployment readiness** (security review, CI pipeline, dependency advisories, contributor day-one blockers, release hygiene); T2 = **the MCP server's read half** (concurrency spike, stdio scaffold, four read tools, three open items); T3 = **open-source readiness** (one document: licensing, history audit, community files, governance, publication runbook). **PMs = the LLM interface.** Teams 1 and 2 additionally owe a written list of what they found that the briefs did not name | Part 3 groundwork; agentic build begins | **Twelve-day week.** Docs published Mon Aug 10; checkpoint Tue Aug 11; **deadline Tue Aug 18 EOD**. ❌ **Check-in Fri 8/7 was CANCELLED.** Next check-in **Fri 8/14**. |
| **7** | Tue Aug 18 → Tue Aug 25 | **Packaging** (electron-builder, the Python bundling decision, cross-platform matrix, signing) — deferred from weeks 4, 5 and 6; **the MCP write half** (`qre_run_estimate` and its gate, the Tasks extension, the invocation log); **Part 3 export hardening** (native save dialog, full-field output, version-tracking enforcement); plus whatever week 6 left. **Over-subscribed as written — see §The week-6 re-baseline** | Part 3 → Part 4 | Check-in Fri 8/21. Packaging is now the summer's largest open item with one week left; the ~428 MB Python venv drives it. |
| **8** | Tue Aug 25 → Fri Aug 28 | Final polish, bug bash, accessibility and cross-platform verification, handoff documentation, final presentation and report | Part 4 (+5 if time) | **Final deliverable + report Fri Aug 28.** Three working days. Check-in Fri 8/28 is the final delivery. |

## Fixed commitments (from the SOW)

- **Midterm deliverable:** Fri **Jul 24** — Part 1 (Core Estimation Workflow)
  verifiably complete. ✅ **Delivered.**
- **Final deliverable + report:** Fri **Aug 28**. **This has not moved and will
  not.**
- **Microsoft check-ins:** weekly, Fridays, with Jeffrey Lai, Simon Wong,
  Hariharan Ragunathan, Justin Hogaboam. **The Fri Aug 7 check-in was
  cancelled.** Remaining: **Fri 8/14, Fri 8/21, Fri 8/28.**
- **Individual effort:** 10–14 hours per developer per week.

## The week-6 re-baseline (Mon Aug 10)

Four things changed at once. Recording them here rather than only in the week-6
folder, because three of them affect weeks 7 and 8.

### 1. The Fri Aug 7 check-in was cancelled

It was moved and produced no action list. This matters more than a missed meeting
usually would: **week 5 was re-scoped mid-flight by the Fri Jul 31 POC**, and the
plan assumed the same cadence would keep steering us. It did not, so **nothing in
week 6 comes from Microsoft** — the week is entirely internally driven. The next
opportunity to get direction is **Fri Aug 14**, which lands mid-week-6.

Two questions raised in week 5 are still unanswered and should go into that
check-in whatever else is on the agenda: **what fraction of target analysts
already run an AI agent** (which determines whether the MCP track is a product or
a side door), and **whether analyst-side policy permits run data reaching a
third-party model provider** (which, if it does not, invalidates the MCP read
tools entirely). Both are in `docs/week-5/team-1/mcp-server-design.md` §9 and §11.

### 2. Microsoft asked for the project to be open-sourced

Under the **PlexTech account**. This is new, it is directional rather than
exploratory, and it is why two of week 6's three tracks exist. It also changes the
standard the remaining weeks are held to: a public repository has a public git
history, a public CI configuration, and a published JSON Schema that strangers
depend on. **`runconfig.schema.json` has been bumped twice in six weeks, once
mid-week — that habit has to end before publication, not after.**

Team 3's week-6 deliverable is the readiness assessment and the publication
runbook. **Nothing is published in week 6**; the switch is a PM and PlexTech
decision, and it is not reversible.

### 3. Week 6 is twelve days, and it absorbed the week-7 slot

Week 5's merges landed Fri Aug 7 – Sun Aug 9, and the week-6 docs published Mon
Aug 10. Rather than run a compressed three-day week, **week 6 runs Fri Aug 7 →
Tue Aug 18** with the Tue Aug 11 meeting as a mid-point checkpoint. Scope was
increased to match.

Consequently **the old week-7 row is gone and everything after it moved up**. The
table is eight weeks. The Fri Aug 28 final deliverable does not move.

### 4. The LLM interface moved to the PMs, and Team 1's track was replaced

Week 5's LLM interface work landed and is functional — two provider adapters
wired, credential entry working. **The PMs are carrying it forward from week 6**,
which freed Team 1 for the work that had been accumulating behind every feature
week and had no natural owner:

- **CI does not run on team branches.** `.github/workflows/ci.yml` triggers on
  `main` and `week-2/team-3` — a branch from week 2. This is why week 5's
  non-compiling branch went unnoticed until a human ran `tsc` by hand during
  review.
- **One high-severity advisory in the production dependency tree** (`fast-uri`,
  transitively under Ajv — the library that validates every configuration), five
  including dev dependencies.
- **`eslint` and `typescript-eslint` are installed with no config file and no
  `lint` script.** Installed on every `npm ci`, run by nobody.
- **No Content Security Policy and no navigation guards**, in an app that now
  renders content derived from LLM provider responses. Electron's own posture is
  otherwise correct — `contextIsolation`, `nodeIntegration: false`, `sandbox: true`.
- **`setup_venv.sh` deletes the existing `.venv` before it checks the Python
  version**, so on the wrong interpreter it fails after destroying what was there.
  First script a new contributor runs.

### Packaging has now been deferred three times, and week 7 is over-subscribed

Weeks 4 and 5 both named week 6 for packaging. Week 6 defers it again — by
decision, not drift, because deployment readiness and packaging are different work
and the readiness half is the prerequisite.

**That leaves packaging with one week, and week 7 as written also holds the MCP
write half and Part 3 export hardening.** That does not fit. It is recorded here
rather than discovered on Aug 25.

**The PM call to make before week 7 opens:** packaging is the only item with a
hard external dependency (the ~428 MB Python venv, and signing certificates we do
not currently have), and it is the only one that determines whether Microsoft can
run the tool at all. **The MCP write half and Part 3 export hardening are the
candidates to cut.** Both are additive; neither blocks the final deliverable.

## The week-3 swap gate (how weeks 3 and 4 merged)

The contract freeze existed so the week-3 mock→real swap would be **wiring, not
rework**. Whether week 3 stayed a pure integration week or absorbed the start of
week 4's Part-2 scope was decided by an objective gate at the **week-2 acceptance
checkpoint (Wed Jul 15 EOD)**:

1. Team 3's conformance harness green on **every** committed
   `contracts/fixtures/runconfig.*` fixture (including the failing one mapping to
   a schema-valid failed result),
2. Team 1's emitted `RunConfig` validating against the canonical schema live, and
3. Teams 1+2 verifying the agreed Results seam (`ResultsAreaProps` in
   `contracts/types.ts`) against the MockEngine — including the failure path.

**Resolution:** the gate **passed** on all three. Accordingly the week-3 folder
was published with Part 2 pulled forward: Team 3 ran the integration/swap while
Teams 1 and 2 opened Part 2 (run history + comparison UI / SQLite persistence +
Rerun) behind a frozen run-record contract. See `docs/week-3/week-3-overview.md`.

## The week-4 re-baseline (Fri Jul 24)

Week 3 shipped its own scope **and** everything the table had tabled for weeks
4–5. On `main` at the midterm: the real engine ran behind IPC as the only engine,
the SQLite store persisted every completed run automatically, History and
Comparison read that real store, and Rerun worked end to end into the live
configuration form. Typecheck and the unit suite were green (178 tests).

Two consequences:

1. **The old week-4 and week-5 rows were done**, so they were collapsed rather
   than repeated, and everything after them moved up a slot.
2. **Week 3 ran ~3 days long** (merges landed Jul 21–24), so week 4 became a short
   six-day week — Fri Jul 24 → Wed Jul 29.

Net: the calendar lost about a week; the scope gained more than that.

**Week 4 spent that buffer on correctness rather than new scope.** An audit at the
midterm found controls in the Run Configuration form the engine never saw —
benchmark hyperparameters validated and then dropped, Secondary Factory and Memory
Optimization as component-local state, and several options greyed out as "Private"
that the engine actually supported. A tool that returns the same answer when you
change a setting teaches users not to trust it, so that was fixed before anything
new was added. Week 4 also spent a full pair on documentation: after three weeks
the engine, IPC, and Python setup were understood by exactly two people.

## Delivery pattern — the standing risk

Recorded because it has been the same finding for four consecutive weeks and it
drives how weeks 6–8 are scoped.

| Week | Pattern |
|---|---|
| 2–4 | Work built and not landed. Week 4 ended with three PRs open at the deadline and a validated engine bump unmerged for three days |
| 5 | Team 1: strong document, delivered a day late on a branch with no PR, still marked DRAFT. Team 2: the hardest thinking of the summer, on a branch that **did not typecheck and failed one of its own tests**. Team 3: **one team commit**; everything graded as a functional deliverable was authored after the deadline by the PM |

Two structural responses, both live from week 6:

1. **The PMs create the team branches at kickoff**, off a current `main`. Three
   weeks running, the branch named in a definition-of-done either did not exist or
   was empty, and week 5's Team 3 branched from a pre-v1.4.0 commit and cost ~30
   hours of merge-conflict resolution. **The flow is now stated explicitly** rather
   than assumed: `main` → PM-created `week-6/team-N` → a developer-created
   `week-6/team-N-<thing>` per piece of work, which PRs into the team branch. Teams
   were committing to a feature branch and leaving the team branch empty anyway; the
   fix is to name that as the flow and put the review gate on it, not to fight it.
2. **CI must run on team branches.** It does not today; Team 1 owns fixing it in
   week 6 as a first task. Every week-5 failure above would have been visible on
   push.

A third, softer one: **week 6 asks teams to merge in pieces rather than once at
the deadline.** A team that merges four times cannot fail at the deadline.

## Still open, deliberately

- **Four contract questions from week 3** — sparse-fixture `tStatesPerRotation`,
  Majorana `operationTime` being inert, the trace transforms not being a true
  one-of, and the provisional `source` field. See
  `docs/week-3/team-3/contract-decision-proposals.md`. No PM ruling yet; no team
  works around them in a feature branch.
- **Two questions for Microsoft** — analyst agent adoption, and whether run data
  may reach a third-party model provider. Both gate the MCP track's value. Ask at
  the Fri Aug 14 check-in.
- **Three items from the PR #22 review**, all PM-owned: the Results page no longer
  showing the authoritative `result.qreVersion`; History's compare-selection and
  delete-selection being unified into one checkbox set; and
  `MEMORY_OPTIMIZATION_SECTION` copy diverging from `docs/features-and-fields.md`.
- **The `dataDir.ts` / `main.ts` disagreement** — they resolve different default
  database paths, so the CLI harness opens a different file than the app. Found
  during week-5 MCP research, still unfixed, independent of MCP.
- **Signing certificates.** We do not have an Apple Developer certificate or a
  Windows signing certificate. Whoever owns packaging in week 7 cannot produce
  signed installers without them, and acquiring them is an organizational step
  with a lead time.

## How weekly planning works

- On/before each Tuesday meeting, PMs (Davyn + Preston) publish the next week's
  folder under `docs/week-N/` with per-team checklists, definitions of done,
  technical briefs/specs, the exact due date/time for that week, and
  coordination/integration docs when that week's work needs explicit handoffs.
- From **week 3 onward**, team assignments follow a rotation format (announced
  weekly by the PMs) so every pair touches backend, frontend/UI, and UX/research
  work across the summer. **Week 6 rotates every track**, including handing each
  team the artifact another team produced in week 5. Details land in each week's
  folder — don't assume you keep last week's area.
- Each Tuesday meeting: teams checkpoint current progress as useful, then receive
  or confirm the next week's assignment and due date. Final acceptance happens at
  that week's announced deadline.
- **From week 6, every team also owes a list of what they found that the brief did
  not name.** The checklists are a floor, not a ceiling; a checklist executed
  verbatim is not the deliverable.
