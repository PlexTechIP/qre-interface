# QRE Dashboard — Features + Fields Reference

> Source: Preston's Google Doc "QRE Dashboard Features + Fields" (6 tabs:
> Application, QPU Specification, Micro Architecture Settings, Run Name,
> Notes, and **Config Descriptions** — added 2026-07-31), transcribed verbatim
> into Markdown for coding-agent reference.
> This is a **field/feature spec**, not the frozen data contract — see
> `data-contracts.md` for the canonical `RunConfig`/`RunResult` JSON shapes.
> If the two disagree, `data-contracts.md` wins for wire format; this doc
> is the source for what fields/ranges/defaults *should* exist.
>
> **The Config Descriptions tab (2026-07-31) is the tooltip copy** — the
> per-field "Tooltip copy" tables below are transcribed from it verbatim and are
> the text to render on hover. That same update added four QPU fields, merged
> Secondary Factory into Magic State Factory, extended the trace transform to a
> four-stage ordered pipeline, and renamed Max Error. Each of those **reverses a
> ruling recorded earlier**; the reversals are flagged inline where they land.

## Reading this doc

Each field is listed as:

```
Field Name
type [constraints]
Default=value
```

`int`/`float`/`bool`/`string` types and bracketed constraints (e.g. `[>= 2]`,
`[0 - 0.01)`) are transcribed as written in the source doc. `Pick 1: [...]`
means single-select from a fixed list; `(multi-select)` means more than one
option may be active at once.

---

## 1. Application

Input classes: `QSharpApplication`, `OpenQASMApplication`, `QIRApplication`,
`CirqApplication`

### Application Type

One of: **Benchmarks**, **Saved Programs**, **Manual Logical Counts**.

### Benchmarks

> **What the bundled benchmarks are.** The five starter benchmarks are
> **demonstration circuits**, not reference implementations of the algorithms
> they are named after. Their hyperparameters genuinely size the circuit the
> estimator traces — changing Bit Size or Lattice N₁ changes the estimate — but
> their absolute numbers are not calibrated against published Shor / Grover /
> Ekerå-Håstad resource counts. Use them to compare *configurations*, not to
> quote a cost for factoring RSA-2048.
>
> Each benchmark's hyperparameters become the arguments of its Q# entry
> operation. The spec below is the single source of truth for both the form and
> the engine: it lives in `app/src/shared/benchmarkParams.ts`, and the argument
> order there matches the `Run(...)` signature in
> `app/src/main/engine/benchmarks/qsharp-project/src/`.
>
> Large parameters produce large circuits and can legitimately exceed the run
> timeout, or return no feasible Pareto point. Both are honest engine answers,
> not failures of the tool.
>
> **Every parameter is bounded above.** The source doc leaves most of these
> open-ended (`[>= 1]`), but several feed 64-bit integer arithmetic in the Q#
> that overflows for large inputs — and an overflow does not fail, it silently
> reports a much smaller circuit. Grover at 200 search qubits traced *one*
> iteration; a Total Time of 1e19 traced *one* Trotter step. The upper bounds
> below are set where that arithmetic stops being valid, so an out-of-range
> value is refused with `INVALID_CONFIG` instead of answered wrongly. Values far
> below the bounds already exceed the run timeout; that is the honest answer and
> is left alone.

#### Shor's Factoring

| Hyperparameter | Type | Default |
|---|---|---|
| Bit Size | int `[2 - 8192]` | 31 |
| Generator | int `[2 - 65535]` | 11 |

#### Ekerå-Håstad Factoring

| Hyperparameter | Type | Default |
|---|---|---|
| RSA Instance | Pick 1: `RSA-100 (330-bit)`, `RSA-1024 (1024-bit)`, `RSA-2048 (2048-bit)` | RSA-100 (330-bit) |
| Generator | int `[2 - 65535]` | 7 |

#### Quantum Dynamics

| Hyperparameter | Type | Default |
|---|---|---|
| Lattice N₁ | int `[1 - 1000]` | 10 |
| Lattice N₂ | int `[1 - 1000]` | 10 |
| Total Time | float `[> 0, <= 1e6]` | 30.0 |
| Trotter Step | float `[1e-6 <= Trotter Step <= Total Time]` | 0.9 |
| Coupling J | float `[any]` | 1.0 |
| Field g | float `[any]` | 1.0 |

#### Grover's Search

| Hyperparameter | Type | Default |
|---|---|---|
| Search Qubits | int `[1 - 63]` | 5 |
| Iterations | int `[>= 1]` | Computed from Search Qubits upon estimation |

#### Phase Estimation

| Hyperparameter | Type | Default |
|---|---|---|
| Precision | int `[1 - 63]` | 6 |
| Register Size | int `[1 - 1000]` | 3 |

### Saved Programs

- Supported formats: Q#, OpenQASM, QIR
- Accepted inputs: zip files, folders

### Manual Logical Counts

Fields: Number of Qubits, T Count, Rotation Count, Rotation Depth, CCZ Count,
CCiX Count, Measurement Count

**Tooltip copy — to be written, not transcribed.** The Config Descriptions tab
supplies copy for the QPU and Micro Architecture fields but **not** for these
seven, and they are the controls the 2026-07-31 review singled out as most
confusing. Three have direction; four need copy drafted from the same source
the others came from.

| Field | Status |
|---|---|
| Rotation Count | Describe as the "analog value of a rotation" — e.g. 1 analog rotation may translate to a multiple (like 15) of the T count. |
| Rotation Depth | **Unknown.** Check the QDK documentation to establish what this actually measures before writing anything. Treat as research, not transcription — if the docs do not settle it, escalate rather than guess. |
| Measurement Count | Needs a brief explanation despite reading as redundant ("we measure everything"). |
| Number of Qubits, T Count, CCZ Count, CCiX Count | Copy not yet drafted. |

The seven fields map 1:1 onto `LogicalCounts` keys, and the contract already
encodes `0 <= rotationDepth <= rotationCount` — that constraint is a useful
starting point for what Rotation Depth means, but it is not a definition.

### Notes

- Able to inject hyperparameters (into any application type).

---

## 2. QPU Specification

### Architecture (default = Superconducting)

#### Superconducting

| Field | Type | Default |
|---|---|---|
| Error Rate | float `[0 - 0.01)` | 1e-4 |
| Single-Qubit Gate Time (ns) | int `[> 0]` | None |
| Measurement Time (ns) | int `[> 0]` | None |
| Two-Qubit Gate Time (ns) *(optional)* | int `[> 0]` | None |

**Tooltip copy**

| Field | Text |
|---|---|
| Error Rate | The error probability for physical gate operations on hardware qubits. Lower error rates reduce the overhead required for error correction. |
| Single-Qubit Gate Time (ns) | The time required to perform a physical single-qubit operation. Affects the estimated runtime of the quantum computation. |
| Measurement Time (ns) | The time required to measure physical qubits. Affects the runtime of operations that require measurement. |
| Two-Qubit Gate Time (ns) | The time required for physical two-qubit operations such as CNOT and CZ gates. Two-qubit operations often contribute significantly to runtime. |

#### Majorana

| Field | Type | Default |
|---|---|---|
| Error Rate | float, one of `[1e-4, 1e-5, 1e-6]` | 1e-5 |
| T Error Rate *(optional)* | float `(0, 0.05]` | Auto-derived from Error Rate |
| Operation Time | int `[> 0]` | 1000 |
| Target Year *(optional)* | int `[>= 0]` | — |

> ⚠️ **T Error Rate and Target Year are new in the 2026-07-31 update, and both
> reverse a ruling.** `risks-and-open-questions.md` (Resolved, 2026-07-30)
> records: *"`t_error_rate` and `target_year` deliberately not mapped — not in
> `features-and-fields.md`."* They are in it now, so that ruling no longer
> holds. **Target Year is inert on our path** — per the source doc, it "needs a
> trace transform that takes a target year," so adding it changes the record and
> not the estimate. If it ships, it must be labelled as such, or it becomes the
> exact class of defect week 4 existed to remove.

#### Neutral Atom

| Field | Type | Default |
|---|---|---|
| Rydberg Time (ns) | int `[> 0]` | 500 |
| Rydberg Error | float `[0, 0.01)` | 1e-3 |
| Single-Qubit Time (ns) | int `[> 0]` | 1000 |
| Single-Qubit Error | float `[0, 0.01)` | 1e-4 |
| Measurement Time (ns) | int `[> 0]` | 10000 |
| Measurement Error | float `[0, 0.01)` | 1e-4 |
| Handoff Time (ns) | int `[>= 0]` | 0 |
| Atom Spacing (µm) | float `[> 0]` | 3.0 |
| Data Qubit Spacing (µm) | float `[> 0]` | 12.0 |
| Max Velocity (m/s) | float `[> 0]` | 0.25 |
| Max Acceleration (m/s²) | float `[> 0]` | 5000.0 |
| Surface Code Single-Qubit Time Factor | int `[>= 1]` | 1 |
| Surface Code Two-Qubit Time Factor | int `[>= 1]` | 1 |
| Target Year *(optional)* | int `[>= 0]` | — |

> ⚠️ **Data Qubit Spacing and Target Year are new in the 2026-07-31 update, and
> both reverse a ruling.** `risks-and-open-questions.md` (Resolved, 2026-07-30)
> records: *"the spec has exactly 12 fields and neither parameter appears.
> v1.1.0 matches the spec field for field. Ruling: no contract change; pin the
> inherited QDK defaults in a test instead, so a future bump that makes them
> live fails loudly."* The spec now has 14 fields and both parameters appear, so
> the ruling is reversed and the test that pins them (commit `6dce3ca`) has to
> change with the contract. That test firing is the intended signal, not a
> regression.
>
> Both were also measured **empirically inert** on our path at the time of that
> ruling (6.0 / 12.0 / 30.0 spacings and None / 2030 / 2050 target years all
> produced bit-identical estimates). Re-measure before shipping either as a live
> control; if they are still inert, they are recorded-only fields and must be
> labelled that way.

**Tooltip copy**

| Field | Text |
|---|---|
| Rydberg Time (ns) | The duration of physical two-qubit interactions between neutral atoms. Affects the estimated runtime. |
| Rydberg Error | The error probability of physical two-qubit interactions between neutral atoms. Affects the required error correction overhead. |
| Single-Qubit Time (ns) | The duration of physical single-qubit operations on neutral atoms. |
| Single-Qubit Error | The error probability of physical single-qubit operations on neutral atoms. |
| Measurement Time (ns) | The duration of physical qubit measurement operations. |
| Measurement Error | The error probability associated with measuring physical qubits. |
| Handoff Time (ns) | The time required to move atoms between computational regions. Affects runtime in movement-aware architectures. |
| Atom Spacing (µm) | The physical spacing between atoms used when modeling atom placement and movement. |
| Data Qubit Spacing (µm) | The spacing between data qubits used in the physical layout model. |
| Max Velocity (m/s) | The maximum speed at which atoms can be transported during computation. |
| Max Acceleration (m/s²) | The maximum acceleration allowed when transporting atoms. |
| Surface Code Single-Qubit Time Factor | A multiplier that adjusts single-qubit operation timing during surface code error correction. |
| Surface Code Two-Qubit Time Factor | A multiplier that adjusts two-qubit operation timing during surface code error correction. |
| Target Year | Specifies the hardware generation being modeled by selecting operations available in a given year. |

Majorana's shared fields use the Superconducting copy for Error Rate and the
Neutral Atom copy for Operation Time equivalents; the source doc gives Majorana
its own two:

| Field | Text |
|---|---|
| Error Rate (Majorana) | The error probability for physical Clifford operations. This value is used to model hardware reliability and determine error correction requirements. |
| Operation Time (Majorana) | The time required for physical operations, including Clifford operations and T gates. Affects the estimated execution time. |

#### Trapped Ion

*(No fields specified in source doc.)* Per the Teams TO-DO in the Notes tab,
Trapped Ion is slated for removal — see [Notes § Teams TO-DO](#teams-to-do).

---

## 3. Micro Architecture Settings

### QEC Code (default = Surface Code)

| Option | Requires Architecture |
|---|---|
| Surface Code | Superconducting |
| Three-Aux | Majorana |
| Low-Move Surface Code | Neutral Atom |

**Tooltip copy**

| Option | Text |
|---|---|
| Surface Code | A quantum error correction method used to protect logical qubits from physical errors. Affects physical qubit requirements. |
| Three-Aux | A quantum error correction method using additional auxiliary qubits for stabilizer measurements. Affects physical qubit overhead. |
| Low-Move Surface Code | A surface code optimized for neutral-atom architectures with mobile qubits. |

### Magic State Factory (default = Round-Based Factory) — multi-select

**One list, five options.** The 2026-07-31 update **merges the former Secondary
Factory control into this one** — the analyst picks from a single multi-select
and never sees a "primary vs secondary" distinction.

| Option | Requires Architecture | Compatibility constraints |
|---|---|---|
| Round-Based Factory | Any | Error Rate < 1e-2 |
| Litinski19 Factory | Superconducting or Neutral Atom | Superconducting: Error Rate <= 1e-3. Neutral Atom: Rydberg Error, Single-Qubit Error, Measurement Error <= 1e-3 |
| GSJ24 Factory | Superconducting or Neutral Atom | Superconducting: Error Rate <= 1e-3. Neutral Atom: Rydberg Error <= 1e-3; Single-Qubit Error, Measurement Error < 1e-2 |
| Magic Up-to-Clifford | Any except Majorana | NOT compatible with Majorana |
| GSJ24 CCX Factory | Superconducting or Neutral Atom | Bound to CCX Magic States (§ Trace Transform, stage 1) |

> ⚠️ **Merging the control does not mean flattening the composition.** The five
> options are not interchangeable in the engine
> (`app/src/main/engine/python/estimate.py` § `build_isa_query`): the first three
> are **unioned** into one factory query, while Magic Up-to-Clifford and GSJ24
> CCX are **multiplied onto** it as modifiers
> (`query = query * MagicUpToClifford.q()`). Those are different operations. A
> single flat list is the right *interface*; whatever carries it must still let
> the adapter tell the two groups apart, whether that is two contract fields
> behind one control or one field the adapter partitions by member id.
>
> A set of modifiers alone is also not a valid selection — at least one of the
> first three must be present for there to be a query to modify.

**Tooltip copy**

| Option | Text |
|---|---|
| Round-Based Factory | A method for producing high-quality magic states used for non-Clifford operations such as T gates. |
| Litinski19 Factory | A magic state factory design based on Litinski's 2019 fault-tolerant quantum computing architecture. |
| GSJ24 Factory | A magic state cultivation method that produces high-quality T states from physical operations. |
| Magic Up-to-Clifford | An optimization that provides alternative representations of magic operations to reduce resource costs. |
| GSJ24 CCX Factory | A factory that converts magic states into CCX (Toffoli) resources for fault-tolerant computation. |

### Memory Optimization (default = None) — **conditionally unavailable**

- 1D Yoked Surface Code
- 2D Yoked Surface Code

**Tooltip copy:** *A memory optimization technique that reduces resource costs
for storing quantum information.*

The control is present but disabled, and the field is still recorded on
`RunConfig`. Selecting a yoked code cannot change an estimate **as the pipeline
stands today**: the yoked codes *provide* a `MEMORY` instruction, and nothing in
the current pipeline *demands* one. `MEMORY` demand comes only from
`READ_FROM_MEMORY` / `WRITE_TO_MEMORY` trace gates, which are emitted by the
`DynamicMemoryCompute` trace transform or by `LogicalCounts` keys the contract
does not carry. Measured on qdk 1.30.0: layering either yoked code onto the ISA
query returns identical estimates.

> ⚠️ **The 2026-07-31 update may reactivate this field.** That update restores
> `DynamicMemoryCompute` as an optional first stage of the trace pipeline
> (below) — and `DynamicMemoryCompute` is precisely the source of the `MEMORY`
> demand whose absence makes the yoked codes inert. **If Dynamic Memory Compute
> ships, re-measure Memory Optimization with it enabled before leaving this
> control disabled.** The two items must be sequenced together: shipping the
> pipeline stage without re-testing the yoked codes would leave a control
> disabled that has become live, which is the same class of defect as a control
> that does nothing.

### Trace Transform

**An ordered pipeline.** Two stages always run and two are optional. Once
selected, the stages must be passed to QRE **in this order** — the order is not
a preference, it is a requirement of the pipeline:

```
DynamicMemoryCompute × PSSPC × LatticeSurgery × Unmemory
```

**Default pipeline** (both optional stages off): `PSSPC × LatticeSurgery`.

Composition is already order-sensitive in the code and fails loudly when
inverted — `PSSPC.q()` alone yields an empty frontier, and
`LatticeSurgery.q() * PSSPC.q()` raises *"unsupported instruction
LATTICE_SURGERY in trace transformation 'PSSPC'"*.

#### Stage 0 — Dynamic Memory Compute *(optional, off by default)*

| Field | Type | Default |
|---|---|---|
| Compute Capacity Percentage | float `(0, 1.0]` | 0.5 |
| Eviction Strategy | enum: `Least Recently Used`, `Least Frequently Used`, `First Available` | Least Recently Used |

**UI behaviour (from the source doc):** greyed out behind a checkbox or toggle.
When the stage is off, its defaults must **not** be applied — the stage is
absent from the pipeline entirely, not present with default values. A disabled
stage and a stage running at its defaults are different estimates.

> ⚠️ **This reverses "Get rid of Dynamic Memory Compute"** in the Teams TO-DO
> list below, which is why that line is struck through. Week 4 deleted the
> option on the grounds that it had no package counterpart; that was true of the
> **1.29.1** pin the audit was run against. **Verified present on qdk 1.30.0**
> (2026-07-31): `qdk.qre.DynamicMemoryCompute(compute_capacity_percentage: float
> = 0.5, eviction_strategy: EvictionStrategy = LEAST_RECENTLY_USED)`, with
> `EvictionStrategy.{LEAST_RECENTLY_USED, LEAST_FREQUENTLY_USED,
> FIRST_AVAILABLE}` — matching the field list and defaults above exactly.

#### Stage 1 — PSSPC *(always)*

| Field | Type | Default | Notes |
|---|---|---|---|
| T Count per Rotation | int `[5 - 20]` | 20 | Renamed from "T States / Rotation" in the 2026-07-31 update. A sparse `5` is in range but currently yields no feasible frontier point |
| CCX Magic States | bool | False | Bound to GSJ24 CCX Factory |

**Tooltip copy:** *A compilation method that translates logical quantum
operations into resources used for estimation.*

#### Stage 2 — Lattice Surgery *(always)*

| Field | Type | Default |
|---|---|---|
| Slow Down Factor | float, fixed at `1.0` | 1.0 |

**Tooltip copy:** *A compilation method that models fault-tolerant operations
using lattice surgery techniques.*

Slow Down Factor keeps its name — it accurately describes trading time for
space (running fewer factories consumes fewer magic states, saving physical
qubits but slowing execution).

#### Stage 3 — Unmemory *(optional, off by default)*

On/Off. No parameters. **Verified present on qdk 1.30.0**: `qdk.qre.Unmemory()`
takes no arguments.

> ⚠️ **Measured INERT on our pipeline (2026-07-31).** Wired end to end in
> contract v1.4.0 and estimated with the stage on and off, everything else held
> equal: Quantum Dynamics 3×3 returns **477 physical qubits / 1,363,950 ns
> either way**. It is a recorded-but-not-influential control and must be
> labelled as such. `traceTransformV14.test.ts` pins the current measurement, so
> the day it stops being inert the suite says so.
>
> By contrast **Dynamic Memory Compute is live**: the same workload goes to
> **256 qubits / 1,852,200 ns** with `DynamicMemoryCompute(0.5,
> least_recently_used)` — it trades runtime for qubits, which is what the stage
> is for. Note also that some settings have **no feasible frontier point**
> (capacity 0.25 with least-frequently-used returns a failed run); that is an
> honest estimator answer, like a sparse T-count-per-rotation, not a bug.

### Total Fault Tolerant Execution Error

| Field | Type | Default |
|---|---|---|
| Total Fault Tolerant Execution Error | float `[0.01 - 1.0]` | 1.0 |

Renamed from **Max Error** in the 2026-07-31 update. The reason is
disambiguation: "max error" could be read as algorithm success probability or as
synthesis error, and the new name isolates it to the overhead/error of
fault-tolerant computation specifically — e.g. surface-code distance error.

This is a **display rename**. The contract field is `maxError` and the engine
keyword is `max_error`; neither changes, so saved records stay readable and no
migration is implied.

---

## 4. Run Name

| Field | Type | Default |
|---|---|---|
| Custom Name | string | `<ApplicationName>-<Architecture>-<QEC Code>-<Year+Day+Month>` |

---

## 5. Notes

### Terminology

- **Q# / Cirq** — high-level language
- **OpenQASM** — assembly level
- **QIR** — intermediate representation / bitcode

### Renames (2026-07-31)

Display labels only — every contract field id and engine keyword stays as it is,
so no saved record needs migrating.

| Current label | New label | Reasoning |
|---|---|---|
| Max Error | **Total Fault Tolerant Execution Error** | "Max error" could mean algorithm success probability or synthesis error. The new name isolates it to the overhead/error of fault-tolerant computation (e.g. surface-code distance error). |
| T States / Rotation | **T Count Per Rotation** | More intuitive and accurate under the PSSPC stage. |
| Low Move (Surface Code) | *unchanged* — keep "Low Move" | It likely means "slow move," but it stays "low move" to remain strictly consistent with the QDK code base. |
| Slowdown Factor | *unchanged* | Accurately describes trading time for space — consuming fewer magic states by running 2 factories instead of 10 saves physical qubits but slows execution. |

Labels appear on more surfaces than the configuration form: the Markdown export,
the Comparison table, and History all render them. They move together or the
export disagrees with the screen.

### Design notes

- Upper bounds on the hyperparameters are tighter than the source doc, which
  leaves them open-ended. See the note under § Benchmarks: the bounds mark where
  the Q#'s 64-bit arithmetic stops being valid, and without them an overflow
  silently reports a far smaller circuit.
- Hyperparameters are serialized onto `RunConfig.parameters` and **do** drive
  the estimate: the engine turns them into the arguments of the benchmark's Q#
  entry operation. *(The source doc predates this; it said they were validated
  but not part of `RunConfig`.)*
- Need to update backend configuration.
- Need a file upload checker.
- Wanted to avoid putting proprietary code in the repo → can use Manual
  Logical Counts via `LogicalResourceCounts` instead.

### Teams TO-DO

Delivered in week 4:

- ~~GSJ24 CCX Factory should be coupled with CCX Magic States — turning one on
  turns the other on, and turning one off turns the other off.~~
- ~~Secondary Factory (Magic Up-to-Clifford + GSJ24 CCX Factory) should be
  multi-select, i.e. both can be selected to use at once.~~
- ~~Make Neutral Atom available to select, with its parameters.~~
- ~~Get rid of Trapped Ion.~~
- ~~Make sure Magic Up-to-Clifford cannot be used with Majorana architecture.~~
- ~~Make a pareto curve on the comparison page containing the pareto curve of
  each run being compared.~~
- ~~Pareto row selected when viewing a result should represent that run.~~
- ~~Export and rerun button on the result page.~~
- ~~Delete selected runs on the history page.~~
- ~~Instead of moving to the compare page when clicking "compare selected" on
  run history when an insufficient number of runs is selected, show a
  warning instead.~~

Reversed by the 2026-07-31 update:

- ~~Get rid of Dynamic Memory Compute.~~ — **reinstated** as the optional first
  stage of the trace pipeline. It was deleted in week 4 as absent from the
  package, which was true of the 1.29.1 pin; it is present on 1.30.0. See
  [§ Trace Transform, Stage 0](#stage-0--dynamic-memory-compute-optional-off-by-default).

Still open:

- Make the comparison page look nicer.

New in the 2026-07-31 update:

- Add hover tooltips to every field, using the **Tooltip copy** tables above as
  the text. All manual logical-count inputs need one — they are the most
  confusing controls in the form.
  - **Rotation Count** — describe as the "analog value of a rotation," e.g.
    clarify that 1 analog rotation might translate to a multiple (like 15) of
    the T count.
  - **Rotation Depth** — **copy not yet written.** Requires checking the QDK
    documentation to establish what it actually means before the tooltip can be
    written. This is a research item, not a transcription item.
  - **Measurement Count** — still needs a brief explanation even though it reads
    as redundant ("we measure everything"), for clarity.
- Merge Magic State Factory and Secondary Factory into one multi-select list.
- Model the trace transform as the ordered pipeline above, with Dynamic Memory
  Compute and Unmemory as optional stages, greyed out behind a toggle so their
  defaults do not apply when unselected.
- Apply the renames in [§ Renames](#renames-2026-07-31).
- Add the four new QPU fields: Majorana T Error Rate and Target Year, Neutral
  Atom Data Qubit Spacing and Target Year — each subject to the inert-field
  warnings recorded against them above.
