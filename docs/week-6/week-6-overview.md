# Week 6 Overview — Getting Ready to Be Looked At

**Dates:** Fri Aug 7 → Tue Aug 18, 2026
**Deliverables due:** **Tuesday Aug 18 EOD** — the Tue Aug 11 5–6pm meeting is
the mid-point checkpoint; final acceptance is Tue Aug 18 EOD, **from `main`**.
**Microsoft:** the **Fri Aug 7 check-in did not happen** — it was moved, and no
new action list came out of it. But something bigger did land: **Microsoft wants
this open-sourced, under the PlexTech account.** That is now the direction, and
it is the thread running through all three tracks below.
**Goal:** stop building features for a moment and get the thing ready to be
looked at by strangers. Team 1 hardens the app and the pipeline around it. Team 2
turns the first real slice of the MCP design into running code. Team 3 answers
what has to be true before the repository can be public, and what we have to keep
doing afterwards.

> **This is a twelve-day week** — Fri Aug 7 → Tue Aug 18 — and it is the longest
> one we have had. **These docs publish Mon Aug 10**, so the working window is
> **Tue Aug 11 → Tue Aug 18**, sized for roughly **18–24 h/person**. That is
> genuinely more room than any previous week, and the scope below has been
> increased to use it.
>
> **There is one deadline: Tue Aug 18 EOD.** The Tue Aug 11 checkpoint is a
> checkpoint, not a soft deadline. **The failure mode of a long week is different
> from a short one** — see § A long week fails differently.

## Where the build actually is — read this before your team docs

Verified on `main` at publication (`b6a5091`). **Typecheck clean on both
projects; `npm test` green — 654 tests across 58 files; `npm run build`
succeeds.**

- **The engine is `qdk[qre]==1.30.0`**, running as a Python subprocess from the
  Electron main process behind `EstimatorService`, over typed IPC with
  `contextIsolation` on.
- **The LLM interface is real and wired.** Week 5's Team 2 branch landed:
  `registerAgentHandlers` is called from `main.ts:89` with two provider adapters,
  and credential entry exists. An analyst can enter a key and get a draft.
  **This is a PM track this week — see § What the PMs are doing.**
- **The configuration surface is the most polished thing we have** — four-stage
  trace pipeline, one factory control, tooltips on every field, the four v1.4.0
  QPU fields each labelled with its own reason.
- **Preston's UI pass landed Aug 9** (PR #22, 42 files, +2,858/−1,010): the
  configuration surface reworked, comparison filters and charts chained to one
  field set, an incrementing `(n)` rerun suffix, validation issues that jump to
  their field, and a redesigned configuration summary with an Advanced details
  panel. **Rebase onto `main` before you start.**
- **The MCP design document is on `main`** at
  `docs/week-5/team-1/mcp-server-design.md`, substantially revised after review:
  `delete` is out of v1, the write gate was rebuilt on something the server can
  actually enforce, and the cost estimate went from ~8–11 days to **~15–20**.
- **There is no packaging tooling of any kind** — no electron-builder, no
  electron-forge. That is deliberate this week; see § What week 6 does NOT include.

## The theme: the repo is about to have an audience

Everything on `main` was written on the assumption that the only people who would
ever read it are the eight of us. That assumption is expiring.

Open-sourcing changes what "done" means in ways that are easy to underestimate.
A public repository has a **public git history** — a key committed in week 2 is
public even if it was deleted in week 6, and no amount of later tidying undoes
it. A public CI configuration is a security surface that untrusted forks can
reach. A published JSON Schema is an API that strangers depend on, and
`runconfig.schema.json` has been bumped twice in six weeks, once mid-week. A
`README` written for someone who already sits next to you is not a README.

None of that is a reason not to do it. It is the reason two of this week's three
tracks exist, and it is why the third — the MCP server — should be built as
though someone outside this team will read it, because they will.

## Track assignments

| Team | Track | One-line mission |
|---|---|---|
| **Team 1** (Sun Min + Emma) | **Deployment readiness — security, CI, and release hygiene** | Review the app's security posture and fix what is cheap, get the CI pipeline to a state where it would actually have caught week 5, clear the dependency advisories, and close the two things that break a new contributor on day one |
| **Team 2** (Melody + Rishabh) | **MCP server — build the read half** | The concurrency spike the design names as a prerequisite, a working stdio server, five read tools, and three open items closed in writing. **No write tools.** |
| **Team 3** (Neil + Jessie) | **Open-source readiness** | What has to be true before this repository can be public under the PlexTech account, and what we have to keep doing afterwards. **One document. No code.** |

### Why this shape

**Team 1's track is the one that changed.** It was going to be the LLM interface;
the PMs have taken that. What replaced it is the work that has been quietly
accumulating behind every feature week — nobody has ever done a security pass, the
CI pipeline has not been touched since week 2, and there is a high-severity
advisory sitting in the production dependency tree right now. That work has no
natural owner during a feature week and it is exactly what "ready to go" means.

**Teams 1 and 3 are two halves of the same question, and they must not collide.**
The boundary is clean and both briefs state it:

- **Team 1 reviews the code as it stands** — Electron posture, CSP, the IPC
  surface, dependencies, CI. They may change code.
- **Team 3 reviews the repository and its history** — secrets in past commits,
  licensing, community files, governance, maintenance practices. They change
  nothing.

Both feed the same publication decision. **Talk to each other in the channel** —
Team 3's document should cite Team 1's findings, and Team 1 should tell Team 3
what they fixed so the document is not stale on the day it lands.

**Team 2 is unchanged in kind, larger in size.** More time means more read tools,
not the write tool. See their brief for why that line does not move.

**File ownership, and it is total:**

| Team | Owns |
|---|---|
| Team 1 | `.github/`, `app/package.json`, `app/eslint.config.*`, `src/main/main.ts`, `src/main/preload.ts`, `src/main/engine/python/setup_venv.sh`, plus security fixes wherever they land |
| Team 2 | The new MCP entry point and its build config, `src/main/sqliteRunStore.ts` (the WAL decision) |
| Team 3 | `docs/week-6/team-3/` — and nothing else. No source files |
| **PMs** | `src/renderer/agent/`, `src/main/agentHandler.ts`, `src/main/credential*`, `src/main/*DraftGenerator.ts`, `src/renderer/state/useRunFlow.ts` |

## What the PMs are doing this week

**The LLM interface is a PM track.** Nobody on a team touches
`renderer/agent/`, `main/agentHandler.ts`, `main/credential*`,
`main/*DraftGenerator.ts`, or `renderer/state/useRunFlow.ts`. If your work
genuinely needs a change in one of those files, say so in the channel and a PM
will make it.

Also PM-owned, and named here so nobody re-discovers them as bugs:

- **The Results page no longer shows the authoritative engine version.**
  `ResultsArea` stopped passing `result.qreVersion` to `ConfigSummary` in PR #22;
  the only version now displayed is `config.qreVersion`, which the codebase
  states twice is *not* authoritative (`RunHistoryList.tsx:213`,
  `RunHistoryFilters.tsx:88`). Known. Being fixed. Not yours.
- **History's compare-selection and delete-selection were unified** into one
  checkbox set in PR #22, replacing a separation a code comment described as
  deliberate. Known, under review as a product decision, not yours.
- **`MEMORY_OPTIMIZATION_SECTION` copy diverged from `features-and-fields.md`.**
  The tooltip was improved; the spec doc was not updated. A PM reconciles them.

If you find something else in PR #22, **that is worth reporting** — post it in the
channel. Those three are just already on the list.

## A long week fails differently

Five weeks of evidence says the same thing every time: **the work lands in the
last 36 hours, and the parts that get cut are testing, wiring, and merging.**
Weeks 2 through 5 each ended with something built and not landed, and week 5
ended with a branch that did not compile.

A twelve-day week does not fix that. It makes it worse, because the deadline is
far enough away that Wednesday feels early. So:

**1. The Tue Aug 11 checkpoint is a real gate.** Come to it with something
running, however small. "I have read the design" is not a checkpoint state on day
five of twelve.

**2. Merge in pieces.** You have a long window and three teams with almost no file
overlap — there is no reason for one merge on Aug 18. Land the first coherent
piece as soon as it is green. **A team that merges four times this week is a team
that cannot fail at the deadline.**

**3. Scope was increased on purpose. It can be decreased on request.** Every
brief marks which items are required and which flex. If you are behind on
Thursday Aug 13, say so and we will cut the flexible half — that is a good
outcome and it will be treated as one. What is not a good outcome is discovering
it on the 18th.

## The testing bar

Last week a branch was submitted that did not compile. This is what changes:

**1. Testing is the last section of every checklist, and it is not optional.**
Every team's checklist ends with a section that is only about verifying the work.
It is last because it happens last — not because it is least important.

**2. `npm run typecheck` and `npm test` must be green on the commit you merge.**
Not on your machine an hour ago. On the commit.

> ⚠️ **The `typecheck` script short-circuits and will lie to you.** It is
> `tsc -p tsconfig.json && tsc -p tsconfig.node.json`. A single renderer error
> means the main-process project **never runs**, so an error count on a red tree
> is a floor, not a total. Run both halves separately when you are red:
>
> ```
> npx tsc --noEmit -p tsconfig.json ; npx tsc --noEmit -p tsconfig.node.json
> ```
>
> CI already sidesteps this by running them as two steps. Your terminal does not.
> **Team 1 owns fixing it.**

**3. New behaviour ships with a test that fails without it.** Not "there are tests
in the repo." A test that goes red if your change is reverted — verified by
actually reverting one.

**4. "Demonstrated" means you ran it.** Three DoD items in week 5 said
*demonstrated, not asserted*, and all three were satisfied by reading code. If a
box says demonstrated, click through the running app and say in the PR what you
saw.

**5. Every checklist box is either ticked or annotated.** An unchecked box with
one line saying why is a good outcome and will be treated as one — week 5's Team 2
checklist item F is the model. An unchecked box with no explanation reads as
abandoned.

**6. Review your own diff before you ask anyone else to.** Read it top to bottom
as though someone else wrote it. Then your teammate reviews it. Both, every merge
— not just the big one.

## The list is a floor, not a ceiling

Some of you are handing these documents to a coding agent and having it work
through the checklist. **That is fine and we are not asking you to stop.** It is a
reasonable way to work and the checklists are written well enough to be executed
that way.

But a checklist executed verbatim is not engineering, and it is not what we are
grading. **The items we wrote down are the ones the PMs could find from the
outside, in an afternoon, without running the app.** You are inside it for two
weeks. If nothing turns up that we missed, the most likely explanation is that
nobody looked.

So, for **Teams 1 and 2**, there is an additional required deliverable:

> **Go looking for what is not on your list. Write down what you found.
> Implement the ones that are safe and in scope; file the rest.**

Concretely, that means:

- **A written list**, in your PR or your team's write-up, of everything you found
  that we did not name — bugs, security risks, missing features, rough edges,
  things that would embarrass us in a public repository.
- **What you did about each one**: fixed, filed, or deliberately left with a
  reason.
- **Empty is an acceptable answer**, but it has to be an argued one. "We looked at
  X, Y and Z and found nothing" is a finding. Silence is not.

**If you are using an agent, point it at this too.** Ask it what else it would
change and why, then use your own judgment on the answer — you are accountable for
what lands, not it. An agent is very good at "find everything wrong with this
file" and that is exactly the prompt nobody is running.

**Two guardrails, because "find more work" is how weeks get lost:**

1. **The required list comes first.** Discovery does not justify an unfinished
   deliverable. If you are behind, the extra work is the first thing to cut and
   the list of what you *found* still ships.
2. **Implementing is bounded by your boundaries.** Team 2's write-tool line does
   not move because you found a good reason for one. Nothing in a PM-owned file
   gets touched. When in doubt, file it and say so.

Team 3 has the same instruction in the form their track allows: their brief
already says to report anything they find rather than fix it, and week 5 proved
that reading a codebase closely is the best bug detector we have.

## Contract changes this week — none

**v1.4.0 stands. Nobody opens a contract-change PR.**

Team 2's MCP work will want new *shapes* (`RunSummary`, `ConfigDraft`) — those are
TypeScript types in `app/src/shared/types.ts`, not contract changes, and they do
not touch `runconfig.schema.json` or bump `schemaVersion`.

This matters more than usual now. **Once the repo is public, the schema is an API
that strangers depend on**, and the habit of bumping it mid-week has to end before
that happens rather than after. Team 3's document should say what the versioning
discipline becomes.

## Shared context for all teams

- **Team branches already exist.** `week-6/team-1`, `week-6/team-2`, and
  `week-6/team-3` were created off `main` at `b6a5091` **by the PMs**, so that the
  week-5 failure mode — a branch that was never created, or created off a stale
  base — cannot repeat.
- **Branch flow, stated once and unambiguously**, because three weeks running the
  team branch sat empty while the work lived somewhere else:

  ```
  main
   └── week-6/team-N              ← PM-created. You do NOT commit here directly.
        └── week-6/team-N-<thing> ← YOU create one per piece of work. Commit here.
  ```

  **Every piece of work gets its own branch off your team branch**, named
  `week-6/team-N-<short-thing>` — e.g. `week-6/team-1-ci-triggers`,
  `week-6/team-2-concurrency-spike`, `week-6/team-3-license-audit`. It PRs into
  your team branch, **your teammate reviews it there**, and the team branch merges
  to `main` by **Tue Aug 18 EOD**.

  Two reasons this is the flow rather than committing straight to the team branch:
  it is where "your teammate reviews every merge" actually happens, and it is what
  makes "merge in pieces" real instead of aspirational.

  **Keep the `week-6/` prefix.** Once Team 1 fixes the CI triggers to match
  `week-6/**`, correctly-named feature branches get CI automatically and
  differently-named ones silently do not.
- **CI does not currently run on your branch.** `.github/workflows/ci.yml`
  triggers on `main` and `week-2/team-3` only. That is a real gap and it is why
  week 5's red branch went unnoticed — **Team 1 is fixing it as a first task.**
  Until they do, run the suite locally before you push.
- **Merged, not opened.** Fourth week running that this line appears, because it
  is the thing that keeps going wrong. Acceptance is **from `main`**. A PR opened
  Tuesday evening is not a delivery.
- **Both names on the branch.** Weeks 3, 4 and 5 each had a two-person team ship
  from one person, and it was a different person every time. Fill in the work
  split at the top of your checklist **at kickoff**, commit it, and if the split
  stops being true, change it in a commit rather than leaving it wrong.
- **Node 24.18.0 is required**, not suggested — the store uses `node:sqlite`,
  which does not exist on 22.x. `.nvmrc` pins it; run `nvm use` before `npm ci`
  in `app/`.
- **The engine is `qdk[qre]==1.30.0`.** **Warning:** `setup_venv.sh` pins Python
  **3.13.14** and deletes an existing `.venv` *before* it checks the version — so
  on an older interpreter it fails after destroying what you had. Check
  `python3 --version` first. **Team 1 is fixing this.**
- **`docs/features-and-fields.md` is the field spec and the tooltip copy.**
- **Design source — the Figma reference:**
  <https://frolicking-zabaione-b67d47.netlify.app/>.
- **Checkpoint bar:** final acceptance uses your definition-of-done doc at the
  **Tue Aug 18 EOD** deadline, from `main` — not a branch.

## What week 6 does NOT include

- **No packaging, installers, or code signing.** Weeks 4 and 5 both deferred this
  to week 6; **it is deferred again, to week 7 or later, by decision.** "Deployment
  readiness" this week means the codebase and the pipeline are ready — not that an
  installer exists. Team 1 does not add electron-builder. Nobody starts it,
  including as "just checking whether it works."
- **No LLM interface work by any team.** It is a PM track this week.
- **No `qre_run_estimate`, and no MCP write tool of any kind.** Team 2 ships read
  tools or nothing.
- **No LICENSE file, no community files, and no repo made public.** Team 3
  researches and recommends; the decision and the irreversible action are the PMs'
  and PlexTech's.
- **No Part 3 export hardening** — native save dialog, full-field export,
  version-tracking enforcement.
- **No new contract-change PRs.**
- **No redesign.** Preston's pass landed Aug 9; polish within it, and raise
  disagreements in the channel rather than reverting them.
- **No automated circuit creation**, no program library, no Cirq as a fourth
  format.

## Team docs

- `team-1/` — checklist, technical brief, definition-of-done (deployment readiness)
- `team-2/` — checklist, technical brief, definition-of-done (MCP server)
- `team-3/` — checklist, technical brief, definition-of-done (open source)

Read all three of yours before writing code. The technical brief is the deep
context for your track; the checklist sequences the week; the definition-of-done
is what you are graded against on Tue Aug 18.
