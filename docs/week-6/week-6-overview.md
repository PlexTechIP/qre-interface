# Week 6 Overview — Everyone Inherits Someone Else's Week

**Dates:** Fri Aug 7 → Wed Aug 12, 2026
**Deliverables due:** **Wednesday Aug 12 EOD** — the Tue Aug 11 5–6pm meeting is
the checkpoint; final acceptance is Wed Aug 12 EOD, **from `main`**.
**Microsoft:** the **Fri Aug 7 check-in did not happen** — it was moved, and no
new action list came out of it. So unlike week 5, **nothing in this week comes
from Microsoft.** The two questions week 5 raised for them (§9/§11 of the MCP
design) are still unanswered and still worth asking; they are not blockers for
anything below.
**Goal:** the two agentic tracks stop being one person's week each. Team 1 takes
the LLM interface Team 2 built and makes it something you could put in front of
an analyst. Team 2 takes the MCP design Team 1 wrote and turns the first slice of
it into running code. Team 3 answers what it would take to open-source this.

> **These docs publish Mon Aug 10, four days into a six-day week.** That is a PM
> failure, not yours, and the scope below is sized for the window you actually
> have — **Mon Aug 10 → Wed Aug 12, roughly 6–9 h/person** — not for the six days
> the header names. If a track looks small this week, it is small on purpose.
> Read § Scope is smaller than you expect before you argue with it.
>
> **There is one deadline: Wed Aug 12 EOD.** No intra-week target dates. If your
> track is going to slip, say so in the channel the moment you know, not at the
> Tuesday checkpoint.

## Where the build actually is — read this before your team docs

Verified on `main` at publication (`b6a5091`). **Typecheck clean on both
projects; `npm test` green — 654 tests across 58 files.**

- **The engine is `qdk[qre]==1.30.0`**, running as a Python subprocess from the
  Electron main process behind `EstimatorService`, over typed IPC with
  `contextIsolation` on.
- **The LLM interface is real and wired.** Week 5's Team 2 branch landed, and
  the two gaps that made it inert at review time are closed:
  `registerAgentHandlers` is called from `main.ts:89` with **two** provider
  adapters (`anthropicDraftGenerator.ts`, `openAiDraftGenerator.ts`), and
  credential entry exists (`ProviderCredentialPanel.tsx`). An analyst can enter a
  key and get a draft. **This is Team 1's inheritance.**
- **The configuration surface is the most polished thing we have** — four-stage
  trace pipeline, one factory control, tooltips on every field, the four v1.4.0
  QPU fields each labelled with its own reason.
- **Preston's UI pass landed Aug 9** (PR #22, 42 files, +2,858/−1,010): the
  configuration surface reworked, comparison filters and charts chained to one
  field set, an incrementing `(n)` rerun suffix, validation issues that jump to
  their field, and a redesigned configuration summary with an Advanced details
  panel. **Read § What Preston's PR changed under you** — it touches files two of
  the three teams will open this week.
- **The MCP design document is on `main`** at
  `docs/week-5/team-1/mcp-server-design.md`, and it was substantially revised
  after review: `delete` is now out of v1, the write gate was rebuilt on
  something the server can actually enforce, and the cost estimate went from
  ~8–11 days to **~15–20**. **This is Team 2's inheritance, and that number is
  the most important fact in their week.**
- **History, Comparison, Rerun, and Markdown export all read the real store.**

## The theme: you are reading someone else's homework, and they are reading yours

Every track this week is a handoff. That is deliberate, and it is the second
reason for the rotation after the obvious one:

- **Team 1 (Sun Min + Emma)** picks up **Team 2's** LLM interface.
- **Team 2 (Melody + Rishabh)** picks up **Team 1's** MCP design.
- **Team 3 (Neil + Jessie)** starts something nobody has touched.

The week-5 briefs asked Team 1 to write a document "good enough that someone
could build from it in week 6 without asking you a question." **That bar is now
being tested for real**, by the pair who did not write it. The same is true in
the other direction: Team 2's credential module and drift test were called the
best engineering artifact of the project, and this week somebody else has to
extend them without breaking them.

**If you cannot make progress because the thing you inherited does not say
enough, that is a finding — post it in the channel and name the section.** It is
more valuable than working around it silently, and it is the single clearest
signal we can get about whether our documentation is worth what it costs.

## Scope is smaller than you expect, and that is the point

Three things happened in week 5, and they were not the same thing. Stated plainly
here because the sizing below only makes sense against them — ask a PM if you want
the detail on your own track:

| Team | What happened in week 5 |
|---|---|
| Team 1 | A genuinely strong document — delivered a day late, on a branch, with no PR, still stamped `Status: DRAFT`, written by one of the two people assigned |
| Team 2 | The hardest thinking in the week, and **the branch did not typecheck and did not pass its own tests**. Nothing merged by the deadline |
| Team 3 | **One commit** from the team. Everything graded as a functional deliverable was authored after the deadline, by the PM |

The common factor is not effort and it is not ability. **In all three cases the
work was sized for more time than existed, and the parts that got cut were the
last parts: testing, wiring, merging, and checking the boxes.**

So this week the scope is cut first, by us, before you start:

- **Team 2's track is ~15–20 dev-days of work in the design doc's own estimate.**
  You have roughly 2–3. So week 6 is **the spike, the scaffold, and one read
  tool** — and explicitly *not* the rest. Anything beyond that is a bonus, not a
  requirement.
- **Team 1's track is a fixed, enumerated list of six known defects**, not "make
  the LLM interface better." The list is in your brief and it is closed. When it
  is done, you are done.
- **Team 3's track is one document.** Same shape as week-5 Team 1: one `.md` in
  the repo, one Google Doc mirror, no source changes.

**If you finish early, say so in the channel and stop.** Do not add scope. A
complete small week beats an incomplete large one, and we have now had four
incomplete large ones.

## The testing bar, and why it is in every doc this week

Last week a branch was submitted that did not compile. This is the change:

**1. Testing is the last section of every checklist, and it is not optional.**
Every team's checklist ends with a section that is only about verifying the work.
It is last because it happens last — not because it is least important.

**2. `npm run typecheck` and `npm test` must be green on the commit you merge.**
Not on your machine an hour ago. On the commit.

> ⚠️ **`typecheck` short-circuits and will lie to you.** The script is
> `tsc -p tsconfig.json && tsc -p tsconfig.node.json`. A single renderer error
> means the main-process project **never runs**, so an error count on a red tree
> is a floor, not a total. Until that is fixed, run both halves separately when
> you are red:
>
> ```
> npx tsc --noEmit -p tsconfig.json ; npx tsc --noEmit -p tsconfig.node.json
> ```

**3. New behaviour ships with a test that fails without it.** Not "there are
tests in the repo." A test that goes red if your change is reverted.

**4. "Demonstrated" means you ran it.** Three DoD items in week 5 said
*demonstrated, not asserted*, and all three were satisfied by reading the code.
If a box says demonstrated, click through the running app and say in the PR what
you saw.

**5. Every checklist box is either ticked or annotated.** An unchecked box with
one line saying why is a good outcome and we will treat it as one — week 5's Team
2 checklist item F is the model. An unchecked box with no explanation reads as
abandoned.

## What Preston's PR changed under you

PR #22 merged to `main` on Aug 9 and touched 42 files. **Rebase onto `main`
before you do anything.** Three things in it will affect you specifically:

- **`renderer/history/comparisonModel.ts` gained `comparisonFieldDefinitions()`
  and `buildCharts()` changed signature** — it now takes `hiddenKeys`. Team 2:
  the MCP design's `qre_compare_runs` reuses this module, so read the current
  version, not the one the design doc pinned.
- **`ConfigurationSummary.tsx` and `results/ConfigSummary.tsx` now share a shape
  but not an implementation.** `components/configSummaryFields.ts` (new) and
  `results/resultFields.ts` each define their own `advancedConfigDetails`. If you
  add a field to one, the other does not learn about it.
- **`renderer/state/validation.ts` gained a `magicStateFactories` error**, and
  `normalizeFormState` no longer silently repairs an empty factory set. Team 1:
  `draftToFormState.ts` was changed in the same PR to default a model's empty set
  to `round_based` — the two halves are a pair, so read them together.

Two PM items came out of reviewing that PR and are **not yours** — they are
tracked and will be handled separately: the Results page no longer displays the
authoritative `result.qreVersion`, and History's compare-selection and
delete-selection were unified into one checkbox set.

## Contract changes this week — none

**v1.4.0 stands. Nobody opens a contract-change PR.**

This is different from weeks 4 and 5, and it is deliberate: no track below needs
a new field. Team 2's MCP work will want new *shapes* (`RunSummary`,
`ConfigDraft`) — those are TypeScript types in `app/src/shared/types.ts`, not
contract changes, and they do not touch `runconfig.schema.json` or bump
`schemaVersion`.

If you think you need a contract change, that is a conversation with the PMs, not
a PR.

## Shared context for all teams

- **Team branches already exist.** `week-6/team-1`, `week-6/team-2`, and
  `week-6/team-3` were created off `main` at `b6a5091` **by the PMs**, so that
  the week-5 failure mode — a branch that was never created, or created off a
  stale base — cannot repeat. **Work on your team branch.** Feature branches PR
  into it; it merges to `main` by **Wed Aug 12 EOD**.
- **Merged, not opened.** This is the fourth week running that this line appears,
  because it is the thing that keeps going wrong. Acceptance is **from `main`**.
  A PR opened Wednesday evening is not a delivery. If your teammate has not
  reviewed by Tuesday, say so in the channel and a PM will review it.
- **Both names on the branch.** Weeks 3, 4 and 5 each had a two-person team ship
  from one person, and it was a different person every time. Fill in the work
  split at the top of your checklist **at kickoff**, commit it, and if the split
  stops being true, change it in a commit rather than leaving it wrong.
- **Node 24.18.0 is required**, not suggested — the store uses `node:sqlite`,
  which does not exist on 22.x. `.nvmrc` pins it; run `nvm use` before `npm ci`
  in `app/`.
- **The engine is `qdk[qre]==1.30.0`.** If you rebuild your venv, expect that
  pin. **Note:** `setup_venv.sh` pins Python **3.13.14** and will delete an
  existing `.venv` before it checks — so on a machine whose `python3` is older it
  fails *after* removing what you had. Check `python3 --version` first.
- **`docs/features-and-fields.md` is the field spec and the tooltip copy.**
- **Design source — the Figma reference:**
  <https://frolicking-zabaione-b67d47.netlify.app/>. Where Figma and these docs
  disagree on layout, follow Figma and flag it.
- **Checkpoint bar:** final acceptance uses your definition-of-done doc at the
  **Wed Aug 12 EOD** deadline, from `main` — not a branch.

## What week 6 does NOT include

- **No packaging, installers, or code signing.** Weeks 4 and 5 both deferred this
  to week 6; **it is now deferred again, to week 7 or later, by decision rather
  than by drift.** It is still a real spec item and it is still unowned. Nobody
  starts it — including as "just checking whether electron-builder works."
- **No `qre_run_estimate`, and no MCP write tool of any kind.** Team 2 ships read
  tools or nothing. See their brief.
- **No LICENSE file, and no repo made public.** Team 3 researches and
  recommends; the decision is the PMs' and PlexTech's, and it is not reversible.
- **No Part 3 export hardening** — the native save dialog, full-field export, and
  version-tracking enforcement remain unowned by decision.
- **No new contract-change PRs.**
- **No redesign.** Preston's pass landed Aug 9; polish within it, and raise
  disagreements in the channel rather than reverting them.
- **No automated circuit creation** — generating Q#/OpenQASM/QIR from a prompt is
  still out, for the reasons in the week-5 Team 2 brief.
- **No program library / persisted uploads**, and no Cirq as a fourth format.

## Team docs

- `team-1/` — checklist, technical brief, definition-of-done (LLM interface)
- `team-2/` — checklist, technical brief, definition-of-done (MCP server)
- `team-3/` — checklist, technical brief, definition-of-done (open source)

Read all three of yours before writing code. The technical brief is the deep
context for your track; the checklist sequences the week; the definition-of-done
is what you are graded against on Wed Aug 12.
