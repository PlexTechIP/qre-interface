# Week 5 — Team 3 (Neil + Jessie) — Definition of Done: The Configuration Surface

The bar for **Wed Aug 5 EOD**. Demoed from `main`, not a branch.
Field names, types, ranges, defaults, and tooltip copy are graded against
**`docs/features-and-fields.md`** as it stands after the Jul 31 update.

## Functional

- [ ] **Both renames are live where the user sees them** — Total Fault Tolerant
      Execution Error, T Count Per Rotation — in the form and in the
      configuration summary. "Low Move" and "Slowdown Factor" are unchanged
- [ ] **One factory control with five options.** The word "Secondary" does not
      appear in the UI; Round-Based, Litinski19, GSJ24, Magic Up-to-Clifford and
      GSJ24 CCX are one multi-select
- [ ] **Tooltips exist on every field in the Application, QPU Specification, and
      Micro Architecture sections**, reachable by keyboard as well as hover
- [ ] **All seven Manual Logical Counts fields have tooltips**, transcribed
      verbatim. Rotation Depth is defined by the second 2026-07-31 revision, so
      there is no longer an escalation path for it
- [ ] **The *Number of Qubits* → *Logical Qubit Count* rename is live**, with
      `numQubits` untouched on the wire. *(The Ising Model (2D) rename is a
      PM-made one-line edit to `benchmarks.json`; verify it landed rather than
      applying it — that file is contract territory, and the same edit covers
      Team 2's surfaces.)*
- [ ] **The trace transform is a four-stage ordered pipeline in the UI.**
      The two optional stages are toggleable and greyed out when off. *(The
      contract, adapter, and `estimate.py` composition landed with v1.4.0 — your
      part is the controls and the labelling.)*
- [ ] **Enabling Dynamic Memory Compute from the form changes the estimate.**
      Verified end to end through the UI, not just in the engine tests: on qdk
      1.30.0 with Ising Model (2D) 3×3 the stage moves 477 qubits / 1,363,950 ns
      to 256 qubits / 1,852,200 ns
- [ ] **Unmemory is gated on Dynamic Memory Compute, not labelled recorded-only.**
      It *reverses* that stage, so an unchanged estimate with DMC off is the
      correct result rather than a dead control. Selecting Unmemory alone should
      not be reachable
- [ ] **A Dynamic Memory Compute setting with no feasible point reads as a
      failed run, not a crash** — e.g. capacity 0.25 with least-frequently-used
- [ ] **The four new QPU fields are present and selectable** — Majorana T Error
      Rate and Target Year, Neutral Atom Data Qubit Spacing and Target Year
- [ ] **Memory Optimization now reaches the engine** — `memoryOptimization` is
      present in `QreInvocation`, mapped by `configToInvocation`, and layered in
      `build_isa_query`; the old
      `expect(...).not.toContain("memoryOptimization")` assertion is inverted in
      the same commit
- [ ] **Then re-measured with Dynamic Memory Compute enabled**, and the control's
      state matches the measurement. A "no change" result is only reportable if
      the yoked code was demonstrably in the ISA query — measuring an unwired
      field proves nothing

## Validation & correctness

- [ ] **The renames changed no contract field id and no engine keyword.**
      `maxError`, `tStatesPerRotation`, `max_error`, `num_ts_per_rotation` are
      untouched — grep-checkable, and no saved record needs migrating
- [ ] **`magicStateFactories` and `secondaryFactories` are still distinct on the
      wire.** The merged control partitions by member id; union-vs-modifier
      composition in `build_isa_query` is unchanged
- [ ] **The primary set can never be emptied from the UI** — modifiers alone is
      not a reachable state
- [ ] **GSJ24 CCX ↔ CCX Magic States still move together in both directions**,
      proven by the existing test still passing
- [ ] **Magic Up-to-Clifford is still rejected under Majorana at both layers**,
      and **Majorana still admits Round-Based alone**
- [ ] **An off pipeline stage is absent from the composed query, not present at
      its defaults** — there is a test that distinguishes the two
- [ ] **Pipeline order is built from a fixed sequence**, not from iterating a set
      or an object's keys
- [ ] **No control added for Slow Down Factor** — still `const: 1`, still disabled
- [ ] **Every recorded-but-inert field is labelled as such where the user reads
      it**, in the register the Memory Optimization control already uses — and
      with the *right* reason per field: T Error Rate is **derived**, not inert,
      while both Target Years and Data Qubit Spacing are recorded-not-influential
      (technical brief § Deliverable 5 has the table)
- [ ] **Commit `6dce3ca`'s pinned-defaults test still passes and its comment was
      corrected**, in the same commit as the fields it covers — not deleted, not
      skipped. It does not fail on this change; its claim that both fields are
      "absent from the field spec" is what went stale at v1.4.0
- [ ] **The four integer-only time fields reject a fractional value in the form**
      — `gateTime`, `measurementTime`, `twoQubitGateTime`, `operationTime` are
      `integer` in the schema as of 2026-08-02, so `50.5` must surface under the
      field, not as an `INVALID_CONFIG` at Run-click
- [ ] **Tooltip copy is verbatim** from `features-and-fields.md` for every field
      where copy already exists
- [ ] **Existing behaviour is unregressed:** Superconducting, Majorana, and
      Neutral Atom runs; Manual Logical Counts; uploaded programs; the Rerun
      pre-fill path; hyperparameters still driving the estimate
- [ ] **No contract-change PR was opened by this team** — v1.4.0 came from the
      PMs at kickoff

## Quality

- [ ] Strict TypeScript; no `any` at boundaries; contract types imported from
      `app/src/shared/types.ts`, never re-declared
- [ ] Tooltips are `aria-describedby`-associated, dismissible, don't trap focus,
      and don't shift layout when opened
- [ ] The configuration surface passes a keyboard + label pass and is legible in
      both light and dark themes, tooltips included
- [ ] Visual pass against the Figma reference; deviations listed in the PR
      description rather than silently shipped
- [ ] `npm run typecheck`, `npm test`, and `npm run test:engine` green on the
      merge commit

## Documentation

- [ ] **The setup guide has been executed on a clean environment** by one of you,
      and the doc says so — who ran it, on what, and what it caught
- [ ] **A Team 1 or Team 2 developer has read the architecture doc** and
      explained back where a `RunConfig` becomes a Python invocation; the reader
      is recorded in the doc
- [ ] Both documents mirrored into Google Docs, each stamped with export date and
      source commit, and each stating **the repo `.md` is canonical**

## Process

- [ ] Team branch `week-5/team-3` created at kickoff off a `main` that already
      carries v1.4.0
- [ ] **Halfway gate honored** — an optional pipeline stage changing a real
      estimate by mid-week, or an escalation posted
- [ ] **Trotter Step ships the corrected wording** from `features-and-fields.md`,
      not the Google Doc's original — the Doc describes a step count for a field
      that is a step size
- [ ] Checklist file updated with boxes checked
- [ ] **Team branch merged to `main` by Wed Aug 5 EOD**; teammate reviews first,
      and a PM reviews the engine-adapter seam. A PR opened Wednesday evening is
      not a delivery
- [ ] Acceptance walkthrough rehearsed: renames → one factory control → tooltips
      on the manual counts → DMC on vs. off with different numbers → the four new
      QPU fields each labelled with its own reason → Memory Optimization wired,
      then measured, with the result stated

## Explicitly NOT required

- **Part 3 export hardening** — native save dialog, full-field export,
  version-tracking enforcement · **the program library**, zip/folder uploads, and
  Cirq as a fourth format · **packaging, installers, signing** (week 6) ·
  **opening a contract-change PR** — v1.4.0 is a PM deliverable, and anything
  beyond it is a conversation, not a PR · **per-benchmark analytic mappings**;
  rewriting the Q# benchmark programs · **anything in `renderer/results/` or
  `renderer/history/`**, including the renames on those surfaces (Team 2) ·
  **any agentic work** — MCP, LLM SDKs, token UI, network calls (Teams 1 and 2) ·
  **redesigning the configuration layout** — polish within the existing tokens ·
  **rewriting any tooltip copy** — it is Preston's, reviewed, and transcribed
  verbatim; a phrasing you disagree with is a channel message, not an edit
