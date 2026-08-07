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

---

> ## Status — completed 2026-08-06 on `week-4/team-3` (PR #19)
>
> §B–§G are done and verified: `npm run typecheck`, `npm test` and
> `npm run test:engine` are all green.
>
> **The items still unchecked below, and why:**
>
> | Item | Why it is open |
> |---|---|
> | §A channel go-ahead · §B Team 2 rename confirmation | Channel coordination, not repo work |
> | §E "Proof it works from the UI" | Proven through the serializer and the engine — `buildTraceTransform` → `estimate.py` — and the numbers move (477 q / 1,363,950 ns → 256 / 1,852,200). **Not** yet driven by clicking the running app; that is the one verification step left |
> | §E halfway gate | Overtaken — the stage landed working |
> | §G "Prove it is actually in the query" | **Re-opened 2026-08-07.** What landed proves the id reaches the invocation JSON, not the ISA qdk executes. Needs a machine with the qdk venv to introspect the query object — see below |
> | §G "If it moves" / "If it doesn't" | The estimate does **not** move, but that is *consistent with* inert rather than proof of it while the item above is open. Both branches stay unchecked |
> | §H clean-environment setup run · architecture-doc reader · Google Doc mirror | Need a second machine and a second human; cannot be done from the repo |
> | §I Figma visual pass · acceptance walkthrough | Need the running app in front of a person |
> | §I merged to `main` | The PR is ready; merging is the PM's call |
>
> ### Review follow-ups applied 2026-08-07
>
> A code review of this branch found fourteen defects; all are fixed on it. The
> two worth knowing about before merge:
>
> 1. **§G was over-claimed.** "Measured, not assumed" was shipped in the Memory
>    Optimization help text, in `features-and-fields.md` and in this file, on
>    evidence that does not support it: an unchanged estimate is equally
>    predicted by the yoked code never landing in the query at all, since
>    `build_qec` fixes the QEC before the yoked transform is multiplied in after
>    the factories. All three now read "consistent with", and the checklist item
>    is re-opened above. **This is the one thing to finish before the claim can
>    be made again.**
> 2. **The §B renames were half-applied.** `resultFields.ts` still said "Max
>    Error" and "T States / Rotation", so the app showed two names for each
>    field. Now renamed there too — display only, contract ids untouched. This
>    overlaps Team 2's Results/History/Comparison territory: flag it in the
>    channel rather than letting both halves land twice.
>
> The rest were local: an unvalidated `memoryOptimization` reaching Python, a
> tooltip that could not be dismissed by keyboard once opened by hover, dangling
> `aria-describedby` targets, an ungreyed disabled Unmemory switch, a misplaced
> `aria-describedby` on `RadioGroup`, dead copy and dead components, and one
> assertion-free test. `MaxErrorSection.tsx` and its test are **deleted** — §B
> called it out as imported by nothing, and it had been kept in step with the
> live control by hand.
>
> **Branch note:** this work is on `week-4/team-3` (PR #19) rather than a fresh
> `week-5/team-3`, at the PM's explicit instruction, with local `main` merged in
> first. §A's branch item is therefore superseded rather than met.

## A. Day 0

- [ ] **Wait for the channel go-ahead** confirming the week-4 audit branch **and
      contract v1.4.0** are on `main`, then create `week-5/team-3` off `main`.
      Feature branches PR into it; it merges to `main` by **Wed Aug 5 EOD**
- [x] `nvm use` (Node **24.18.0**), `npm ci` in `app/`, then
      `npm run typecheck && npm test && npm run test:engine` — green before you
      change anything. The engine suite needs the venv on `qdk[qre]==1.30.0`
- [x] **Read `docs/features-and-fields.md` end to end** and diff it against the
      running app. That diff is your week
- [x] Confirm the v1.4.0 fields exist as you expect: `traceTransform`'s two new
      members, and the four new QPU fields. If anything is missing or shaped
      differently than the brief says, channel message today — do not hand-edit
      `contracts/`

## B. The renames (do these first — cheap and visible)

- [x] **Max Error → Total Fault Tolerant Execution Error** everywhere it renders
- [x] **T States / Rotation → T Count Per Rotation**
- [x] **"Low Move" and "Slowdown Factor" are unchanged** — confirm you didn't
      improve them
- [x] **Contract field ids and engine keywords are untouched** — `maxError`,
      `tStatesPerRotation`, `max_error`, `num_ts_per_rotation`. Grep-check
- [x] **You renamed the live control, not the dead one.** The Max Error slider
      lives in `MicroArchitectureSection.tsx`; `MaxErrorSection.tsx` is imported
      by nothing. Verify with `grep -rn "MaxErrorSection" app/src`.
      **2026-08-07:** the rename was applied to *both*, which is how a dead
      component stays looking alive. `MaxErrorSection.tsx` and its test are now
      deleted; the grep returns nothing outside these docs
- [x] `ConfigurationSummary.tsx` and `constants/labels.ts` updated to match
- [ ] **Team 2 owns the same rename on Results / History / Comparison / export** —
      confirm in the channel that both halves are landing this week
- [x] **Do NOT apply the *Quantum Dynamics → Ising Model (2D)* rename yourself —
      it landed 2026-08-02.** Verify it; don't re-implement it. The form
      (`ApplicationSection.tsx:250`) and History/Comparison
      (`historyLabels.ts:46`) both read `benchmarks.json`'s `name` via
      `staticOptions.ts`, so every user-visible surface came from that one field.
      **It also touched `main/engine/benchmarkRegistry.ts`**, which mirrors the
      name and is pinned by `benchmarkRegistry.test.ts` — that is a PM edit in
      your territory, so rebase before you touch that file. The benchmark `id`
      is unchanged, so no record migrates
- [x] **Do NOT apply *Number of Qubits → Logical Qubit Count* to the contract** —
      `numQubits` stays. It is a label in `ApplicationSection.tsx` and
      `validation.ts`, and those are yours

## C. One factory control

- [x] **A single multi-select with all five options** — Round-Based, Litinski19,
      GSJ24, Magic Up-to-Clifford, GSJ24 CCX. The word "Secondary" is gone from
      the UI
- [x] `magicStateFactories` and `secondaryFactories` are **still two contract
      fields**, partitioned by member id at the boundary — union vs. modifier is
      a real difference in `build_isa_query`
- [x] **At least one of Round-Based / Litinski19 / GSJ24 always stays checked** —
      modifiers alone is not a reachable state
- [x] **GSJ24 CCX ↔ CCX Magic States still move together in both directions** —
      the existing test still passes
- [x] **Magic Up-to-Clifford still unavailable under Majorana**, at both the UI
      and `configToInvocation` layers
- [x] **Majorana still admits Round-Based alone**
- [x] Help text explains why an unavailable option is unavailable — for all five

## D. Tooltips

- [x] **Mechanism first**, in the shared primitives (`Field.tsx`,
      `NumberField.tsx`, `RadioGroup.tsx`) — not a `title=` per call site
- [x] Keyboard reachable, `aria-describedby`-associated, dismissible, no focus
      trap, no layout shift, legible in both themes
- [x] **Manual Logical Counts first** — the POC's stated priority. Preston's
      second 2026-07-31 revision supplies copy for **all seven**, so this is
      transcription, not drafting. Rotation Depth is settled: *"the maximum
      number of sequential rotation operations in the quantum program"*
- [x] **Benchmark hyperparameter** tooltips — all five benchmarks now have copy
- [x] **QPU Specification** tooltips — transcribed **verbatim** from
      `features-and-fields.md`
- [x] **Micro Architecture Settings** tooltips — transcribed verbatim
- [x] **Trotter Step ships the corrected copy from `features-and-fields.md`**,
      not the Google Doc's original — the Doc calls it "the number of discrete
      steps," but `QuantumDynamics.qs` derives the step count as
      `ceil(totalTime / trotterStep)`, so the field is a step *size*. **Ship the
      corrected wording regardless of whether Preston has replied** — the repo
      copy is correct and reviewed, and a tooltip that misstates a field by an
      order of magnitude is worse than one awaiting sign-off. If he later prefers
      different phrasing, that is a one-line follow-up

## E. The four-stage trace pipeline — UI only

> **The backend for this landed with contract v1.4.0.** `build_trace_query`
> already composes `DynamicMemoryCompute × PSSPC × LatticeSurgery × Unmemory`
> from a fixed sequence, `configToInvocation` already carries both stages, and
> `traceTransformV14.test.ts` proves Dynamic Memory Compute moves a real
> estimate (477 qubits / 1,363,950 ns → 256 qubits / 1,852,200 ns on Ising
> Model (2D) 3×3). **Do not rebuild any of that.** Your job here is the controls.
>
> This fence is about the **trace pipeline only**. §G is genuine engine work —
> `memoryOptimization` was never wired, and v1.4.0 did not cover it.

- [x] Dynamic Memory Compute's two parameters exposed: Compute Capacity
      Percentage (float `(0, 1.0]`, default 0.5) and Eviction Strategy (LRU /
      LFU / First Available, default LRU)
- [x] Unmemory is a bare on/off with no parameters, **gated on Dynamic Memory
      Compute being enabled** — it reverses that stage, so on its own it has
      nothing to act on
- [x] Both optional stages **greyed out behind a toggle**; parameters only live
      when the stage is enabled
- [x] **Off means the field is absent from the config, not present at its
      defaults.** The contract and engine already honour this — the form must
      not undo it by always writing an object
- [x] **No control added for Slow Down Factor** — it is `const: 1` and stays
      disabled
- [x] **Unmemory is NOT labelled recorded-only** — it reverses Dynamic Memory
      Compute, so an unchanged estimate with DMC off is correct behaviour, not a
      dead control. Gate it instead
- [ ] **Proof it works from the UI:** toggling Dynamic Memory Compute on in the
      form and running produces different numbers from the same run with it off
- [ ] **Halfway gate:** if the form cannot yet drive a changed estimate through
      the pipeline by the time you're half through the week, escalate rather
      than pushing on

## F. Four new QPU fields

- [x] Majorana **T Error Rate** (float `(0, 0.05]`, derived from Error Rate) and
      **Target Year** (int `[>= 0]`)
- [x] Neutral Atom **Data Qubit Spacing** (float `[> 0]`, default 12.0, placed
      after Atom Spacing) and **Target Year**
- [x] Built with the existing `NumberField` pattern in `ArchitectureSection.tsx`
- [x] **Each labelled with its own reason, not one copy-pasted sentence** — the
      four differ. See the table in the technical brief § Deliverable 5:
      **T Error Rate** is *derived*, not inert (label it "derived from Error Rate
      when left blank"); **both Target Years** and **Data Qubit Spacing** are
      recorded but do not affect the estimate
- [x] **T Error Rate's `(0, 0.05]` bound is enforced only by us** — qdk accepts
      0.9 and -0.1 without complaint. As of 2026-08-02 "us" is two layers:
      `configToInvocation` **and** `estimate.py`'s rules table. Don't loosen
      either
- [x] **The four time fields are integer-only now** — `gateTime`,
      `measurementTime`, `twoQubitGateTime`, `operationTime` are `integer` in the
      schema and checked with `Number.isSafeInteger`. `NumberField` has no
      `step`, so the form still accepts `50.5`. Add `step={1}` + an integer check
      in `validation.ts` so it fails under the field, not at Run-click
- [x] **Commit `6dce3ca`'s pinned-defaults test — fix its COMMENT**, in the same
      commit as the fields. It will **not** fail (its fixture doesn't set the new
      fields, so qdk's defaults still come back); an earlier draft of the brief
      said to expect a failure and that was wrong. The comment claiming both
      fields are "absent from the field spec" is what's stale. Don't delete it

## G. Memory Optimization — wire it, THEN measure

> ⚠️ **You cannot measure this until you wire it.** `memoryOptimization` reaches
> the engine nowhere today — not `configToInvocation.ts`, not `invocation.ts`,
> not `estimate.py`. `memoryOptimization.test.ts` asserts exactly that. So the
> "identical estimates" result already on record is **not** evidence the yoked
> codes do nothing; it is evidence they were never sent. Measuring first and
> reporting "no change" would confidently confirm the wrong thing.
>
> This is engine work, and it is yours this week — the one part of §E's "backend
> already landed" that v1.4.0 did **not** cover.

- [x] **Wire it, following the secondary-factory pattern:** add
      `memoryOptimization` to `QreInvocation`, map it in `configToInvocation`
      (absent / `"none"` ⇒ omit), and layer it in `build_isa_query` —
      `query = query * TwoDimensionalYokedSurfaceCode.q()`. Verified on qdk
      1.30.0: `OneDimensionalYokedSurfaceCode` and
      `TwoDimensionalYokedSurfaceCode`, both exposing `.q()`
- [ ] **Prove it is actually in the query** before trusting any estimate — the
      existing `expect(...).not.toContain("memoryOptimization")` assertion must
      now be inverted, deliberately, in the same commit.
      **Re-opened 2026-08-07.** The inversion landed, but it asserts on the
      *invocation JSON*, which is one layer short of what this item asks for. The
      remaining step is to introspect the object `build_isa_query` returns, with
      and without `memory_optimization`, and show the yoked code is in it —
      needs a machine with the qdk venv
- [x] **Then** measure: with Dynamic Memory Compute enabled, run a yoked surface
      code and record whether the estimate moves
- [ ] **If it moves:** re-enable the control, conditioned on stage 0 being on
- [ ] **If it doesn't:** the explanation finally becomes *tested* rather than
      assumed — say "measured on 1.30.0 with DynamicMemoryCompute enabled and the
      yoked code actually in the ISA query".
      **Unchecked again 2026-08-07:** that sentence was shipped, and its last
      clause is the part not established — see the item above. The estimate does
      not move, which is *consistent with* inertness; the copy in
      `MicroArchitectureSection.tsx`, `memoryOptimization.test.ts` and
      `features-and-fields.md` now says exactly that and no more. Check this box
      when the query-level proof lands
- [x] Either way the measurement lands in `memoryOptimization.test.ts`. Its
      DynamicMemoryCompute comment **has already been corrected** — the file now
      states DMC *is* in the pipeline as of v1.4.0. The `not.toContain` assertion
      at the bottom is the part still pinning the old truth

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
- [x] Walk through `week-5-team-3-definition-of-done.md` — every box checkable
- [ ] Acceptance walkthrough rehearsed: renamed labels → one factory control with
      five options → GSJ24 CCX still toggles CCX Magic States → tooltips on the
      manual counts → DMC on vs. off giving different numbers → the four new QPU
      fields each labelled with **its own** reason (T Error Rate *derived*; both
      Target Years and Data Qubit Spacing *recorded, not influential*) → Memory
      Optimization wired, then measured, with the result stated
- [ ] `npm run typecheck && npm test && npm run test:engine` green; **merged to
      `main` by Wed Aug 5 EOD** — acceptance from `main`, not a branch

## Blockers & escalation

- **24-hour rule:** anything blocking you for more than 24 hours goes in the
  channel, tagged to both PMs.
- **No copy questions remain open, and none gates you.** Rotation Depth is
  defined by Preston's second 2026-07-31 revision; Trotter Step was settled
  against `QuantumDynamics.qs` on 2026-08-01 and the corrected wording is in
  `features-and-fields.md`. Ship from the repo copy. Preston mirroring it into
  the Google Doc is a PM follow-up, not a dependency of yours.
- **§G grew.** Memory Optimization now includes the engine wiring, because the
  field never reached the estimator and the measurement is meaningless without
  it. It is still the last thing to give if the week runs short — but if you cut
  it, cut *both* halves and say so, rather than measuring an unwired field and
  reporting a result.
- **If v1.4.0 isn't on `main` when you start, don't hand-edit `contracts/`** —
  post in the channel and start on §B, §C, and §D, none of which need it.
- **Merged, not opened.** If your teammate hasn't reviewed by Tuesday, say so and
  a PM will review it. Three PRs open at the deadline is how week 4 went.
- **Below the line this week:** program library, zip/folder uploads, Cirq, export
  hardening, packaging. Flag them; don't start them.
