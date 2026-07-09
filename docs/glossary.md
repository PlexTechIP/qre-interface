# Glossary

Project and QRE domain terms, in plain language. For depth, see
`Intro_to_QRE.md` (repo root) and Microsoft's
[resource estimator docs](https://learn.microsoft.com/en-us/azure/quantum/intro-to-resource-estimation).

## Project terms

| Term | Meaning |
|---|---|
| **Run** | The app's basic unit: one locally executed resource estimation — a frozen `RunConfig` plus its `RunResult`. Immutable once executed. |
| **RunConfig** | The JSON shape describing a configured run going *in*: application, physical architecture, error correction code, magic state factory, trace transform, max error, run name. See `data-contracts.md` (v1). |
| **RunResult** | The JSON shape coming *out*: a Pareto frontier of estimate rows (six default fields each), status/version metadata, and a `raw` blob preserving the full QRE output. See `data-contracts.md` (v1). |
| **Rerun** | History action that opens Run Configuration pre-filled from an existing run, to re-execute with modified parameters. The original run is untouched. |
| **Pareto frontier** | The set of non-dominated estimates a run returns — each row is an optimal trade-off (e.g., fewer qubits vs. shorter runtime; no row is better on every axis). Rendered as the Results table and the qubits-vs-runtime graph. |
| **Comparison set** | A user-selected group of runs compared side-by-side (tables + charts) on the Comparison page. |
| **Benchmark** | A pre-packaged quantum program (with metadata) users can select as the application model, without writing code. Ships in a benchmark library, updatable from a controlled repository. |
| **Contract freeze** | The moment the PMs commit `RunConfig`/`RunResult` shapes. After a freeze, changes require PM sign-off. |
| **Mock engine** | A fake `EstimatorService` implementation returning canned `RunResult` fixtures, so UI teams can build without waiting on real QRE execution. |
| **QRE / the engine** | Microsoft's Quantum Resource Estimator v3, bundled with the app and executed locally. Note: "v3" is the estimator *generation*, not a package version — packages self-report their own version strings, and that self-reported string is what `qreVersion` records. |
| **Error code** | The enumerated `RunResult.error.code` values a failed run carries: `INVALID_CONFIG`, `COMPILE_ERROR`, `ESTIMATION_FAILED`, `TIMEOUT`, `ENGINE_CRASH`. See `data-contracts.md`. |

## Quantum resource estimation terms

| Term | Meaning |
|---|---|
| **Resource estimation** | Computing what it would take — qubits, time, T states — to run a quantum algorithm on a future fault-tolerant quantum computer, under stated hardware assumptions. No quantum simulation happens; it's an analytical model. |
| **Physical qubit** | An actual hardware qubit. Noisy and error-prone; thousands may be needed per logical qubit. |
| **Logical qubit** | An error-corrected "virtual" qubit encoded across many physical qubits by a QEC scheme. Algorithms are written in terms of logical qubits. |
| **QEC (quantum error correction) code** | The encoding that turns physical qubits into logical ones. In this app it's coupled to the architecture: **Surface Code** for GateBased, **Three-Aux** for Majorana. Determines physical-per-logical qubit ratio, logical cycle time, and error suppression. |
| **Code distance** | The size parameter of the QEC code — larger distance suppresses more error but costs more physical qubits and time. Default result field. |
| **Total error** | The total logical error probability of the whole computation. Default result field; the run's **Max Error** input caps it. |
| **Logical cycle time** | Duration of one logical clock cycle (one round of error-corrected logical operation). Output metric. |
| **Magic state / T state** | A special quantum resource required for universal fault-tolerant computation. Magic states are expensive: they must be manufactured by dedicated factories, which can dominate qubit counts. **Factories used** (state type × number of copies) is a default result field. |
| **Magic State Factory** | The subsystem that produces high-quality magic states. Configuration input: **Round-Based Factory** (default) or **Litinski19 Factory** (GateBased architectures with error rate ≤ 1e-3 only; Majorana always uses Round-Based). |
| **Trace Transform** | How the algorithm's logical operation trace is compiled onto the error-corrected fabric. Configuration input: **PSSPC** (with T-states-per-rotation and CCX-magic-states settings) or **Lattice Surgery** (fixed slowdown factor 1.0). |
| **PSSPC** | Pauli-based trace transform whose knobs are **T states per rotation** (5–20, default 20 — T states spent synthesizing each arbitrary rotation) and **CCX magic states** (whether CCX/Toffoli gates consume dedicated magic states; default false). |
| **Max Error** | Configuration input: the cap on total logical error probability, in (0, 1], default 1.0 (= unconstrained). It bounds the result's **total error** rather than being split up front. |
| **Runtime** | Total runtime of the algorithm under the modeled architecture. Default result field (single-shot runtime and expected shots are among the optional fields). |
| **Physical Architecture** | The physical hardware assumptions. Configuration input: **GateBased** (error rate, gate time, measurement time, optional two-qubit gate time) or **Majorana** (error rate 1e-4/1e-5/1e-6, operation time). |
| **Application** | The quantum program whose resources are being estimated — a benchmark from the library (Shor's Factoring, Ekerå-Håstad Factoring, Quantum Dynamics, Grover's Search, Phase Estimation) or an uploaded **Q# / OpenQASM / QIR** program, which "Add Program" can add to the library. Configuration input. |
| **Q# / OpenQASM / QIR** | The program formats accepted for uploaded applications. |
| **QDK** | Microsoft's Quantum Development Kit — the open-source toolkit QRE ships in. |
| **Space-time diagram** | QRE visualization of the tradeoff between physical qubits (space) and runtime (time); candidate for advanced comparison views (Part 5). |
