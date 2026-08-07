# Week 5 Overview — The Config Surface Lands, and Agentic Gets Real

**Dates:** Fri Jul 31 → Wed Aug 5, 2026
**Deliverables due:** **Wednesday Aug 5 EOD** — the Tue Aug 4 5–6pm meeting is
the checkpoint; final acceptance is Wed Aug 5 EOD, **from `main`**.
**Microsoft:** the **Fri Jul 31 POC/check-in produced a concrete UI and
terminology action list** — that list is Team 3's week, and it is the first time
this summer that a Microsoft ask has come back as specific field-level feedback.
The next check-in, **Fri Aug 7**, falls in week 6.
**Goal:** the configuration surface says what it means and does what it says —
correct terminology, a tooltip on every field an analyst could misread, one
factory control instead of two, and the trace transform modelled as the pipeline
qdk actually runs. In parallel, the agentic stretch goal stops being a memo and
becomes one research track and one working feature.

> This is a **six-day week** — Fri Jul 31 → Wed Aug 5 — sized for ~10–14 h/person.
> **There is one deadline: Wed Aug 5 EOD.** No intra-week target dates; sequence
> the work however suits you. If your track is going to slip, say so in the
> channel the moment you know, not at the checkpoint meeting.

## Where the build actually is — read this before your team docs

Parts 1 and 2 are complete and hardened. Verified on `main` at publication:

- **The engine is `qdk[qre]==1.30.0`**, running as a Python subprocess from the
  Electron main process behind `EstimatorService`, over typed IPC with
  `contextIsolation` on.
- **The week-4 gaps are closed.** Pareto curves per compared run, the compare
  threshold guard, Magic State Factory as a multi-select set, upload pre-flight
  in the form, benchmark hyperparameters genuinely driving the estimate, Majorana
  `operationTime` mapped, and Memory Optimization honestly marked unavailable
  rather than silently inert.
- **The trace transform is already modelled as a pipeline, not a choice** — the
  contract carries each stage's parameters and the engine composes
  `PSSPC.q() * LatticeSurgery.q()` on every estimate.
- **Contract is at v1.3.0.** The PMs land **v1.4.0 at kickoff** — see § Contract
  changes below. It is a PM deliverable this week, not a team task.
- **History, Comparison, Rerun, and Markdown export all read the real store.**

`docs/features-and-fields.md` was updated **Fri Jul 31** with Preston's new
**Config Descriptions** tab. It is the field spec *and* now the tooltip copy.
Read it before you read your team docs.

## The theme: the POC gave us a list, and it is bigger than it looks

Three of the Jul 31 items are cheap and visible — tooltips, two renames, and
merging two factory controls into one. Two are not:

- **The trace transform gains two optional stages.** `DynamicMemoryCompute` and
  `Unmemory` both exist on qdk 1.30.0 (verified — see the Team 3 brief), so the
  full pipeline becomes
  `DynamicMemoryCompute × PSSPC × LatticeSurgery × Unmemory`, in that order.
  Week 4 deleted Dynamic Memory Compute as absent from the package; that was true
  of the 1.29.1 pin it was audited against, and it is wrong now.
- **Four QPU fields come back** that a 7/30 ruling had explicitly closed. All
  four are inert or derived on our path, which makes *labelling* them part of the
  job rather than an afterthought.

There is also a second-order effect nobody asked about: Memory Optimization is
disabled today **because** nothing in the pipeline demands a `MEMORY`
instruction, and `DynamicMemoryCompute` is precisely what emits that demand. If
stage 0 ships, the yoked codes may become live. That has to be measured in the
same week, not discovered in week 7.

## Track assignments

| Team | Track | One-line mission |
|---|---|---|
| **Team 1** (Sun Min + Emma) | **MCP server — research and design** | Answer what it would actually mean to expose this app to an analyst's existing agent: tool surface, process model, the SQLite question nobody has asked, and the security model. **Documentation only — no code.** |
| **Team 2** (Melody + Rishabh) | **LLM interface — bring your own API key** | Build the natural-language → draft-configuration feature. Design and placement are yours. The key never touches the renderer, and the model produces drafts a human still has to run. |
| **Team 3** (Neil + Jessie) | **The configuration surface, end to end** | The whole Jul 31 POC list — tooltips, renames, the merged factory control, the four-stage trace pipeline, the four new QPU fields — plus contract wiring, engine adapter, and the Google Doc mirror of the QRE docs. UI *and* backend. |

### Why this shape

**Team 3 owns a vertical slice, deliberately.** They have the form, the form
state, the serializer, the invocation mapper, and `estimate.py` — everything from
the checkbox to the Python call. That is more surface area than any pair has held
this summer, and it is the point: the alternative was splitting the POC list
across two teams, which would have put two pairs in
`MicroArchitectureSection.tsx` for a week and made every item wait on someone
else's merge. Nobody waits on anybody this week.

**Teams 1 and 2 take the two halves of the agentic question** that Microsoft
raised at the Jul 24 POC. They are complements, not competitors: Team 1 asks
"what if the analyst's agent drives our app," Team 2 builds "what if our app
drives a model." Neither blocks the other and they share no files.

**File ownership, and it is total:**

| Team | Owns |
|---|---|
| Team 1 | `docs/week-5/team-1/` — and nothing else. No source files. |
| Team 2 | `app/src/renderer/results/`, `app/src/renderer/history/`, plus the new files their feature needs |
| Team 3 | `app/src/renderer/components/`, `app/src/renderer/state/`, `app/src/renderer/constants/`, `app/src/main/engine/` |

The one string both Teams 2 and 3 touch is the renamed labels — Team 3 in the
configuration form, Team 2 in export, History, and Comparison. Neither edits the
other's files; both read the same source. See § Renames.

## Contract changes this week — the PMs land v1.4.0 at kickoff

Different from week 4. **The PMs write and merge the contract change before you
branch.** Team 3's week depends on those fields existing, and a mid-week contract
PR behind a review gate is exactly the sequencing failure that cost week 4.

v1.4.0 carries:

- **`traceTransform.dynamicMemoryCompute`** — absent or null when the stage is
  off; `{ computeCapacityPercentage, evictionStrategy }` when on.
- **`traceTransform.unmemory`** — boolean, default false.
- **Four QPU fields** — Majorana `tErrorRate` and `targetYear`, Neutral Atom
  `dataQubitSpacing` and `targetYear`, all optional.
- **Run provenance** — a field recording that a model influenced a run, for
  Team 2. `RunConfig` is `additionalProperties: false`, so this cannot be added
  later without another bump.

**Wait for the channel announcement that v1.4.0 is on `main` before branching.**
If you branch early, rebase; don't hand-edit `contracts/`.

Nobody else opens a contract-change PR this week. If you think you need one, that
is a conversation with the PMs, not a PR.

## Renames — one source, two surfaces

From the Jul 31 POC, and recorded in
[`docs/features-and-fields.md` § Renames](../features-and-fields.md):

| Current label | New label |
|---|---|
| Max Error | **Total Fault Tolerant Execution Error** |
| T States / Rotation | **T Count Per Rotation** |
| Low Move (Surface Code) | *unchanged* — stays "Low Move," to match the QDK code base |
| Slowdown Factor | *unchanged* |

**These are display labels only.** The contract field ids (`maxError`,
`tStatesPerRotation`) and the engine keywords (`max_error`,
`num_ts_per_rotation`) do not change, so no saved record needs migrating and no
schema edit is implied.

Labels render on more surfaces than the form: Markdown export, the Comparison
table, and History all use them. **Team 3 does the configuration form; Team 2
does export, History, and Comparison.** They land in the same week or the export
disagrees with the screen.

## Shared context for all teams

- **Team branches:** wait for the channel go-ahead confirming the week-4 audit
  branch **and** v1.4.0 are on `main`, then create `week-5/team-1`,
  `week-5/team-2`, `week-5/team-3` off `main`. Feature branches PR into your team
  branch; the team branch merges to `main` by **Wed Aug 5 EOD**.
- **Merged, not opened.** Week 4's recurring failure was work that was finished
  and not landed — three PRs open at the deadline, a validated engine bump sitting
  unmerged for three days. Acceptance is **from `main`**. A PR opened Wednesday
  evening is not a delivery. If your teammate has not reviewed by Tuesday, say so
  in the channel and a PM will review it.
- **`docs/features-and-fields.md` is the field spec and the tooltip copy.** It
  was rewritten Jul 31 and now carries the Config Descriptions tab verbatim. Where
  it and the Google Doc disagree, the Google Doc is newer — say so in the channel
  and the repo copy gets fixed.
- **Node 24.18.0 is required**, not suggested — the store uses `node:sqlite`,
  which does not exist on 22.x. `.nvmrc` pins it; run `nvm use` before `npm ci`
  in `app/`.
- **The engine is `qdk[qre]==1.30.0`.** If you rebuild your venv, expect that
  pin. No `.dev` builds.
- **Design source — the Figma reference:**
  <https://frolicking-zabaione-b67d47.netlify.app/>. Where Figma and these docs
  disagree on layout, follow Figma and flag it.
- **Checkpoint bar:** final acceptance uses your definition-of-done doc at the
  **Wed Aug 5 EOD** deadline, from `main` — not a branch.

## What week 5 does NOT include

- **No packaging, installers, or code signing.** Week 6.
- **No program library / persisted uploads** — zip and folder inputs for Saved
  Programs, and Cirq as a fourth format. Still real spec items, still deferred.
- **No Part 3 export hardening** — the native save dialog, full-field export, and
  version-tracking enforcement are unowned this week by decision, not oversight.
  Nobody starts them.
- **No new contract-change PRs** beyond the PM-landed v1.4.0.
- **No redesign.** Polish within the existing tokens and the Figma reference.
- **No per-benchmark analytic mappings**, and no rewriting the Q# benchmarks.
- **No MCP implementation.** Team 1 produces a design document. If it argues for
  a prototype, that is a week-6+ conversation.

## Team docs

- `team-1/` — checklist, technical brief, definition-of-done (MCP research)
- `team-2/` — checklist, technical brief, definition-of-done (LLM interface)
- `team-3/` — checklist, technical brief, definition-of-done (config surface)

Read all three of yours before writing code. The technical brief is the deep
context for your track; the checklist sequences the week; the definition-of-done
is what you are graded against on Wed Aug 5.
