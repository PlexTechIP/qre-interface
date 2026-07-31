# Week 4 Overview — Make the App Honest (Polish + Documentation)

**Dates:** Fri Jul 24 → Wed Jul 29, 2026
**Deliverables due:** **Wednesday Jul 29 EOD** — the Tue Jul 28 5–6pm meeting is
the checkpoint; final acceptance is Wed Jul 29 EOD, **from `main`**.
**Microsoft:** the **midterm deliverable landed Fri Jul 24** (Part 1 complete).
The next check-in, **Fri Jul 31**, falls in week 5.
**Goal:** the app *works* end to end. This week it gets **correct, complete, and
legible** — every control drives the engine, every surface reads like a finished
product, and the system is documented well enough that any developer can pick up
any part of it.

> This is a **short week** — six days. Scope is sized for ~10–14 h/person
> accordingly. **There is one deadline: Wed Jul 29 EOD.** No intra-week target
> dates — sequence the work however suits you, but if your track is going to
> slip, say so in the channel the moment you know rather than saving it for the
> checkpoint meeting.

## Where the build actually is — read this before your team docs

Week 3 delivered its own scope **and** everything the timeline had tabled for
weeks 4–5. Verified on `main` at publication (typecheck green, `npm test` green
— **178 tests across 22 files**):

- **The real engine is the only engine.** `qdk[qre]` runs as a Python subprocess
  from the Electron main process behind `EstimatorService`, over a typed IPC
  bridge with `contextIsolation` on. The `MockEngine` and the JSON fixtures were
  **deleted**, not sidelined — tests use the typed builders and the
  `fakeEstimator` double in `app/src/shared/testing/`. (We are pinned to
  **1.29.1**; **1.30.0 is the current stable** and bumping to it is Team 3's
  first task this week.)
- **Persistence is live.** SQLite `RunStore` in `app/src/main/`, reached over IPC;
  **every completed run auto-saves** as an immutable record.
- **History and Comparison read the real store** — name search, all six SOW
  filters, View Details, Delete, Export, multi-run compare, Recharts bars.
- **Rerun is end-to-end** into the live configuration form.
- **Markdown export already works** for a run *and* a comparison set — complete
  output, copy and download. **Do not rebuild it.**

So Parts 1 and 2 are done. `docs/timeline-and-milestones.md` has been
re-baselined; read the updated table, not your memory of it.

## The theme: stop showing controls that do nothing

Auditing the Configuration surface turned up a pattern worth naming, because it
shapes two of this week's three tracks:

- **Benchmark hyperparameters validate but never reach the config.** Bit Size,
  Lattice N₁/N₂, Total Time, Trotter Step, Search Qubits, Precision all exist and
  are enforced — they're just **not part of the JSON config**
  (`app/src/renderer/state/toRunConfig.ts:53` drops them by design). So a saved
  run record doesn't record what was actually configured.
- **Secondary Factory and Memory Optimization are local `useState`** in
  `MicroArchitectureSection.tsx` — never serialized, never sent anywhere.
- **Several options are greyed out as "Private" that the engine actually
  supports.** The package exports `NeutralAtom`, `SurfaceCodeLowMove`,
  `GSJ24Factory`, `GSJ24CCXFactory`, `MagicUpToClifford`, and both Yoked surface
  codes. The labels are wrong, not the engine.
- **The form is behind the spec.** The **Features and Fields Google Doc** is
  Preston's finalized field reference, and the app hasn't caught up to it — most
  visibly, **Manual Logical Counts** is a whole missing Application Type, and
  Magic State Factory should be multi-select.
- Genuinely absent from the package, and therefore deleted this week: **Trapped
  Ion**, **Dynamic Memory Compute**, and the four private QEC codes.

An analyst who changes a setting and gets the same number back learns not to
trust the tool. That is the bug we are fixing.

## Track assignments

| Team | Track | One-line mission |
|---|---|---|
| **Team 1** (Sun Min + Emma) | **Run Configuration — make every control real** | Delete what the engine can't do, add **Manual Logical Counts** as an Application Type, enable what the engine supports (**Neutral Atom**, Low-Move QEC, GSJ24 / GSJ24 CCX, Magic Up-to-Clifford, Yoked), fix the factory coupling + multi-select rules, and get hyperparameters into `RunConfig` |
| **Team 2** (Melody + Rishabh) | **Results · History · Comparison — make it read like a product** | Pareto curves per compared run, the selected frontier row driving what a run *means*, Export + Rerun on the results page, bulk delete, a real warning instead of an empty compare page, and comparison-page visual polish |
| **Team 3** | **The engine upgrade, then documentation** | Land the **qdk 1.30.0 upgrade** first (their one code task — Team 1 builds on it), then architecture documentation of the engine/IPC/store so anyone can work on them, a setup + troubleshooting guide that actually gets a new machine running, and the **agentic-integration design memo** Microsoft raised at the Jul 24 POC |

### Why this shape

Teams 1 and 2 split by **surface**, not by frontend/backend, and they share
**zero files** — Team 1 lives in `renderer/components/`, `renderer/state/`,
`renderer/constants/` and `main/engine/`; Team 2 lives in `renderer/results/`
and `renderer/history/`. Each owns its surface full-stack, so neither blocks the
other.

Team 3 rotates off code entirely. They have held the engine for three weeks and
are the only pair who can explain it; the rest of the team currently cannot
safely modify the engine, IPC, or Python setup. Documentation is the deliverable
that makes every future rotation possible — and it puts the agentic question in
front of the pair with the deepest system knowledge without pulling anyone off
the core tool.

## Contract changes this week — how they work

Team 1's track requires new `RunConfig` fields. The rule from
`docs/engineering-workflow.md` still holds, with one clarification for this week:

**The team doing the work drafts the contract change; the PMs review and merge
it.** Team 1 opens **one** contract-change PR (schema + types + version, with
the fixtures/tests that prove it) rather than editing `contracts/` inside a
feature branch. Land it early in the week — everything downstream waits on it.

Four *older* contract questions from week 3 remain **open by PM decision**
(`docs/week-3/team-3/contract-decision-proposals.md`): the sparse-fixture
`tStatesPerRotation` ruling, Majorana `operationTime` being inert, the
trace transforms not being a true one-of, and the provisional `source` field.
Those stay deferred — **don't bundle them into this week's change**, and don't
work around them in a feature branch.

## Shared context for all teams

- **Team branches:** create `week-4/team-1`, `week-4/team-2`, `week-4/team-3`
  off `main` **after** the week-3 UI/UX polish merge lands (the PMs land it at
  kickoff). Confirm in the channel that `main` is current before
  you branch. Feature branches PR into your team branch; the team branch merges
  to `main` by **Wed Jul 29 EOD**.
- **The Features and Fields Google Doc is the field spec** — Preston's finalized
  reference for every application type, architecture, field, range, and default,
  across its five tabs (Application, QPU Specification, Micro Architecture
  Settings, Run Name, Notes). **It lives in the Google Doc, not the repo — the
  link is pinned in the project channel.** It says what *should* exist;
  `docs/data-contracts.md` says how it serializes. Team 1 is graded against it;
  Teams 2 and 3 should know it exists.
- **The engine is moving to `qdk[qre]==1.30.0`** — Team 3 lands it first; Team 1
  builds on it. If you rebuild your venv mid-week, expect the new pin. No `.dev`
  builds. **This is the week's one cross-team dependency** — if it drags, Team 3
  says so in the channel immediately and Team 1 continues on 1.29.1 rather than
  stalling.
- **Node 24.18.0 is required**, not suggested — the store uses `node:sqlite`,
  which does not exist on 22.x. `.nvmrc` pins it; run `nvm use` before `npm ci`.
- **Design source — the Figma reference:**
  <https://frolicking-zabaione-b67d47.netlify.app/>. Where Figma and these docs
  disagree on layout, follow Figma and flag it.
- **Checkpoint bar:** final acceptance uses your definition-of-done doc at the
  **Wed Jul 29 EOD** deadline, from `main` — not a branch.

## What week 4 does NOT include

- **No rebuilding Markdown export.** It exists and works. Team 2 may improve
  *how it saves* and *what fields it includes*; nobody writes a new generator.
- **No packaging, installers, or code signing.** Scheduled for week 6.
- **No program library / persisted uploads.** Scheduled for week 5; the upload
  flow keeps its current session-scoped behaviour apart from Team 1's file
  checker.
- **No agentic product code.** Microsoft was explicit that developers finish the
  core tool first. Team 3 produces a **memo**, not a feature — no LLM SDKs, no
  API-token UI, no network calls added to the app.
- **No re-opening the four deferred contract decisions.**
- **No redesign.** Polish within the existing tokens and the Figma reference.

## Team docs

- `team-1/` — checklist, technical brief, definition-of-done (Run Configuration)
- `team-2/` — checklist, technical brief, definition-of-done (Results · History · Comparison)
- `team-3/` — checklist, technical brief, definition-of-done (Documentation)

Read all three of yours before writing code. The technical brief is the deep
context for your track; the checklist sequences the week; the
definition-of-done is what you are graded against on Wed Jul 29.
