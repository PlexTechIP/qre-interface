# QRE Dashboard — Features + Fields Reference

> Source: Preston's Google Doc "QRE Dashboard Features + Fields" (5 tabs:
> Application, QPU Specification, Micro Architecture Settings, Run Name,
> Notes), transcribed verbatim into Markdown for coding-agent reference.
> This is a **field/feature spec**, not the frozen data contract — see
> `data-contracts.md` for the canonical `RunConfig`/`RunResult` JSON shapes.
> If the two disagree, `data-contracts.md` wins for wire format; this doc
> is the source for what fields/ranges/defaults *should* exist.

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

#### Majorana

| Field | Type | Default |
|---|---|---|
| Error Rate | float, one of `[1e-4, 1e-5, 1e-6]` | 1e-5 |
| Operation Time | int `[> 0]` | 1000 |

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
| Max Velocity (m/s) | float `[> 0]` | 0.25 |
| Max Acceleration (m/s²) | float `[> 0]` | 5000.0 |
| Surface Code Single-Qubit Time Factor | int `[>= 1]` | 1 |
| Surface Code Two-Qubit Time Factor | int `[>= 1]` | 1 |

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

### Magic State Factory (default = Round-Based Factory) — multi-select

| Option | Requires Architecture | Compatibility constraints |
|---|---|---|
| Round-Based Factory | Any | Error Rate < 1e-2 |
| Litinski19 Factory | Superconducting or Neutral Atom | Superconducting: Error Rate <= 1e-3. Neutral Atom: Rydberg Error, Single-Qubit Error, Measurement Error <= 1e-3 |
| GSJ24 Factory | Superconducting or Neutral Atom | Superconducting: Error Rate <= 1e-3. Neutral Atom: Rydberg Error <= 1e-3; Single-Qubit Error, Measurement Error < 1e-2 |

### Secondary Factory (optional, default = None) — multi-select

| Option | Constraints |
|---|---|
| Magic Up-to-Clifford | NOT compatible with Majorana architecture |
| GSJ24 CCX Factory | Bound to CCX Magic States |

### Memory Optimization (default = None) — **unavailable in this build**

- 1D Yoked Surface Code
- 2D Yoked Surface Code

The control is present but disabled, and the field is still recorded on
`RunConfig`. Selecting a yoked code cannot change an estimate here: the yoked
codes *provide* a `MEMORY` instruction, and nothing in the current pipeline
*demands* one. `MEMORY` demand comes only from `READ_FROM_MEMORY` /
`WRITE_TO_MEMORY` trace gates, which are emitted by the `DynamicMemoryCompute`
trace transform (slated for removal — see [Notes § Teams TO-DO](#teams-to-do))
or by `LogicalCounts` keys the contract does not carry. Measured on qdk 1.30.0:
layering either yoked code onto the ISA query returns identical estimates.

Re-enabling it needs a memory/compute-split workload first, not a wiring change.

### Trace Transform

**A two-stage pipeline, not a choice.** qdk applies PSSPC and then Lattice
Surgery on every estimate; the two groups below configure one stage each.
Neither can be turned off, and there is no control to pick between them.

#### Stage 1 — PSSPC

| Field | Type | Default | Notes |
|---|---|---|---|
| T States / Rotation | int `[5 - 20]` | 20 | A sparse `5` is in range but currently yields no feasible frontier point |
| CCX Magic States | bool | False | Bound to GSJ24 CCX Factory |

#### Stage 2 — Lattice Surgery

| Field | Type | Default |
|---|---|---|
| Slow Down Factor | float, fixed at `1.0` | 1.0 |

### Max Error

| Field | Type | Default |
|---|---|---|
| Max Error | float `[0.01 - 1.0]` | 1.0 |

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

- GSJ24 CCX Factory should be coupled with CCX Magic States — turning one on
  turns the other on, and turning one off turns the other off.
- Secondary Factory (Magic Up-to-Clifford + GSJ24 CCX Factory) should be
  multi-select, i.e. both can be selected to use at once.
- Make Neutral Atom available to select, with its parameters.
- Get rid of Trapped Ion.
- Get rid of Dynamic Memory Compute.
- Make sure Magic Up-to-Clifford cannot be used with Majorana architecture.
- Make a pareto curve on the comparison page containing the pareto curve of
  each run being compared.
- Pareto row selected when viewing a result should represent that run.
- Export and rerun button on the result page.
- Delete selected runs on the history page.
- Instead of moving to the compare page when clicking "compare selected" on
  run history when an insufficient number of runs is selected, show a
  warning instead.
- Make the comparison page look nicer.
