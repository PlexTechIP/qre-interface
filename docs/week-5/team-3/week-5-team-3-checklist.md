# Week 5 — Team 3 (Neil + Jessie) — Checklist: The Configuration Surface

**Due: Wednesday Aug 5 EOD** — the single deadline for the week.
**Tue Aug 4** 5–6pm is the checkpoint meeting.
Read first: **`docs/features-and-fields.md`** — rewritten Fri Jul 31 with
Preston's Config Descriptions tab; it is your field spec *and* your tooltip copy —
then `../week-5-overview.md` and `week-5-team-3-technical-brief.md`.
Check items off as you go (edit + commit).

Your mission in one line: **every control on the configuration surface says what
it means, and the trace transform is the pipeline qdk actually runs.**

**This is the biggest single-team scope of the summer.** The sections below are
in priority order. If something has to give, it gives from the bottom — §F and §G
before §A–§C. Say so in the channel rather than deciding silently.

**Work split — fill this in at kickoff and commit it:**

- Neil: _______________________
- Jessie: _______________________
- Shared / pairing on: _______________________

## A. Day 0

- [ ] **Wait for the channel go-ahead** confirming the week-4 audit branch **and
      contract v1.4.0** are on `main`, then create `week-5/team-3` off `main`.
      Feature branches PR into it; it merges to `main` by **Wed Aug 5 EOD**
- [ ] `nvm use` (Node **24.18.0**), `npm ci` in `app/`, then
      `npm run typecheck && npm test && npm run test:engine` — green before you
      change anything. The engine suite needs the venv on `qdk[qre]==1.30.0`
- [ ] **Read `docs/features-and-fields.md` end to end** and diff it against the
      running app. That diff is your week
- [ ] Confirm the v1.4.0 fields exist as you expect: `traceTransform`'s two new
      members, and the four new QPU fields. If anything is missing or shaped
      differently than the brief says, channel message today — do not hand-edit
      `contracts/`

## B. The renames (do these first — cheap and visible)

- [ ] **Max Error → Total Fault Tolerant Execution Error** everywhere it renders
- [ ] **T States / Rotation → T Count Per Rotation**
- [ ] **"Low Move" and "Slowdown Factor" are unchanged** — confirm you didn't
      improve them
- [ ] **Contract field ids and engine keywords are untouched** — `maxError`,
      `tStatesPerRotation`, `max_error`, `num_ts_per_rotation`. Grep-check
- [ ] **You renamed the live control, not the dead one.** The Max Error slider
      lives in `MicroArchitectureSection.tsx`; `MaxErrorSection.tsx` is imported
      by nothing. Verify with `grep -rn "MaxErrorSection" app/src`
- [ ] `ConfigurationSummary.tsx` and `constants/labels.ts` updated to match
- [ ] **Team 2 owns the same rename on Results / History / Comparison / export** —
      confirm in the channel that both halves are landing this week

## C. One factory control

- [ ] **A single multi-select with all five options** — Round-Based, Litinski19,
      GSJ24, Magic Up-to-Clifford, GSJ24 CCX. The word "Secondary" is gone from
      the UI
- [ ] `magicStateFactories` and `secondaryFactories` are **still two contract
      fields**, partitioned by member id at the boundary — union vs. modifier is
      a real difference in `build_isa_query`
- [ ] **At least one of Round-Based / Litinski19 / GSJ24 always stays checked** —
      modifiers alone is not a reachable state
- [ ] **GSJ24 CCX ↔ CCX Magic States still move together in both directions** —
      the existing test still passes
- [ ] **Magic Up-to-Clifford still unavailable under Majorana**, at both the UI
      and `configToInvocation` layers
- [ ] **Majorana still admits Round-Based alone**
- [ ] Help text explains why an unavailable option is unavailable — for all five

## D. Tooltips

- [ ] **Mechanism first**, in the shared primitives (`Field.tsx`,
      `NumberField.tsx`, `RadioGroup.tsx`) — not a `title=` per call site
- [ ] Keyboard reachable, `aria-describedby`-associated, dismissible, no focus
      trap, no layout shift, legible in both themes
- [ ] **Manual Logical Counts first** — the POC's stated priority. Copy for these
      seven has to be **drafted**, not transcribed
  - [ ] Rotation Count — "the analog value of a rotation"; one analog rotation may
        translate to a multiple (like 15) of the T count
  - [ ] Measurement Count — brief explanation despite reading as redundant
  - [ ] Rotation Depth — **research item, see § Blockers**
  - [ ] Number of Qubits, T Count, CCZ Count, CCiX Count — drafted
- [ ] **QPU Specification** tooltips — transcribed **verbatim** from
      `features-and-fields.md`
- [ ] **Micro Architecture Settings** tooltips — transcribed verbatim

## E. The four-stage trace pipeline

- [ ] `build_trace_query` composes
      **`DynamicMemoryCompute × PSSPC × LatticeSurgery × Unmemory`**, in that
      order, built from a fixed sequence — never from iteration over a set
- [ ] **An off stage is absent from the product, not present at its defaults** —
      DMC off means the query is exactly `PSSPC × LatticeSurgery`
- [ ] Dynamic Memory Compute's two parameters wired: Compute Capacity Percentage
      (float `(0, 1.0]`, default 0.5) and Eviction Strategy (LRU / LFU / First
      Available, default LRU)
- [ ] Unmemory is on/off with no parameters
- [ ] Both optional stages **greyed out behind a toggle** in the UI; parameters
      only live when the stage is enabled
- [ ] **No control added for Slow Down Factor** — it is `const: 1` and stays
      disabled
- [ ] **Proof it works:** a run with Dynamic Memory Compute on produces a
      *different estimate* from the same run with it off, with real numbers, in
      `npm run test:engine`. Same for Unmemory
- [ ] **Halfway gate:** if neither optional stage has changed an estimate by the
      time you're half through the week, escalate rather than pushing on

## F. Four new QPU fields

- [ ] Majorana **T Error Rate** (float `(0, 0.05]`, derived from Error Rate) and
      **Target Year** (int `[>= 0]`)
- [ ] Neutral Atom **Data Qubit Spacing** (float `[> 0]`, default 12.0, placed
      after Atom Spacing) and **Target Year**
- [ ] Built with the existing `NumberField` pattern in `ArchitectureSection.tsx`
- [ ] **Every one of them labelled recorded-only** where the user can see it —
      all four are inert or derived on our path today
- [ ] **Commit `6dce3ca`'s pinned-defaults test updated deliberately**, in the
      same commit as the field, with a note. It was built to fail on exactly this
      change — don't delete it, don't skip it

## G. Memory Optimization, re-measured

- [ ] With Dynamic Memory Compute enabled, run a yoked surface code and record
      whether the estimate moves
- [ ] **If it moves:** re-enable the control, conditioned on stage 0 being on
- [ ] **If it doesn't:** sharpen the existing explanation to say "measured on
      1.30.0 with DynamicMemoryCompute enabled"
- [ ] Either way the measurement lands in `memoryOptimization.test.ts`

## H. Docs — the two blank validations, then the mirror

- [ ] **Run the setup guide on a clean environment** — fresh clone, different
      machine, or fresh user account. Follow it literally. Fix what fails, and
      record that you ran it and where
- [ ] **Get a real reader** for the architecture doc — someone from Team 1 or
      Team 2 explains back where a `RunConfig` becomes a Python invocation.
      Record who
- [ ] Mirror both into Google Docs, each stamped with its export date and source
      commit, and stating that **the repo `.md` is canonical**

## I. Acceptance prep

- [ ] Keyboard + label pass across the whole configuration surface; both themes
- [ ] Visual pass against the **Figma** reference; deviations listed in the PR
- [ ] Walk through `week-5-team-3-definition-of-done.md` — every box checkable
- [ ] Acceptance walkthrough rehearsed: renamed labels → one factory control with
      five options → GSJ24 CCX still toggles CCX Magic States → tooltips on the
      manual counts → DMC on vs. off giving different numbers → four new QPU
      fields labelled recorded-only → Memory Optimization measurement stated
- [ ] `npm run typecheck && npm test && npm run test:engine` green; **merged to
      `main` by Wed Aug 5 EOD** — acceptance from `main`, not a branch

## Blockers & escalation

- **24-hour rule:** anything blocking you for more than 24 hours goes in the
  channel, tagged to both PMs.
- **Rotation Depth is the one item that may not resolve.** If the QDK docs don't
  settle what it measures by the **Tue Aug 4** checkpoint, escalate. Ship the
  other six tooltips and leave that one out rather than inventing a definition an
  analyst will rely on.
- **If v1.4.0 isn't on `main` when you start, don't hand-edit `contracts/`** —
  post in the channel and start on §B, §C, and §D, none of which need it.
- **Merged, not opened.** If your teammate hasn't reviewed by Tuesday, say so and
  a PM will review it. Three PRs open at the deadline is how week 4 went.
- **Below the line this week:** program library, zip/folder uploads, Cirq, export
  hardening, packaging. Flag them; don't start them.
