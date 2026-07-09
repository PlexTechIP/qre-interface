# Week 2 — Team 1 (Sun Min + Emma) — Definition of Done: Run Dashboard (Configuration UI)

The bar for Wednesday Jul 15 EOD.

## Functional

- [ ] All **seven** inputs configurable in the UI: application
      (benchmark selection over the five named benchmarks **+ upload with
      format choice and "Add Program"**), physical architecture (GateBased /
      Majorana with that type's validated fields), error correction code
      (derived display), magic state factory (with availability rule), trace
      transform (with sub-fields), max error, run name (optional,
      auto-generated when blank) — plus the read-only QRE version display
- [ ] **Defaults path:** from app open — pick a benchmark, enter the two
      required time fields, Run — in under a minute without reading any
      external doc
- [ ] Clicking **Run** produces a `RunConfig` that **validates against
      `contracts/runconfig.schema.json`** — shown live (dev inspector,
      logged object, or test)
- [ ] The config is submitted through `EstimatorService.run()` against the
      **MockEngine you built to the brief's spec** — the UI never imports
      engine/fixture internals
- [ ] Running state shown while pending; every finished result (success *and*
      failure) is delivered at the Team-2 seam as the canonical
      `ResultsAreaProps` from `contracts/types.ts` — `phase: "done"` + the
      `RunResult` + the producing config (a stub/debug render of the seam is
      fine this week)
- [ ] Mock failure (the committed `runresult.failed.json`) flows through that
      same seam, and your surrounding chrome offers a way forward (**Retry** /
      **Edit configuration**). Rendering the error *content* is Team 2's job —
      you do not build a failure display beyond the debug view

## Validation & correctness

- [ ] Run is disabled while the config is invalid; every invalid field shows
      an inline reason
- [ ] Numeric bounds enforced with helpful messages: GateBased error rate
      (0, 0.01) exclusive; gate/measurement times required and > 0; Majorana
      error rate one of 1e-4/1e-5/1e-6; operation time > 0; T states per
      rotation 5–20; **max error (0, 1] — note 1.0 is valid** (non-numeric
      input rejected everywhere)
- [ ] **Conditional rules enforced with explanation** (per
      `docs/data-contracts.md` §Validation rules): QEC code always matches
      the architecture (Surface Code / Three-Aux, shown not chosen);
      Litinski19 selectable only for GateBased with error rate ≤ 1e-3 and
      visibly falls back to Round-Based (with reason) when conditions break;
      transform sub-fields swap with the transform type
- [ ] `toRunConfig` (state → contract serialization) has unit tests covering:
      defaults, each input changed, both architecture variants, both
      transform variants, upload variant, invalid states never serializing
- [ ] `id` (UUID) and `createdAt` (UTC ISO 8601) stamped correctly at Run
      time; blank name auto-generates deterministically from the config

## Quality

- [ ] Strict TypeScript; contract types imported from `contracts/types.ts` —
      copied verbatim until the scaffold wires it, never re-declared
- [ ] Visual pass matches the merged reference design (deviations listed in
      review notes)
- [ ] Form fully keyboard-navigable, including the conditional sections
- [ ] Static options (benchmark list and any fixed choice sets) isolated in
      one constants module marked for later replacement

## Process

- [ ] Team branch `week-2/team-1` created Day 0; all feature PRs target it
- [ ] Team branch merged to `main` via reviewed PR by Wed Jul 15 EOD
- [ ] Checklist file updated with boxes checked
- [ ] Acceptance walkthrough prepared: defaults path → expert path →
      validation → run with mock → failure path

## Explicitly NOT required

- Real engine integration (week 3) · results rendering beyond a stub (Team 2)
  · persistence/history/Rerun (Part 2 — includes persisting "Add Program"
  uploads across restarts; in-memory is fine) · parsing/validating uploaded
  program *contents* (engine's job — your UI handles file pick + format +
  emitting the variant) · cancel/progress streaming (week 3+)
