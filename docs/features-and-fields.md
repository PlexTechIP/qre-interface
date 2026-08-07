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
> **The Config Descriptions tab is the tooltip copy** — the per-field "Tooltip
> copy" tables below are transcribed from it verbatim and are the text to render
> on hover. Its first revision (2026-07-31) added four QPU fields, merged
> Secondary Factory into Magic State Factory, extended the trace transform to a
> four-stage ordered pipeline, and renamed Max Error. Each of those **reverses a
> ruling recorded earlier**; the reversals are flagged inline where they land.
>
> **Second revision, same day.** Preston re-issued the tab later on 2026-07-31.
> It changes **no field, type, range, or default** — contract v1.4.0 is
> unaffected — but it does three things worth knowing before you read on:
>
> 1. **Every benchmark hyperparameter and every Manual Logical Counts field now
>    has copy.** Rotation Depth in particular is no longer an open research
>    question; see [§ Manual Logical Counts](#manual-logical-counts).
> 2. **Two display renames**: *Quantum Dynamics* → **Ising Model (2D)**, and
>    *Number of Qubits* → **Logical Qubit Count**. Contract ids
>    (`quantum-dynamics`, `numQubits`) do not change — see
>    [§ Renames](#renames-2026-07-31).
> 3. **Unmemory finally has a definition**, and it explains the measurement we
>    took: it *reverses* Dynamic Memory Compute, so it has nothing to act on
>    unless that stage is running. See
>    [§ Trace Transform, Stage 3](#stage-3--unmemory-optional-off-by-default).
>
> Where the Config Descriptions tab and an older tab disagree, this doc follows
> **Config Descriptions** (it is the one being revised) and flags the conflict.

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

| Hyperparameter | Type | Default | Tooltip copy |
|---|---|---|---|
| Bit Size | int `[2 - 8192]` | 31 | The number of bits in the integer being factored. |
| Generator | int `[2 - 65535]` | 11 | The integer base used to generate the factoring instance. |

#### Ekerå-Håstad Factoring

| Hyperparameter | Type | Default | Tooltip copy |
|---|---|---|---|
| RSA Instance | Pick 1: `RSA-100 (330-bit)`, `RSA-1024 (1024-bit)`, `RSA-2048 (2048-bit)` | RSA-100 (330-bit) | The RSA key size (in bits) of the integer being factored. |
| Generator | int `[2 - 65535]` | 7 | The integer base used by the factoring algorithm to generate the problem instance. |

#### Ising Model (2D)

> **Renamed from "Quantum Dynamics"** in the second 2026-07-31 revision, and the
> new name is the accurate one — the bundled Q# simulates a 2D transverse-field
> Ising model, which is what the lattice dimensions, coupling J and field g
> describe. **Display only:** the contract id stays `quantum-dynamics`, so saved
> records, filters, and `benchmarks.json`'s `id` are untouched.
>
> **It is a one-line edit to `benchmarks.json`'s `name`, and the PMs make it.**
> That file lives under `src/shared/contracts/`, which teams do not edit. The
> form reads benchmark names straight from it (`ApplicationSection.tsx:250`), and
> so does History and Comparison (`historyLabels.ts:46`) — so the single edit
> covers **both Team 3's and Team 2's surfaces at once**. Neither team should
> hand-apply this rename anywhere.

| Hyperparameter | Type | Default | Tooltip copy |
|---|---|---|---|
| Lattice N₁ | int `[1 - 1000]` | 10 | The number of spins (sites) along the first dimension of the 2D lattice. |
| Lattice N₂ | int `[1 - 1000]` | 10 | The number of spins (sites) along the second dimension of the 2D lattice. |
| Total Time | float `[> 0, <= 1e6]` | 30.0 | The total duration of the simulated quantum system evolution. |
| Trotter Step | float `[1e-6 <= Trotter Step <= Total Time]` | 0.9 | **CORRECTED — see below.** The simulated time advanced by each Trotter step. The evolution runs ceil(Total Time ÷ Trotter Step) steps, so smaller values approximate the dynamics more accurately and produce a deeper circuit. |
| Coupling J | float `[any]` | 1.0 | The strength of the interaction between neighboring spins in the lattice. |
| Field g | float `[any]` | 1.0 | The strength of the transverse magnetic field applied to the spins. |

> ⚠️ **The table above carries CORRECTED copy. The Google Doc's original is
> wrong** — settled against our own Q#, not a matter of opinion. The source tab
> says *"The number of discrete steps used to approximate the system evolution."*
> `benchmarks/qsharp-project/src/QuantumDynamics.qs` computes:
>
> ```qsharp
> let steps = MaxI(1, Ceiling(totalTime / trotterStep));
> ...
> TrotterStep(qs, n1, n2, couplingJ * trotterStep, fieldG * trotterStep);
> ```
>
> `trotterStep` is the **time increment per step** — a duration. The number of
> steps is *derived* from it as `ceil(Total Time / Trotter Step)`, and the value
> is also multiplied into the coupling and field rotation angles. Shipping "the
> number of discrete steps" would tell an analyst that the default 0.9 means
> "0.9 steps."
>
> **Proposed replacement copy**, for Preston to approve:
> *The simulated time advanced by each Trotter step. The evolution runs
> ceil(Total Time ÷ Trotter Step) steps, so smaller values approximate the
> dynamics more accurately and produce a deeper circuit.*
>
> This also explains the upper bounds under § Benchmarks: the Q# comment notes
> that a `totalTime / trotterStep` ratio outside Int64 overflows and
> `MaxI(1, …)` silently collapses it to a one-step evolution.

#### Grover's Search

| Hyperparameter | Type | Default | Tooltip copy |
|---|---|---|---|
| Search Qubits | int `[1 - 63]` | 5 | The number of qubits used to represent the search space. A system with n search qubits represents 2ⁿ possible items. |
| Iterations | int `[>= 1]` | Computed from Search Qubits upon estimation | The number of Grover search iterations performed to amplify the probability of finding the target item. |

#### Phase Estimation

| Hyperparameter | Type | Default | Tooltip copy |
|---|---|---|---|
| Precision | int `[1 - 63]` | 6 | The number of bits of accuracy used to represent the estimated phase. Higher precision requires additional quantum resources. |
| Register Size | int `[1 - 1000]` | 3 | The number of qubits used in the phase estimation register. Larger registers provide higher precision but increase resource requirements. |

### Saved Programs

- Supported formats: Q#, OpenQASM, QIR
- Accepted inputs: zip files, folders

### Manual Logical Counts

**Section copy:** *Manually specify the logical resource requirements of a
quantum program. These values represent logical operations before physical
hardware and error correction overhead are applied.*

The seven fields map 1:1 onto `LogicalCounts` keys.

| Field | Contract id | Tooltip copy |
|---|---|---|
| Logical Qubit Count | `numQubits` | The number of logical qubits required by the quantum program. The QRE uses this value to estimate the physical qubit resources needed after error correction. |
| T Count | `tCount` | The total number of logical T gates required by the quantum program. T gates are non-Clifford operations that require additional resources in fault-tolerant quantum computation. |
| Rotation Count | `rotationCount` | The total number of logical rotation operations in the quantum program. Rotations are typically decomposed into fault-tolerant operations for resource estimation. |
| Rotation Depth | `rotationDepth` | The maximum number of sequential rotation operations in the quantum program. This affects the depth of the computation and estimated runtime. |
| CCZ Count | `cczCount` | The total number of logical CCZ (controlled-controlled-Z) operations required by the quantum program. CCZ operations contribute to non-Clifford resource requirements. |
| CCiX Count | `ccixCount` | The total number of logical CCiX (controlled-controlled-iX) operations required by the quantum program. These operations contribute to fault-tolerant resource estimates. |
| Measurement Count | `measurementCount` | The total number of logical measurement operations required by the quantum program. Measurements contribute to the estimated runtime and resource requirements. |

> ✅ **Rotation Depth is settled — this is no longer a research item.** The first
> revision left it "Unknown; check the QDK documentation," and the week-5 plan
> carried it as the one unschedulable task with an escalation gate. The
> definition above ("the maximum number of *sequential* rotation operations")
> also explains the contract's existing `0 <= rotationDepth <= rotationCount`
> constraint: a longest sequential chain cannot exceed the total count. No
> escalation needed.
>
> **Rotation Count's earlier verbal framing is superseded.** The Jul 31 POC
> described it as the "analog value of a rotation," with 1 analog rotation
> translating to a multiple (~15) of the T count. That is a useful intuition but
> it is not what the written copy says, and the written copy is what ships.
> The T-count relationship lives in PSSPC's *T Count per Rotation* instead.

> ⚠️ **"Number of Qubits" is renamed "Logical Qubit Count."** Display only —
> `numQubits` stays as the contract id, the schema description, and the
> validation key. The new name is worth having: this field counts *logical*
> qubits, and the results surface separately reports physical qubit counts, so
> the old label collided with a different number on the same screen.

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
| Measurement Time (ns) | The time required to measure physical qubits. Affects the estimated runtime of operations that require measurement. |
| Two-Qubit Gate Time (ns) | The time required for physical two-qubit operations such as CNOT and CZ gates. Two-qubit operations often contribute significantly to estimated runtime. |

> ⚠️ **qdk validates none of these, and this is the DEFAULT architecture.**
> `GateBased` is a plain dataclass with no `__post_init__` checks. Measured on
> 1.30.0, `errorRate=-1e-4` does not fail — it estimates successfully and
> reports a total error of **-9.99e-05**, a negative probability, which our row
> mapper accepts (it checks only that the number is finite) and the Results
> surface renders. `gateTime=-50` fails, but as `ESTIMATION_FAILED` with
> "can't convert negative int to unsigned".
>
> ✅ **Resolved (2026-08-02): every bound is enforced in `estimate.py` too**, as
> a rules table transcribed from `runconfig.schema.json`, reporting
> `INVALID_CONFIG` and naming the field. Same treatment for Majorana and
> Neutral Atom. Pinned by `architectureBounds.test.ts`.
>
> ✅ **Resolved (2026-08-02): the three time fields are `int` here and `integer`
> in the schema.** They were typed `number` there, against both this doc and
> qdk (which rejects `50.5` outright). The schema and `configToInvocation` were
> the ones lagging, so both were tightened rather than the wrapper relaxed. Each
> is additionally capped at `2^53 - 1` — above that a JSON number no longer
> carries an integer exactly. Same for Majorana's Operation Time.
>
> ⚠️ **Error Rate's lower bound differs from the schema, and this doc is the
> outlier.** The table above says `[0 - 0.01)`, admitting `0`; the schema,
> `configToInvocation` and `estimate.py` all use `exclusiveMinimum: 0`, so a
> perfect-qubit `0` is refused today. Neutral Atom's three error rates are
> inclusive of `0` everywhere, so the two architectures also disagree with each
> other. Nothing is broken — `0` is not a value the UI can produce — but the
> contract and the spec should say the same thing. Open question; see
> `risks-and-open-questions.md`.

#### Majorana

| Field | Type | Default |
|---|---|---|
| Error Rate | float, one of `[1e-4, 1e-5, 1e-6]` | 1e-5 |
| T Error Rate *(optional)* | float `(0, 0.05]` | Auto-derived from Error Rate |
| Operation Time | int `[> 0]` | 1000 |
| Target Year *(optional)* | int `[>= 0]` | — |

**Tooltip copy**

| Field | Text |
|---|---|
| Error Rate | The error probability for physical Clifford operations. This value is used to model hardware reliability and determine error correction requirements. |
| T Error Rate | The error probability for physical T gate operations. If not specified, it is automatically derived from the general error rate. This affects the resources required for fault-tolerant T gate execution. |
| Operation Time | The time required for physical operations, including Clifford operations and T gates. Affects the estimated runtime. |
| Target Year | Specifies the target hardware generation. Currently has no effect unless a compatible trace transform is enabled. |

> ⚠️ **T Error Rate and Target Year are new in the 2026-07-31 update, and both
> reverse a ruling.** `risks-and-open-questions.md` (Resolved, 2026-07-30)
> records: *"`t_error_rate` and `target_year` deliberately not mapped — not in
> `features-and-fields.md`."* They are in it now, so that ruling no longer
> holds. **Target Year is inert on our path** — its own tooltip says so
> ("currently has no effect unless a compatible trace transform is enabled"),
> and none of our four stages takes one. The copy is honest about it, which
> makes labelling the control straightforward rather than a judgement call.
>
> ✅ **Resolved against qdk 1.30.0's source — the Config Descriptions tab is
> right and the QPU Specification tab is stale.** `qdk/qre/models/qubits/_msft.py`
> declares both on the `Majorana` dataclass:
>
> ```python
> t_error_rate: Optional[float] = None
> target_year: Optional[int] = None
> ```
>
> **T Error Rate's derivation is in qdk's own docstring**, and the numbers explain
> Preston's `(0, 0.05]` bound: *"Non-Clifford operations in this architecture do
> not have topological protection, so we assume a 5%, 1.5%, and 1% error rate for
> non-Clifford physical T gates for the three cases."* `__post_init__` fills it
> in when omitted — error rate 1e-4 → **0.05**, 1e-5 → **0.015**, 1e-6 → **0.01**
> — and feeds it to the `T` instruction. `0.05` is therefore the highest value
> qdk itself will ever derive, which makes the upper bound the edge of the
> modelled regime rather than an arbitrary cap.
>
> ⚠️ **qdk does NOT validate an explicitly-supplied value.** Measured on 1.30.0:
> `Majorana(error_rate=1e-5, t_error_rate=0.9)` and `t_error_rate=-0.1` are both
> accepted and used verbatim as the T-gate error rate. `__post_init__` only
> *derives* a value when the field is `None`; anything already there is passed
> through untouched, and `provided_isa` casts it onto the `T` instruction.
>
> ✅ **Resolved (2026-08-02): the bound is now enforced on both sides.**
> `estimate.py` range-checks `tErrorRate` in `build_architecture` before the
> `Majorana` model is constructed, and reports `INVALID_CONFIG` — not
> `ESTIMATION_FAILED` — because nothing was estimated and the analyst's next
> step is to correct a field. `configToInvocation`'s identical `(0, 0.05]` check
> stays where it is: it is the one that produces a fast, in-process rejection
> for the UI. It is now the first line of defence rather than the only one, so a
> config that reaches the engine over IPC without passing through our form is
> still refused. Pinned by `majoranaTErrorRate.test.ts`, which bypasses the
> TypeScript guard on purpose and hands the wrapper the values qdk would accept.

> ⚠️ **Supplying a T Error Rate disables qdk's check on Error Rate.** Found
> while fixing the above, and worse than it. `__post_init__` reaches its
> `error_rate` domain test *inside* the `if t_error_rate is None:` branch, so
> the moment a T Error Rate is present the `[1e-4, 1e-5, 1e-6]` rule stops being
> applied. Measured on 1.30.0: `Majorana(error_rate=0.5, t_error_rate=0.01)`
> constructs, where the same Error Rate alone raises. qdk's rule is also a
> *tolerance* test (`abs(x - 1e-4) <= 1e-8`), so it admits values this doc's
> enum does not.
>
> **A bad Error Rate does not reliably fail the run.** `errorRate=-1e-5` with a
> T Error Rate present estimates *successfully* and reports a total error of
> **-0.0032** — a negative probability, which passes our row mapper (it checks
> only that the number is finite) and renders on the Results surface. `0.5`
> does fail, but as `ESTIMATION_FAILED` advising the analyst to relax Max
> Error, which points at the wrong field.
>
> ✅ **Resolved (2026-08-02) the same way.** `estimate.py` now checks Error Rate
> against the exact enum before building the model, reporting `INVALID_CONFIG`
> and naming the field. Exact membership, deliberately stricter than qdk's
> tolerance, because this doc and the schema are what the contract means.
> Pinned by `majoranaErrorRate.test.ts`.

> ⚠️ **Operation Time was the worst of the three architectures, and not because
> of a wrong number.** Unguarded, `operationTime = 0` does not fail soft: it
> panics inside pyo3, and `PanicException` derives from `BaseException`, so the
> wrapper's `except Exception` never sees it — stdout is empty, the process
> exits 1, and a bad config comes back as **`ENGINE_CRASH`, "verify the Python
> environment"**. A negative value fails soft but opaquely ("can't convert
> negative int to unsigned", `ESTIMATION_FAILED`).
>
> ✅ **Resolved (2026-08-02): every bound is enforced in `estimate.py` too**, as
> a rules table transcribed from `runconfig.schema.json` — and diffed against it
> by `architectureBounds.test.ts` — reporting `INVALID_CONFIG` and naming the
> field. Operation Time is `integer` in the schema as of the same date, matching
> the `int [> 0]` this table has always specified, and capped at `2^53 - 1`.
> Target Year is bounded here too, despite being inert: a recorded-only field
> that accepts nonsense still puts nonsense in the run record.

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
> produced bit-identical estimates), and researching qdk's source on 2026-08-01
> explains why: `data_qubit_spacing` is attached to the `PHYSICAL_MOVE`
> instruction as a bit-encoded property
> (`data_qubit_spacing=_float_to_bits(self.data_qubit_spacing)`), exactly as
> `atom_spacing`, `velocity` and `acceleration` are — it is *reported*, not fed
> into any Python-level cost model. **Both ship as recorded-only.**
>
> One consequence worth knowing: because it is stored via `_float_to_bits`, this
> is the same field family as the open known issue in
> `risks-and-open-questions.md` where float properties read back from the
> provenance graph arrive as raw uint64 bit patterns. If Data Qubit Spacing ever
> surfaces on the Results surface, it will need that conversion fixed first.
>
> ⚠️ **Target Year's bound differs between tabs, and qdk settles neither.**
> The QPU Specification tab says `int [> 0]`; Config Descriptions says
> `int [>= 0]`. Measured on 1.30.0: `target_year=0` and `target_year=-5` are
> **both accepted** — the field is a bare `Optional[int]` with no validation
> anywhere in the package. So this is purely a product decision, not a technical
> constraint.
>
> **Recommendation: keep `>= 0`.** It matches Majorana's, matches the tab being
> actively revised, and is what contract v1.4.0 already ships. Nothing is at
> stake in the estimate either way — see the inertness finding below — so the
> cheapest correct move is to leave it and fix the QPU tab.

> ⚠️ **None of these 14 bounds is checked by qdk, and a bad one can change the
> answer without failing.** `NeutralAtom` is a plain dataclass with no
> validation. Measured on 1.30.0, `Rydberg Error = -1.0` estimates
> *successfully* and reports a total error of **0.0109**, where the identical
> config with the correct 1e-3 reports **0.991** — a nonsense input silently
> making the machine look ~90× better. Others fail, but opaquely: `Atom
> Spacing = -3` comes back as `ESTIMATION_FAILED` "math domain error".
>
> ✅ **Resolved (2026-08-02): every bound is enforced in `estimate.py` too**, as
> a rules table transcribed from `runconfig.schema.json`, reporting
> `INVALID_CONFIG` and naming the field. Pinned by `architectureBounds.test.ts`.
> Note this is only the *second* line of defence — `configToInvocation` still
> rejects the same values in-process, before Python is spawned.

**Tooltip copy**

| Field | Text |
|---|---|
| Rydberg Time (ns) | The duration of physical two-qubit interactions between neutral atoms. Affects the estimated runtime. |
| Rydberg Error | The error probability of physical two-qubit interactions between neutral atoms. Affects the required error correction overhead. |
| Single-Qubit Time (ns) | The duration of physical single-qubit operations on neutral atoms. |
| Single-Qubit Error | The error probability of physical single-qubit operations on neutral atoms. |
| Measurement Time (ns) | The duration of physical qubit measurement operations. |
| Measurement Error | The error probability associated with measuring physical qubits. |
| Handoff Time (ns) | The time required to move atoms between computational regions. Affects estimated runtime in movement-aware architectures. |
| Atom Spacing (µm) | The physical spacing between atoms used when modeling atom placement and movement. |
| Data Qubit Spacing (µm) | The spacing between data qubits used in the physical layout model. |
| Max Velocity (m/s) | The maximum speed at which atoms can be transported during computation. |
| Max Acceleration (m/s²) | The maximum acceleration allowed when transporting atoms. |
| Surface Code Single-Qubit Time Factor | A multiplier that adjusts estimated single-qubit operation timing during surface code error correction. |
| Surface Code Two-Qubit Time Factor | A multiplier that adjusts estimated two-qubit operation timing during surface code error correction. |
| Target Year | Specifies the target hardware generation. Currently has no effect unless a compatible trace transform is enabled. |

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
| Surface Code | A quantum error correction method used to protect logical qubits from physical errors in gate-based architectures. |
| Three-Aux | A quantum error correction method using additional auxiliary qubits for stabilizer measurements in Majorana architectures. |
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
| GSJ24 CCX Factory | **Any** | Bound to CCX Magic States (§ Trace Transform, stage 1) |

> ⚠️ **GSJ24 CCX has no architecture restriction — do not add one.** An earlier
> draft of this table said "Superconducting or Neutral Atom," inferred from the
> GSJ24 *Factory* row above it. That was wrong. The source doc lists only "Bound
> to CCX Magic States"; `runconfig.schema.json` has exactly one conditional on
> `secondaryFactories` and it covers `magic_up_to_clifford` alone; and
> `configToInvocation` rejects `magic_up_to_clifford` on Majorana and nothing
> else. Restricting GSJ24 CCX would be a constraint no other layer enforces.

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
| Magic Up-to-Clifford | An optimization that converts certain magic operations into equivalent Clifford operations to reduce resource costs. |
| GSJ24 CCX Factory | A factory that converts magic states into CCX (Toffoli) resources for fault-tolerant computation. |

### Memory Optimization (default = None) — **conditionally unavailable**

**Section copy:** *Memory optimization techniques that reduce quantum memory
resource requirements.*

| Option | Tooltip copy |
|---|---|
| 1D Yoked Surface Code | A memory optimization technique using a 1D yoked surface code structure to reduce quantum memory resource requirements. |
| 2D Yoked Surface Code | A memory optimization technique using a 2D yoked surface code structure to reduce quantum memory resource requirements. |

The control is present but disabled, and the field is recorded on `RunConfig`.

> ✅ **CLOSED 2026-08-06 — wired first, then measured.** This block used to warn
> that `memoryOptimization` reached **no** engine file, so the "identical
> estimates" result was evidence the yoked codes were never *sent* rather than
> evidence they do nothing. That has been acted on rather than restated.
>
> The field now flows `QreInvocation` → `configToInvocation` → `build_isa_query`,
> layered as `query * TwoDimensionalYokedSurfaceCode.q()` after the factories,
> with `resolve_yoked_code` raising a named `ValueError` rather than a bare
> `KeyError`. The old `not.toContain("memoryOptimization")` assertion was
> **inverted in the same change**.
>
> **Measured on qdk 1.30.0, Ising Model (2D) 3×3:**
>
> | Pipeline | Physical qubits | Runtime (ns) |
> |---|---|---|
> | `PSSPC × LatticeSurgery` | 477 | 1,363,950 |
> | + `yoked_2d` | 477 | 1,363,950 |
> | `DMC × PSSPC × LatticeSurgery` | **256** | **1,852,200** |
> | + `yoked_2d` | 256 | 1,852,200 |
>
> Dynamic Memory Compute moves the estimate; the yoked codes do not move it,
> **with or without** the memory demand DMC supplies. The reasoning below is now
> *tested* rather than assumed — measured on 1.30.0 with DynamicMemoryCompute
> enabled and the yoked code actually in the ISA query. The control stays
> disabled and labelled unavailable, now for a demonstrated reason.
>
> Pinned by `memoryOptimization.test.ts`, which also guards the premise: if DMC
> ever stops moving the estimate the comparison becomes vacuous, and that test
> fails rather than continuing to report "inert".

**The reasoning for why they were expected to be inert still stands**, and is
worth keeping: the yoked codes *provide* a `MEMORY` instruction, and nothing in
the pre-v1.4.0 pipeline *demanded* one. `MEMORY` demand comes only from
`READ_FROM_MEMORY` / `WRITE_TO_MEMORY` trace gates, emitted by the
`DynamicMemoryCompute` trace transform or by `LogicalCounts` keys the contract
does not carry.

> ✅ **v1.4.0 supplies the missing demand, so this is now testable — and Team 3
> owns closing it (week-5 § G).** Two steps, in order:
>
> 1. **Wire it.** Add `memoryOptimization` to `QreInvocation`, map it in
>    `configToInvocation`, and layer it in `build_isa_query` — the yoked codes
>    compose exactly like the secondary factories do
>    (`query = query * TwoDimensionalYokedSurfaceCode.q()`). Verified present on
>    qdk 1.30.0 as `OneDimensionalYokedSurfaceCode` and
>    `TwoDimensionalYokedSurfaceCode`, both exposing `.q()`.
> 2. **Then measure**, with Dynamic Memory Compute enabled. Only now does a "no
>    change" result mean anything.
>
> If it moves, re-enable the control conditioned on stage 0 being on. If it still
> does not, the explanation finally becomes true rather than untested — and
> `memoryOptimization.test.ts` should say "measured on 1.30.0 with
> DynamicMemoryCompute enabled and the yoked code actually in the ISA query."

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

**Stage copy:** *An optimization technique that dynamically manages quantum
memory resources during execution.*

| Field | Type | Default | Tooltip copy |
|---|---|---|---|
| Compute Capacity Percentage | float `(0, 1.0]` | 0.5 | The percentage of available memory resources reserved for active computation. Higher values allocate more resources to computation and less to memory storage. |
| Eviction Strategy | enum: `Least Recently Used`, `Least Frequently Used`, `First Available` | Least Recently Used | The strategy used to decide which stored quantum data is removed from memory when additional space is needed. |

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

**Stage copy:** *A compilation method that converts logical operations into
fault-tolerant resources for estimation, including rotation synthesis and
non-Clifford resource accounting.*

| Field | Tooltip copy |
|---|---|
| T Count per Rotation | The number of T gates used to approximate arbitrary rotation operations. Higher values increase non-Clifford resource requirements and may increase physical resource estimates. |
| CCX Magic States | Determines whether CCX (Toffoli) operations are represented using dedicated magic states during resource estimation. |

#### Stage 2 — Lattice Surgery *(always)*

| Field | Type | Default |
|---|---|---|
| Slow Down Factor | float, fixed at `1.0` | 1.0 |

**Stage copy:** *A compilation method that models fault-tolerant operations
using lattice surgery techniques.*

| Field | Tooltip copy |
|---|---|
| Slow Down Factor | A multiplier applied to operation timing when estimating runtime using lattice surgery. Higher values increase the estimated runtime. |

Slow Down Factor keeps its name. Note the second revision **redefines what it
means**: the Jul 31 POC described it as trading time for space (fewer factories,
fewer magic states, fewer physical qubits, slower execution); the written copy
describes it plainly as a runtime multiplier. The written copy is what ships.
Either way the control stays fixed at 1.0 and is not user-settable, so nothing
in the build changes.

#### Stage 3 — Unmemory *(optional, off by default)*

On/Off. No parameters. **Verified present on qdk 1.30.0**: `qdk.qre.Unmemory()`
takes no arguments.

**Stage copy:** *Reverses Dynamic Memory Compute by removing memory operations
and mapping memory qubits back to compute qubits. This produces a trace without
a memory model.*

> ✅ **This definition explains our measurement, and it changes how the control
> should be built.** The first revision gave Unmemory no description, so when
> v1.4.0 measured it as producing an identical estimate on and off (Ising Model
> 3×3: **477 physical qubits / 1,363,950 ns either way**) the only honest reading
> was "inert, label it recorded-only."
>
> It is not inert. It **reverses Dynamic Memory Compute** — so with that stage
> off there is no memory model to remove, and doing nothing is the correct
> behaviour, not a dead control. **Unmemory is meaningful only when Dynamic
> Memory Compute is on**, which is a dependency between two controls rather than
> a field to apologise for.
>
> Implication for the UI: gate Unmemory on Dynamic Memory Compute being enabled,
> the same way DMC's own parameters are gated on DMC. Labelling it
> "recorded-only" would now be wrong.
>
> By contrast **Dynamic Memory Compute is live on its own**: the same workload
> goes to **256 qubits / 1,852,200 ns** with `DynamicMemoryCompute(0.5,
> least_recently_used)`. Note also that some settings have **no feasible frontier
> point** (capacity 0.25 with least-frequently-used returns a failed run); that
> is an honest estimator answer, like a sparse T-count-per-rotation, not a bug.
>
> `traceTransformV14.test.ts` pins the current measurements. The Unmemory-alone
> case stays pinned as "no change" because that is now the *expected* result, not
> a known gap — and a DMC-plus-Unmemory case is worth adding once someone
> establishes what the pair should do together.

### Total Fault Tolerant Execution Error

| Field | Type | Default |
|---|---|---|
| Total Fault Tolerant Execution Error | float `[0.01 - 1.0]` | 1.0 |

**Tooltip copy:** *The maximum allowed error probability for the entire
fault-tolerant computation. Lower values require additional resources to achieve
higher reliability.*

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

| Current label | New label | Contract id (unchanged) | Reasoning |
|---|---|---|---|
| Max Error | **Total Fault Tolerant Execution Error** | `maxError` | "Max error" could mean algorithm success probability or synthesis error. The new name isolates it to the overhead/error of fault-tolerant computation (e.g. surface-code distance error). |
| T States / Rotation | **T Count Per Rotation** | `tStatesPerRotation` | More intuitive and accurate under the PSSPC stage. |
| Quantum Dynamics | **Ising Model (2D)** | `quantum-dynamics` | The bundled Q# simulates a 2D transverse-field Ising model — the lattice dimensions, coupling J and field g are exactly that. Affects `benchmarks.json`'s `name`, never its `id`. |
| Number of Qubits | **Logical Qubit Count** | `numQubits` | The field counts *logical* qubits while the results surface reports physical qubit counts; the old label collided with a different number on the same screen. |
| Low Move (Surface Code) | *unchanged* — keep "Low Move" | — | It likely means "slow move," but it stays "low move" to remain strictly consistent with the QDK code base. |
| Slowdown Factor | *unchanged* | `slowDownFactor` | Kept, though its *description* changed in the second revision — see [§ Stage 2](#stage-2--lattice-surgery-always). |

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
  the text. **All copy now exists** — the second revision filled in every
  benchmark hyperparameter and all seven Manual Logical Counts fields, so this is
  transcription throughout, with one exception:
  - ⚠️ **Trotter Step ships CORRECTED copy**, already written into the table in
    [§ Ising Model (2D)](#ising-model-2d). The Google Doc's original describes a
    step count for a field that is a step size. Preston needs to approve the
    replacement wording in his doc; the repo already carries it.
- ~~**Rotation Depth** — copy not yet written; requires checking the QDK
  documentation.~~ **Resolved by the second revision**: "the maximum number of
  sequential rotation operations in the quantum program."
- Merge Magic State Factory and Secondary Factory into one multi-select list.
- Model the trace transform as the ordered pipeline above, with Dynamic Memory
  Compute and Unmemory as optional stages, greyed out behind a toggle so their
  defaults do not apply when unselected. **Unmemory additionally gates on Dynamic
  Memory Compute being on** — it reverses that stage, so on its own it has
  nothing to act on.
- Apply the renames in [§ Renames](#renames-2026-07-31) — now six rows, including
  **Ising Model (2D)** and **Logical Qubit Count**.
- Add the four new QPU fields: Majorana T Error Rate and Target Year, Neutral
  Atom Data Qubit Spacing and Target Year — each subject to the inert-field
  warnings recorded against them above.

### Questions answered against qdk 1.30.0 (2026-08-01)

The three open questions from the second revision were researched against the
shipped qdk 1.30.0 source, our own Q#, and Microsoft's published API reference.
All three are settled; none blocks the week.

1. **Trotter Step is a step size, not a count** — settled by
   `QuantumDynamics.qs`, which derives the step count as
   `ceil(totalTime / trotterStep)`. **Corrected copy is already in the table**
   under [§ Ising Model (2D)](#ising-model-2d); Preston needs to mirror it into
   the Google Doc. *Needs his sign-off, nothing else.*
2. **Majorana's T Error Rate and Target Year are real** — both are declared on
   qdk's `Majorana` dataclass. The Config Descriptions tab is correct; the QPU
   Specification tab is stale and should be caught up. Contract v1.4.0 already
   ships both correctly.
3. **Target Year's bound is ours to pick** — qdk validates nothing and accepts
   `0` and negatives. Recommendation: keep `>= 0`.

Two findings that were not part of the questions:

- ⚠️ **`target_year` and `dataQubitSpacing` are set as instruction properties and
  read by no Python-level consumer.** In qdk 1.30.0's Python source, `target_year`
  appears only where the two architecture models *set* it (Majorana
  `MEAS_XX`/`MEAS_ZZ`; Neutral Atom `CZ`/`CNOT`) plus a `TARGET_YEAR` property-key
  constant. `data_qubit_spacing` is the same shape — attached to `PHYSICAL_MOVE`
  via `_float_to_bits(...)`, alongside `atom_spacing`, `velocity` and
  `acceleration`. No transform, estimator, or factory in the Python layer reads
  either.

  **This is not proof of inertness, and should not be quoted as such.** The
  estimator core is a native extension (`qdk/_native.abi3.so`) whose binary
  contains both property names — expected, since `property_keys` registers them,
  but it means source inspection cannot rule out a native consumer. **The
  empirical measurement is the load-bearing evidence**: spacings of 6.0 / 12.0 /
  30.0 and target years of None / 2030 / 2050 all produce bit-identical estimates
  on our pipeline. Label from the measurement, and re-measure after any qdk bump
  rather than trusting the grep.

  Preston's note — "current trace transforms do not consume a Target Year" — is
  therefore right, and stated at exactly the right strength. The useful addition
  is that `data_qubit_spacing` is in the same category, which his tab does not say.
- ⚠️ **`target_year` and `data_qubit_spacing` are undocumented by Microsoft.**
  The published `NeutralAtom` API reference lists **12** constructor parameters;
  the shipped 1.30.0 package has **14**. The two extras are exactly these. They
  are real and functional, but a Microsoft-branded deliverable would be exposing
  two parameters Microsoft's own public reference does not describe — worth a
  question at a Friday check-in, and it also explains why the week-4 audit
  concluded they were not in the spec.
