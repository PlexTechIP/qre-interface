# Week 4 — Team 1 (Sun Min + Emma) — Checklist: Run Configuration

**Due: Wednesday Jul 29 EOD** — the single deadline for the week.
**Tue Jul 28** 5–6pm is the checkpoint meeting.
Read first: **the Features and Fields Google Doc** — your field spec, every type,
range, and default (it lives in the Google Doc, *not* this repo; the link is
pinned in the project channel) — then `../week-4-overview.md`,
`week-4-team-1-technical-brief.md`, and `docs/data-contracts.md` §RunConfig.
Check items off as you go (edit + commit).

Your mission in one line: **the form matches the spec, and every control in it
either drives a real estimate or is honestly labelled as recorded-only.**

**Work split — fill this in at kickoff and commit it:**

- Sun Min: _______________________
- Emma: _______________________
- Shared / pairing on: _______________________

## A. Day 0

- [ ] **Confirm `main` is current before branching.** The PMs land the week-3
      UI/UX polish merge at kickoff; wait for the go in the channel, then create
      `week-4/team-1` off `main`. Feature branches PR into it; it merges to
      `main` by **Wed Jul 29 EOD**
- [ ] `nvm use` (Node **24.18.0**), `npm ci` in `app/`, then
      `npm run typecheck && npm test` — confirm green before you change anything
- [ ] **Read the Features and Fields Google Doc end to end** (all five tabs) and
      diff it against the running app. That diff is your week — bring anything
      surprising to the channel today
- [ ] Reproduce the three defects yourself: pick a Memory Optimization and
      confirm it changes nothing; count the options greyed out as "Private";
      check that Shor's Bit Size never appears in the saved run record

## B. The qdk 1.30.0 bump — Team 3's, but you depend on it

- [ ] **Pull Team 3's 1.30.0 PR before you encode Neutral Atom defaults** in the
      contract. Rebuilding your venv mid-week is expected
- [ ] **Chase the three answers they owe you** rather than waiting for them:
      the model exports still exist (`NeutralAtom`,
      `SurfaceCodeLowMove`, `GSJ24Factory`, `GSJ24CCXFactory`,
      `MagicUpToClifford`, the Yoked codes); `QSharpApplication` still accepts a
      `LogicalCounts` as `entry_expr`; and whether Neutral Atom's 1.30.0 defaults
      still match the Google Doc's **QPU Specification** tab
- [ ] **If the bump slips or is reverted, keep going on 1.29.1** and say so in
      your PR — everything below works on either version. Don't stall

## C. The contract change — draft it early

Everything downstream waits on this. **Open one PR**; PMs review and merge.

- [ ] **Neutral Atom architecture variant** with the field set from
      the Google Doc's **QPU Specification** tab — types, ranges, and defaults
      **exactly as specified**, including both Surface Code time factors
- [ ] **Low-Move QEC** value, and the **architecture → QEC derivation extended**
      to cover it — encoded in the schema the way the existing pairing rule is,
      not just in the UI
- [ ] **Manual Logical Counts application variant** — the third `application.type`
      alongside `benchmark` and `uploaded`, carrying the seven count fields
- [ ] **Magic State Factory as a multi-select set**, with the per-architecture
      availability constraints from the spec
- [ ] **Secondary factories** as a set (empty by default); **memory
      optimization** (none / 1D yoked / 2D yoked)
- [ ] **Hyperparameters** carried on the config
- [ ] Schema + types + **version bump** in one commit; tests prove a config using
      each new value validates
- [ ] **The four deferred week-3 contract questions are NOT in this PR**
- [ ] Posted in the channel tagging both PMs when open — chase the review, it
      gates your own week

## D. Delete what the engine can't do

- [ ] **Trapped Ion** removed from `ArchitectureSection.tsx`
- [ ] **Dynamic Memory Compute** block removed from `MicroArchitectureSection.tsx`
- [ ] The four **private QEC codes** removed from the QEC options
- [ ] Nothing is rendered disabled-because-unsupported any more — if the engine
      can't run it, it's gone, not greyed

## E. Manual Logical Counts

Preston's feature. Fully specified in the Google Doc's **Application** tab, and
the engine path is already proven — see the technical brief.

- [ ] **Reproduce the PMs' result first** — build a `LogicalCounts`, pass it as
      `entry_expr`, estimate, confirm two different count sets give two different
      answers
- [ ] **Application Type is a three-way choice** — Benchmarks / Saved Programs /
      **Manual Logical Counts** — in the **Application section**
- [ ] All seven fields present, validated, and serialized: Number of Qubits,
      T Count, Rotation Count, Rotation Depth, CCZ Count, CCiX Count,
      Measurement Count
- [ ] Adapter branch in `build_application` (`estimate.py`) constructing
      `QSharpApplication(entry_expr=LogicalCounts({...}))`
- [ ] **A manual-counts run estimates end to end from the UI** and lands in
      History like any other run — demonstrated live
- [ ] **Slippage flag:** the moment you know a section will not land, post in
      the channel — do not save it for the checkpoint meeting

## F. Enable + serialize the real options

- [ ] **Neutral Atom is selectable** with its full parameter set, serialized,
      mapped through the adapter, and **producing a real estimate** — live
- [ ] **Low-Move Surface Code** pairs with Neutral Atom via the derivation rule
- [ ] **GSJ24 Factory**, **GSJ24 CCX Factory**, and **Magic Up-to-Clifford** are
      selectable and reach the engine
- [ ] **Memory Optimization** and **Secondary Factory** are serialized — no more
      `useState` that goes nowhere
- [ ] Each newly-enabled value has a test proving a config using it validates
      **and** estimates through the adapter

## G. Coupling + availability rules

- [ ] **GSJ24 CCX Factory ↔ CCX Magic States move together** in both directions
- [ ] **Magic State Factory is multi-select**, with the spec's per-architecture
      availability constraints
- [ ] **Secondary Factory is multi-select** — Magic Up-to-Clifford and GSJ24 CCX
      can both be active
- [ ] **Litinski19 availability matches the spec** (Superconducting **or**
      Neutral Atom, under their respective error-rate conditions) — the app's
      current GateBased-only rule is narrower
- [ ] **Magic Up-to-Clifford stays incompatible with Majorana** — already works
      (`MicroArchitectureSection.tsx:207`); verify it survives the refactor

## H. Hyperparameters into the config

Preston's framing: they're already there and validated — **they're just not part
of the JSON config.** That's the gap.

- [ ] Hyperparameters are **serialized into `RunConfig`** and carried through the
      adapter — `toRunConfig.ts:53` no longer drops them
- [ ] They **appear in the saved run record**, so History, Comparison, Rerun, and
      export tell the truth about what was configured
- [ ] **Honest labelling:** a benchmark hyperparameter that is recorded but does
      not yet change the estimate must not look like one that does. The bundled
      Q# programs hardcode their sizes, so serializing alone doesn't move the
      numbers
- [ ] **Per-benchmark analytic mappings are NOT this week** — don't invent
      formulas

## I. Upload checker + acceptance prep

- [ ] Pre-flight upload validation: file exists, is readable, extension matches
      the declared format, content is plausible — test against
      `app/src/main/engine/uploads/bad-sample.qasm`
- [ ] A bad file produces a **clear message in the form**, not a `COMPILE_ERROR`
      three seconds later
- [ ] Visual + keyboard pass on the Configuration surface against the **Figma**
      reference; both themes legible
- [ ] Walk through `week-4-team-1-definition-of-done.md` — every box checkable
- [ ] Acceptance walkthrough rehearsed: no dead options → a **Manual Logical
      Counts** run end to end → **Neutral Atom** run end to end →
      GSJ24 CCX toggles CCX Magic States → both secondary factories at once →
      bad upload rejected clearly → hyperparameters visible in the saved record
- [ ] `npm run typecheck && npm test && npm run test:engine` green; PR(s) merged
      to `main` by **Wed Jul 29 EOD** — acceptance from `main`, not a branch

## Blockers & escalation

- **24-hour rule:** anything blocking you for more than 24 hours goes in the
  channel, tagged to both PMs.
- **Chase the contract PR.** It gates your own week. If it isn't reviewed within
  a day of opening, say so — don't wait politely.
- **Hard gate — the halfway point:** if neither Manual Logical Counts nor Neutral
  Atom has produced a real estimate by the time you're half through the week,
  escalate rather than pushing on.
- **Below the line this week:** zip/folder uploads for Saved Programs, and Cirq
  as a fourth format. Both are real spec items — flag them for week 5, don't
  start them.
