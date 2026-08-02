# Week 5 — Team 3 (Neil + Jessie) — Technical Brief: The Configuration Surface

Your track: **the whole configuration surface, from the checkbox to the Python
call.** UI, form state, serializer, invocation mapper, and `estimate.py`. You own
the vertical slice, which means nothing in your week waits on another team — and
also that a regression anywhere between the form and the engine is yours.

Seven deliverables, in the order we'd do them. The first three are the Jul 31
POC asks: cheap, visible, and promised to Microsoft. The next three are the
expensive ones. The last runs alongside.

> **The whole week is graded against `docs/features-and-fields.md`.** It was
> rewritten Fri Jul 31 with Preston's new **Config Descriptions** tab and is now
> both the field spec *and* the tooltip copy. Read it end to end before you write
> anything. Where it and the Google Doc disagree, the Google Doc is newer — flag
> it in the channel and the repo copy gets fixed.

**Before you start:** v1.4.0 is a **PM deliverable landed at kickoff**, not
yours. Wait for the channel announcement, then branch off `main`. You are wiring
a contract that already exists; you are not drafting one. If you find you need a
field that isn't there, that is a channel message, not a PR.

---

## Deliverable 1 — The renames

Two labels change. Both are **display only** — contract field ids (`maxError`,
`tStatesPerRotation`) and engine keywords (`max_error`, `num_ts_per_rotation`)
stay exactly as they are, so no record migrates and no schema is touched.

| Current | New |
|---|---|
| Max Error | **Total Fault Tolerant Execution Error** |
| T States / Rotation | **T Count Per Rotation** |

"Low Move" and "Slowdown Factor" **keep their names** — see
`features-and-fields.md` § Renames for the reasoning, and don't helpfully improve
them.

> ⚠️ **The trap.** `app/src/renderer/components/MaxErrorSection.tsx` exists and
> **nothing imports it.** The live Max Error control is rendered inside
> `MicroArchitectureSection.tsx` (the `field-eyebrow` block near the bottom of
> the file, with the slider and the number input). Renaming `MaxErrorSection.tsx`
> ships nothing. Verify with `grep -rn "MaxErrorSection" app/src` — the only hits
> are the file and its own test. Delete both if you like, or leave them alone;
> just don't mistake them for the feature.

Also check `ConfigurationSummary.tsx`, which renders a `"Max Error"` row into the
configuration summary, and `app/src/renderer/constants/labels.ts` for anything
label-shaped. **Team 2 owns the same rename in export, History, and Comparison** —
stay out of `renderer/results/` and `renderer/history/`.

---

## Deliverable 2 — Merge the two factory controls into one

Today the form has **Magic State Factory** (a multi-select of three) and
**Secondary Factory** (a multi-select of two) as separate fieldsets. Microsoft
asked for one standard multi-select with all five options. The analyst should
never see the word "secondary."

**Merge the presentation. Do not flatten the semantics.** From
`app/src/main/engine/python/estimate.py`, `build_isa_query`:

```python
query = qec * build_primary_factory_query(magic_state_factories)
for secondary in secondary_factories or []:
    if secondary == "magic_up_to_clifford":
        query = query * MagicUpToClifford.q()
    elif secondary == "gsj24_ccx":
        query = query * GSJ24CCXFactory.q()
```

The first three are **unioned** into one factory query; the last two are
**multiplied onto** it as modifiers. Those are different operations, and a flat
list that loses the distinction produces a different estimate. Keep
`magicStateFactories` and `secondaryFactories` as the two contract fields they
are and partition by member id at the boundary — one control on screen, two
fields on the wire. `configToInvocation.ts` already reads both.

**Four invariants that must survive the merge.** Each of these exists today and
each has a way of quietly disappearing in a refactor:

1. **The primary set is never empty.** `togglePrimary` refuses to uncheck the
   last remaining primary. After the merge the rule is "at least one of
   Round-Based / Litinski19 / GSJ24 stays checked" — modifiers alone are not a
   valid selection, and `configToInvocation.ts` rejects an empty set with
   `INVALID_CONFIG`. Keep the guard in the UI so the user never reaches a state
   the serializer has to refuse.
2. **GSJ24 CCX ↔ CCX Magic States move together, in both directions.** Checking
   the factory turns on `traceTransform.ccxMagicStates`; toggling the flag checks
   the factory. Both directions are implemented today (`toggleSecondary` and
   `setTransform`) and both are tested. This is the single most likely regression
   in your week.
3. **Magic Up-to-Clifford is unavailable under Majorana**, enforced at two
   layers — disabled in the UI, and hard-rejected in `configToInvocation.ts`.
   Defence in depth was deliberate; keep both.
4. **Majorana admits Round-Based alone.** `configToInvocation.ts` rejects any
   other primary on Majorana. The UI's availability rules must not let a user
   check something the mapper will refuse.

Availability help text matters here. A disabled checkbox with no explanation is
its own bug — the existing `factoryHelp` string explains *why* a factory is
unselectable on the current architecture, and the merged control needs the
equivalent for all five.

---

## Deliverable 3 — Tooltips

The POC's stated priority, and the reason is worth internalising: an analyst who
cannot tell what a field means either guesses or stops trusting the tool.

**Build the mechanism once.** `Field.tsx` already takes a `help` string and
renders it as persistent text under the control. A tooltip is a different thing —
on-demand, on hover and on keyboard focus, not always-on. Add it to the shared
primitives (`Field.tsx`, `NumberField.tsx`, `RadioGroup.tsx`) so every call site
gets it from one place, rather than hand-rolling a `title` attribute per field.

Requirements, because this is an accessibility surface and a bare `title=` fails
most of them:

- Reachable by **keyboard**, not hover only.
- Associated with the control via `aria-describedby`, so a screen reader
  announces it.
- Dismissible, and it must not trap focus.
- Legible in **both themes** — use the existing tokens, no hardcoded colours.
- It must not shift layout when it opens.

**Then attach copy, in this order:**

1. **Manual Logical Counts** — the seven fields in the Application section. The
   POC called these the most confusing controls in the form, and
   `features-and-fields.md` § Manual Logical Counts says plainly that this copy
   **does not exist yet**: three fields have direction, four need drafting.
   All seven are written as of Preston's second 2026-07-31 revision — including
   *Rotation Depth*, which the first revision left open — so this is
   transcription, not drafting.
2. **Benchmark hyperparameters** — copy for all five benchmarks, new in the
   second revision.
3. **QPU Specification** — copy is written; transcribe from
   `features-and-fields.md` § QPU Specification.
4. **Micro Architecture Settings** — copy is written; same source.

**One piece of copy was corrected before it reached you.** The Google Doc's
*Trotter Step* entry reads "the number of discrete steps used to approximate the
system evolution," but the field is a float bounded above by Total Time and
defaulting to 0.9 — a step *size*. `QuantumDynamics.qs` derives the step count
from it as `ceil(totalTime / trotterStep)`. `features-and-fields.md` already
carries the corrected wording; **transcribe from there, not from the Doc**, and
Preston is mirroring the fix upstream.

Transcribe the copy **verbatim**. It is Preston's, it has been reviewed, and
improvements at this stage just make the repo and the Google Doc disagree.

---

## Deliverable 4 — The trace transform becomes a four-stage pipeline

The expensive one, and the one that changes estimates. **UI only — the backend
landed with contract v1.4.0.**

> ⚠️ **This deliverable shrank after the brief was first written.** v1.4.0 came
> with the engine half already done, so an earlier draft of this section — which
> showed a two-stage `build_trace_query` and asked you to extend it — described a
> state of the repo that no longer exists. Check the code before you plan around
> any snippet in here.

`estimate.py`'s `build_trace_query` **already** composes all four stages from a
fixed sequence, `configToInvocation` already carries both new members, and
`traceTransformV14.test.ts` already proves the stage moves a real estimate
(477 qubits / 1,363,950 ns → 256 qubits / 1,852,200 ns on Ising Model (2D) 3×3 —
the benchmark that test's comments still call "Quantum Dynamics", renamed
2026-08-02; its `id` `quantum-dynamics` is unchanged).
The full pipeline, **in this order**:

```
DynamicMemoryCompute × PSSPC × LatticeSurgery × Unmemory
```

**Do not rebuild any of that.** Your job is the controls that drive it, and the
proof that they do.

For reference when you build the inputs — verified on qdk 1.30.0 (Jul 31), field
names and defaults matching `features-and-fields.md` exactly:

- `qdk.qre.DynamicMemoryCompute(compute_capacity_percentage: float = 0.5,
  eviction_strategy: EvictionStrategy = LEAST_RECENTLY_USED)`
- `qdk.qre.Unmemory()` — no arguments
- `qdk.qre.EvictionStrategy.{LEAST_RECENTLY_USED, LEAST_FREQUENTLY_USED,
  FIRST_AVAILABLE}`

**Week 4 deleted Dynamic Memory Compute** on the grounds that it had no package
counterpart. That was true of the **1.29.1** pin the audit ran against. We are on
1.30.0 and it is there. It was restored in v1.4.0, not re-litigated.

### Three things that will bite

**An off stage is absent, not defaulted.** The one that is still genuinely yours,
and the subtle one. If Dynamic Memory Compute is off, the query must be
`PSSPC × LatticeSurgery` — *not* `DynamicMemoryCompute(0.5, LRU) × PSSPC ×
LatticeSurgery`. A stage running at its defaults is a different estimate from a
stage that isn't there. The contract and the engine already honour this
(`dynamicMemoryCompute` absent or null when off); **the form must not undo it by
always writing an object.** That is the regression this deliverable is most
likely to ship.

**The UI has to make "off" obvious.** Preston's note: the optional stages are
greyed out behind a checkbox or toggle, and their parameters only become live
when the stage is enabled. Model it on the existing CCX Magic States toggle
idiom. `Unmemory` has no parameters at all — it is on or off, and it should be
**gated on Dynamic Memory Compute being enabled**, since it reverses that stage
and has nothing to act on without it.

**Order is correctness, not style — and it is already fixed in the engine.** The
docstring in `build_trace_query` records that `PSSPC.q()` alone yields an empty
frontier and `LatticeSurgery.q() * PSSPC.q()` raises *"unsupported instruction
LATTICE_SURGERY in trace transformation 'PSSPC'"*. The composition is built from
a fixed sequence rather than from iterating a set or a dict's keys. You cannot
get this wrong from the form — just don't "simplify" it if you end up in that
function for another reason.

**Do not add a control for Slow Down Factor.** It is `const: 1` in the schema and
rendered as a disabled read-only input today. That is deliberate.

### Prove it changes something — from the UI

The engine-level proof already exists in `traceTransformV14.test.ts`. What is
**not** proven is that your controls reach it: a toggle that writes nothing, or
writes an object when it should write nothing, produces identical numbers and
looks exactly like a working feature.

So the evidence this deliverable needs is end-to-end — toggling Dynamic Memory
Compute **in the form** and running produces different numbers from the same run
with it off. Same for Unmemory (with DMC on, since it has nothing to reverse
otherwise). This is the only item in your week that can silently do nothing.

---

## Deliverable 5 — Four new QPU fields, honestly labelled

v1.4.0 adds them; you build the controls.

| Architecture | Field | Type | Default |
|---|---|---|---|
| Majorana | T Error Rate *(optional)* | float `(0, 0.05]` | derived from Error Rate |
| Majorana | Target Year *(optional)* | int `[>= 0]` | — |
| Neutral Atom | Data Qubit Spacing (µm) | float `[> 0]` | 12.0 |
| Neutral Atom | Target Year *(optional)* | int `[>= 0]` | — |

They go in `ArchitectureSection.tsx`, which already renders every QPU field
through `NumberField` — follow the existing pattern rather than inventing a new
one, and put Data Qubit Spacing after Atom Spacing to match the spec's order.

**All four are inert or derived on our path today** — and after the 2026-08-01
research against qdk 1.30.0's source, each has a *different* reason, so the
labelling should not be one copy-pasted sentence:

| Field | Why it is recorded-only | What the label should say |
|---|---|---|
| Majorana **T Error Rate** | Genuinely live if you set it — but omitted it is derived from Error Rate (1e-4 → 0.05, 1e-5 → 0.015, 1e-6 → 0.01, straight from qdk's `__post_init__`) | *Not* recorded-only. Label it "derived from Error Rate when left blank" |
| Majorana **Target Year** | Set on `MEAS_XX`/`MEAS_ZZ` as a property; no transform of ours consumes a target year | Recorded, does not affect the estimate |
| Neutral Atom **Target Year** | Set on `CZ`/`CNOT`, same story | Recorded, does not affect the estimate |
| Neutral Atom **Data Qubit Spacing** | Attached to `PHYSICAL_MOVE` as a bit-encoded property, like `atom_spacing` / `velocity` / `acceleration`; measured bit-identical across 6.0 / 12.0 / 30.0 | Recorded, does not affect the estimate |

> ⚠️ **T Error Rate's `(0, 0.05]` bound is enforced by us alone — qdk enforces
> nothing.** Measured on 1.30.0: `Majorana(error_rate=1e-5, t_error_rate=0.9)`
> and `-0.1` are both accepted and fed straight to the `T` instruction. The upper
> bound is not arbitrary: 0.05 is the highest value qdk itself ever derives (its
> docstring calls it the 5% non-Clifford error rate for the pessimistic case).
>
> **Updated 2026-08-02: "us" is now two layers, not one.** `configToInvocation`
> still range-checks it, and `estimate.py` re-checks every architecture parameter
> against a rules table transcribed from `runconfig.schema.json` before it builds
> the qdk model. So a bad value that bypasses the TypeScript guard is refused as
> `INVALID_CONFIG` naming the field, rather than producing a confident, wrong
> estimate. **Do not weaken either one**, and do not read the second as a licence
> to relax the first — the form is what stops the user reaching that state at all.

**So labelling is part of this deliverable, not a nicety.** Week 4 spent an
entire week removing controls that changed nothing while looking like they did.
Shipping four more unlabelled would undo that in an afternoon. Use the same
honest register the Memory Optimization control uses today — it says what it is
and why, in the field's own help text, where a user will actually read it.

### One extra field task, added 2026-08-02

**Four existing time inputs are now integer-only on the wire, and the form does
not know it yet.** Contract v1.4.0's follow-up typed `gateBased.gateTime`,
`measurementTime`, `twoQubitGateTime` and `majorana.operationTime` as `integer`
rather than `number` — matching `features-and-fields.md`, which has always typed
them `int [> 0]`, and matching qdk, which rejects `50.5` outright with *"'float'
object cannot be interpreted as an integer"*. `configToInvocation` now checks
`Number.isSafeInteger`, and the schema caps each at `2^53 - 1`.

`NumberField` has no `step`, so the form still accepts `50.5` into all four. That
is a **reachable state the serializer refuses** — the same defect §C's first
invariant exists to prevent, just on a different control. Give those four
`step={1}` and an integer check in `validation.ts`, so the error appears under
the field as the user types rather than as an `INVALID_CONFIG` at Run-click.

This is a genuine improvement over the old behaviour, not a regression — before
the tightening a fractional time passed the serializer and died inside qdk as an
opaque `ESTIMATION_FAILED`. It just needs the form to catch up. Neutral Atom's
time fields were already `integer` and already validated; they need `step={1}`
too if they don't have it.

**Do not quote "qdk reads it nowhere" as proof.** The estimator core is a native
extension whose binary contains both property names; the Python-level search only
shows no *Python* consumer. The measurement is the evidence, so if a future qdk
bump changes these numbers, re-measure rather than trusting the earlier search.

> ⚠️ **Commit `6dce3ca`'s pinned-defaults test — corrected 2026-08-02.** An
> earlier draft said "expect a test to fail, and let it." **It will not fail**,
> and waiting for it to is how you'd miss it.
>
> The test is *"pins the QDK NeutralAtom defaults the contract does not model"*
> in `qreEngine.test.ts`. It calls `build_architecture` on a fixture that does
> **not** set `dataQubitSpacing` or `targetYear`, then asserts qdk's own defaults
> (`12.0` and `null`) come back. Adding the form controls does not change that
> fixture, so the assertion stays green — it only fires if a qdk bump moves the
> defaults, which is still worth having.
>
> What *is* wrong is its comment: *"data_qubit_spacing and target_year are absent
> from the field spec, so the wrapper never sets them."* Both are in the spec and
> the contract as of v1.4.0, and the wrapper does set them when present. **Fix
> the comment**, in the same commit as the fields. Don't delete the test.

---

## Deliverable 6 — Wire Memory Optimization, then measure it

The most interesting item in your week, and the one with a trap in front of it.

Memory Optimization is disabled today, with this reasoning in the code and in
`features-and-fields.md`: the yoked codes only **provide** a `MEMORY`
instruction, and nothing in the pre-v1.4.0 pipeline **demanded** one. `MEMORY`
demand comes from `READ_FROM_MEMORY` / `WRITE_TO_MEMORY` trace gates — which are
emitted by `DynamicMemoryCompute`. v1.4.0 added that stage, so the demand now
exists.

### The trap: the field has never reached the engine

`memoryOptimization` appears in **no** engine file — not `configToInvocation.ts`,
not `invocation.ts`, not `estimate.py`. `memoryOptimization.test.ts` asserts it:

```ts
expect(Object.keys(result.invocation)).not.toContain("memoryOptimization")
```

So the "identical estimates" result already on record does **not** show the yoked
codes are inert. It shows they were never sent. If you enable Dynamic Memory
Compute, re-run that comparison, and see no change, you will have measured
nothing and confirmed the wrong conclusion with real numbers behind it — which is
worse than not measuring at all.

### Step 1 — wire it

This is engine work, and it is the one piece of the backend v1.4.0 did **not**
cover. Follow the pattern the secondary factories already use:

- Add `memoryOptimization?: "yoked_1d" | "yoked_2d"` to `QreInvocation` (inline
  the union, like every sibling field in that file).
- Map it in `configToInvocation` — absent **or `"none"`** means omit the key, so
  an unselected optimization stays absent all the way to Python, exactly as the
  optional trace stages do.
- Layer it in `build_isa_query`, after the factories:

  ```python
  if memory_optimization is not None:
      query = query * YOKED_CODES[memory_optimization]
  ```

  Verified on qdk 1.30.0: `OneDimensionalYokedSurfaceCode` and
  `TwoDimensionalYokedSurfaceCode` both expose `.q()` and compose exactly like
  `SurfaceCode.q()`. Resolve them by name with an explicit `ValueError`, the way
  `resolve_eviction_strategy` does — not a bare dict subscript.

**Invert the existing assertion in the same commit.** That test was written to
pin the *old* truth; leaving it green while the field now reaches the engine
would mean the suite is lying in the other direction.

### Step 2 — then measure

With the yoked code genuinely in the ISA query and Dynamic Memory Compute
enabled, compare against the same run without it. Two outcomes, both worth having
in writing:

- **It moves.** Memory Optimization is live under the new pipeline, and a
  disabled control has become functional — the same class of defect as a control
  that does nothing, in the opposite direction. Re-enable it, conditioned on
  stage 0 being on.
- **It doesn't.** The explanation finally becomes *tested* rather than assumed.
  Say so precisely: "measured on 1.30.0 with DynamicMemoryCompute enabled and the
  yoked code actually in the ISA query."

`memoryOptimization.test.ts` is where it lands. Its comment claiming
DynamicMemoryCompute was "deliberately not in our pipeline" **has already been
corrected** — the file now opens by stating that DMC *is* in the pipeline as of
v1.4.0. What has *not* changed is the assertion at the bottom
(`expect(...).not.toContain("memoryOptimization")`), which still pins the old
truth and is yours to invert.

---

## Deliverable 7 — Google Doc mirror, and the two week-4 validations

Two of the week-4 documentation DoD items are still blank and both are cheap:

- **The setup guide has never been executed on a clean environment.** It says so
  itself — "not yet; local macOS dev checkout validated only." A fresh clone, a
  different machine, or a fresh user account. Follow it literally, in order,
  without using anything you already know. Every step that fails or needs
  knowledge you didn't write down is a bug in the doc.
- **Nobody has read the architecture doc.** Ask someone from Team 1 or Team 2 to
  follow it and explain back where a `RunConfig` becomes a Python invocation. If
  they can't, it isn't done. The brief called this a five-minute test and it
  still is.

Then mirror both into Google Docs, per the Jul 31 ask.

> **Name one source canonical.** The repo `.md` is the source of truth; the
> Google Doc is a dated export of it. Put that sentence at the top of the Doc,
> with the date and the commit it was exported from. Two live copies of the same
> document is a drift problem that shows up in three weeks as two teams believing
> different things.

---

## The unschedulable item — closed

**Rotation Depth is defined.** Preston's second 2026-07-31 revision supplies the
copy: *"the maximum number of sequential rotation operations in the quantum
program. This affects the depth of the computation and estimated runtime."* The
research task and its Tue Aug 4 escalation gate are both closed.

Worth noting because it also validates something already in the contract: a
longest *sequential* chain cannot exceed the total count, which is exactly the
`0 <= rotationDepth <= rotationCount` constraint v1.1.0 encoded on a hunch.

What replaces it as the open copy question is **Trotter Step** (above) — smaller,
and it does not block anything else.

---

## Boundaries — what is NOT yours this week

| Not yours | Whose |
|---|---|
| `renderer/results/`, `renderer/history/` — including the renames on those surfaces | Team 2 |
| Anything the LLM feature touches | Team 2 |
| Opening a contract-change PR | PMs — v1.4.0 lands at kickoff |
| MCP, agentic design, LLM SDKs, network calls | Team 1 (research) / Team 2 (build) |
| Part 3 export hardening, the native save dialog, version-tracking enforcement | Nobody this week — don't start |
| Program library, zip/folder uploads, Cirq | Deferred again |
| Packaging, installers, signing | Week 6 |
| Per-benchmark analytic mappings; rewriting the Q# benchmarks | Out of scope, still |

**If you find a bug outside your surface, report it; don't fix it.** Your week is
full enough that a drive-by fix in `renderer/history/` is a merge conflict with
Team 2 for no gain.

## Quality bar

Strict TypeScript, no `any` at boundaries, contract types imported from
`app/src/shared/types.ts` and never re-declared. Every new control is keyboard
operable and legible in both themes. Tooltip copy is transcribed verbatim from
`features-and-fields.md`. Every field that is recorded but does not influence the
estimate says so where a user can see it. `npm run typecheck`, `npm test`, and
`npm run test:engine` are green on the merge commit — and the engine suite is the
one that matters this week, because it is the only thing that can tell you the
pipeline stages are real.
