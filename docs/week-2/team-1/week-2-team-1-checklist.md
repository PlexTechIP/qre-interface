# Week 2 — Team 1 (Sun Min + Emma) — Checklist: Run Dashboard (Configuration UI)

**Due: Wednesday Jul 15 EOD** — 
Read first: `../week-2-overview.md`, `week-2-team-1-technical-brief.md`,
`docs/data-contracts.md`. Check items off as you go (edit + commit).

## A. Day 0

- [ ] **Create your team branch** `week-2/team-1` off `main` — all your
      feature branches PR into it; it merges to `main` by Wed Jul 15 EOD
      (`docs/engineering-workflow.md`)
- [ ] Attend Tuesday meeting; note which mockup elements were selected for the
      merged reference design (PMs post the reference Figma link)
- [ ] Read `docs/data-contracts.md` **v1** end-to-end (seven inputs +
      conditional rules) and your technical brief; raise anything surprising
      in the channel **today**. Use the committed `contracts/` artifacts
      (schema, `types.ts`, `benchmarks.json`, fixtures)
- [ ] Pull the app scaffold (PMs land it at the start of the week) — if it's
      not merged by Wed, start components in a bare Vite React+TS app,
      structured to move into `app/src/renderer/` later, and say so in the
      channel

## B. Foundations

- [ ] Define the form's state model: one source of truth that serializes to a
      contract-conformant `RunConfig` (see technical brief §State model);
      contract types imported from `contracts/types.ts`, never re-declared
- [ ] Build the **`MockEngine implements EstimatorService`** to the technical
      brief's spec (schema-validates via Ajv, ~2s delay, success/failed modes
      returning the committed fixtures, stamps `runId = config.id`) — the UI
      talks only to the `EstimatorService` interface
- [ ] Static options in place for week 2: the five named benchmarks from
      `contracts/benchmarks.json` in one constants module — see technical
      brief §The seven inputs

## C. The seven inputs

- [ ] **Application** — benchmark selector (searchable list with
      descriptions) over the five benchmarks, **plus the upload path**: file
      picker, format selection (Q# / OpenQASM / QIR), and the "Add Program"
      affordance that adds the upload to the benchmark list (in-memory this
      week; persistence is Part 2/3)
- [ ] **Physical Architecture** — GateBased/Majorana type toggle revealing
      only that type's fields, each validated per the brief's table
      (GateBased: error rate 0<x<0.01, required gate + measurement times >0,
      optional two-qubit gate time; Majorana: error-rate select
      1e-4/1e-5/1e-6, operation time >0) with in-place explanations
- [ ] **Error Correction Code** — derived display (GateBased → Surface Code;
      Majorana → Three-Aux) with a one-line why; never a free choice
- [ ] **Magic State Factory** — Round-Based / Litinski19 radio; Litinski19
      auto-disables (with reason) unless GateBased **and** error rate ≤ 1e-3,
      falling back to Round-Based visibly, never silently
- [ ] **Trace Transform** — PSSPC (T states per rotation 5–20 default 20;
      CCX magic states toggle) vs. Lattice Surgery (slowdown factor shown
      fixed at 1.0); sub-fields swap with the type
- [ ] **Max Error** — numeric input, validated (0 < x ≤ 1, default 1.0), with
      helper text: it's a *cap* on total error; 1.0 means unconstrained
- [ ] **Run Name** — optional; blank auto-generates from the config and the
      generated name is visible before Run. (QRE version stays displayed
      read-only from a constant.)

## D. Behavior

- [ ] Validation: Run disabled until config is valid (including all three
      conditional rules — QEC coupling, Litinski19 availability, transform
      sub-fields); every invalid field explains *why* inline
- [ ] **Run flow:** click Run → serialized `RunConfig` (log it / show it in a
      dev inspector) → `EstimatorService.run(config)` (mock) → running state →
      result arrives → delivered to the Results seam as the canonical
      `ResultsAreaProps` (`contracts/types.ts`): `phase: "done"` + the
      `RunResult` + the producing config
- [ ] Failure path: MockEngine's failed mode returns the committed
      `runresult.failed.json` → the failed result flows through the same seam
      (Team 2's surface renders the error content; this week a debug render at
      the seam is fine) and your chrome offers **Retry** / **Edit
      configuration**
- [ ] Defaults path: a fresh user picks a benchmark, enters the two required
      time fields (the only inputs without defaults), and hits Run — in <1
      minute
- [ ] Unit tests: state-model → `RunConfig` serialization covers every input
      + conditional rule; validates against `contracts/runconfig.schema.json`

## E. Polish + acceptance prep

- [ ] Visual pass against the reference design
- [ ] Walk through `week-2-team-1-definition-of-done.md` — every box checkable
- [ ] Prepare the acceptance walkthrough: defaults path, expert path,
      validation, run flow with mock, failure path
- [ ] PR(s) merged to `main` by Wed Jul 15 EOD — final acceptance from `main`,
      not a branch