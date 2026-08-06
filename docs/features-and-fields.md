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

#### Shor's Factoring

| Hyperparameter | Type | Default |
|---|---|---|
| Bit Size | int `[>= 2]` | 31 |
| Generator | int `[>= 2]` | 11 |

#### Ekerå-Håstad Factoring

| Hyperparameter | Type | Default |
|---|---|---|
| RSA Instance | Pick 1: `RSA-100 (330-bit)`, `RSA-1024 (1024-bit)`, `RSA-2048 (2048-bit)` | RSA-100 (330-bit) |
| Generator | int `[>= 2]` | 7 |

#### Quantum Dynamics

| Hyperparameter | Type | Default |
|---|---|---|
| Lattice N₁ | int `[>= 1]` | 10 |
| Lattice N₂ | int `[>= 1]` | 10 |
| Total Time | float `[> 0]` | 30.0 |
| Trotter Step | float `[0 < Trotter Step <= Total Time]` | 0.9 |
| Coupling J | float `[any]` | 1.0 |
| Field g | float `[any]` | 1.0 |

#### Grover's Search

| Hyperparameter | Type | Default |
|---|---|---|
| Search Qubits | int `[>= 1]` | 5 |
| Iterations | int `[>= 1]` | Computed from Search Qubits upon estimation |

#### Phase Estimation

| Hyperparameter | Type | Default |
|---|---|---|
| Precision | int `[>= 1]` | 6 |
| Register Size | int `[>= 1]` | 3 |

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

### Memory Optimization (optional, default = None)

- 1D Yoked Surface Code
- 2D Yoked Surface Code

### Trace Transform

#### PSSPC

| Field | Type | Default | Notes |
|---|---|---|---|
| T Count Per Rotation | int `[5 - 20]` | 20 | |
| CCX Magic States | bool | False | Bound to GSJ24 CCX Factory |

### Lattice Surgery

| Field | Type | Default |
|---|---|---|
| Slow Down Factor | float, fixed at `1.0` | 1.0 |
| Total Fault Tolerant Execution Error | float `[0.01 - 1.0]` | 1.0 |

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

- Hyperparameters are serialized and validated, but are **not** part of
  `RunConfig`.
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
