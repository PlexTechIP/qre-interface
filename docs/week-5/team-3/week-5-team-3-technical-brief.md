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
   - *Rotation Count* — "the analog value of a rotation"; one analog rotation may
     translate to a multiple (like 15) of the T count.
   - *Measurement Count* — needs a brief explanation even though it reads as
     redundant.
   - *Rotation Depth* — **nobody knows.** See § The one unschedulable item.
2. **QPU Specification** — copy is written; transcribe from
   `features-and-fields.md` § QPU Specification.
3. **Micro Architecture Settings** — copy is written; same source.

Transcribe the copy **verbatim**. It is Preston's, it has been reviewed, and
improvements at this stage just make the repo and the Google Doc disagree.

---

## Deliverable 4 — The trace transform becomes a four-stage pipeline

The expensive one, and the one that changes estimates.

Today the contract models the transform as the two-stage pipeline qdk actually
runs, and `estimate.py`'s `build_trace_query` composes it:

```python
return PSSPC.q(
    num_ts_per_rotation=trace_transform["tStatesPerRotation"],
    ccx_magic_states=trace_transform["ccxMagicStates"],
) * LatticeSurgery.q(slow_down_factor=trace_transform["slowDownFactor"])
```

Two optional stages join it. The full pipeline, **in this order**:

```
DynamicMemoryCompute × PSSPC × LatticeSurgery × Unmemory
```

**Verified on qdk 1.30.0** (Jul 31), so you don't have to re-derive it:

- `qdk.qre.DynamicMemoryCompute(compute_capacity_percentage: float = 0.5,
  eviction_strategy: EvictionStrategy = LEAST_RECENTLY_USED)`
- `qdk.qre.Unmemory()` — no arguments
- `qdk.qre.EvictionStrategy.{LEAST_RECENTLY_USED, LEAST_FREQUENTLY_USED,
  FIRST_AVAILABLE}`

Field names and defaults match `features-and-fields.md` exactly.

**Week 4 deleted Dynamic Memory Compute** on the grounds that it had no package
counterpart. That was true of the **1.29.1** pin the audit ran against. We are on
1.30.0 and it is there. You are restoring it, not re-litigating it.

### Three things that will bite

**Order is correctness, not style.** The existing docstring in `build_trace_query`
records that `PSSPC.q()` alone yields an empty frontier and
`LatticeSurgery.q() * PSSPC.q()` raises *"unsupported instruction LATTICE_SURGERY
in trace transformation 'PSSPC'"*. The pipeline fails loudly when composed
wrongly, which is good news — but it means the composition has to be built from a
fixed order, never from iteration over a set or an object's key order.

**An off stage is absent, not defaulted.** This is the subtle one, and it is
called out explicitly in the source doc. If Dynamic Memory Compute is off, the
query must be `PSSPC × LatticeSurgery` — *not*
`DynamicMemoryCompute(0.5, LRU) × PSSPC × LatticeSurgery`. A stage running at its
defaults is a different estimate from a stage that isn't there. The v1.4.0
contract encodes this by making `dynamicMemoryCompute` absent or null when off;
your serializer and your adapter both have to honour that rather than filling in
defaults on the way through.

**The UI has to make "off" obvious.** Preston's note: the optional stages are
greyed out behind a checkbox or toggle, and their parameters only become live
when the stage is enabled. Model it on the existing CCX Magic States toggle
idiom. `Unmemory` has no parameters at all — it is on or off.

**Do not add a control for Slow Down Factor.** It is `const: 1` in the schema and
rendered as a disabled read-only input today. That is deliberate.

### Prove it changes something

The reason this deliverable is expensive is that it is the only item in your week
that can silently do nothing. A run with Dynamic Memory Compute enabled must
produce a **different estimate** from the same run with it off, demonstrated with
real numbers, or the stage isn't wired. Same for Unmemory. `npm run test:engine`
is where that evidence belongs.

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

**All four are inert or derived on our path today.** Both Target Years are marked
"inert atm" in the source doc — they need a trace transform that consumes a
target year, and ours doesn't. Data Qubit Spacing measured bit-identical across
6.0 / 12.0 / 30.0 on a real Neutral Atom run. T Error Rate is auto-derived from
Error Rate unless overridden.

**So labelling is part of this deliverable, not a nicety.** Week 4 spent an
entire week removing controls that changed nothing while looking like they did.
Shipping four more unlabelled would undo that in an afternoon. Use the same
honest register the Memory Optimization control uses today — it says what it is
and why, in the field's own help text, where a user will actually read it.

> ⚠️ **Expect a test to fail, and let it.** Commit `6dce3ca` pins the QDK
> `NeutralAtom` defaults *we deliberately don't model* — including
> `data_qubit_spacing`. It exists so that the day we start modelling them, it
> fails loudly. That day is this week. Update it deliberately, in the same commit
> as the field, with a note saying why. Don't delete it and don't skip it.

---

## Deliverable 6 — Re-measure Memory Optimization once stage 0 exists

Nobody asked for this and it is the most interesting finding available to you.

Memory Optimization is disabled today, with this reasoning in the code and in
`features-and-fields.md`: the yoked codes only **provide** a `MEMORY`
instruction, and nothing in the current pipeline **demands** one. `MEMORY` demand
comes from `READ_FROM_MEMORY` / `WRITE_TO_MEMORY` trace gates — which are emitted
by `DynamicMemoryCompute`.

You are about to add `DynamicMemoryCompute`.

So: once stage 0 works, run a yoked surface code with it enabled and see whether
the estimate moves. Two possible outcomes, both worth having in writing:

- **It moves.** Memory Optimization is live under the new pipeline, and a
  disabled control has become functional — which is the same class of defect as a
  control that does nothing, in the opposite direction. Re-enable it, conditioned
  on stage 0 being on.
- **It doesn't.** The current explanation gets sharper, and the code comment
  should say "measured on 1.30.0 with DynamicMemoryCompute enabled" instead of
  what it says now.

Either way it is a measurement, and `memoryOptimization.test.ts` already exists
as the place to record it.

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

## The one unschedulable item

**Rotation Depth.** Nobody can write that tooltip yet — the POC action list says
in as many words that the QDK documentation needs checking to establish what it
actually measures.

Treat it as research, not transcription:

- The contract already encodes `0 <= rotationDepth <= rotationCount`, which is a
  useful constraint and **not** a definition.
- The seven Manual Logical Counts fields map 1:1 onto `LogicalCounts` keys, so
  the QDK's own documentation for that type is the place to start.
- **If the docs don't settle it by the Tue Aug 4 checkpoint, escalate.** Ship the
  other six tooltips and leave Rotation Depth without one rather than inventing a
  definition an analyst will rely on. A missing tooltip is a gap; a wrong one is a
  wrong number in somebody's report.

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
