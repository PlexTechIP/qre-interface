# Project Overview — QRE Dashboard

## What we're building — in one paragraph

A **standalone desktop application (macOS + Windows)** that wraps Microsoft's
open-source **Quantum Resource Estimator (QRE v3)** in a simplified, structured
interface. Today, QRE is used through VS Code or the command line, which works
for quantum researchers but not for the government and industry analysts who
use QRE as a benchmarking and evaluation tool. Our app lets those users
**configure** an estimation run, **execute** it locally against a bundled QRE
engine, **save** every run as an immutable record, **compare** runs across
hardware architectures and error-correction schemes, and **export** results
(Markdown-first) for reports and downstream analysis.

## The core concept: the *run*

Everything in the app revolves around a **run** — one locally executed resource
estimation. General flow: set configurations for the run → click Run and
display results → runs accumulate in a history (with all data about each run) →
multi-run comparison. A run is defined by these configuration inputs:

1. **Application** — a benchmark from the library (Shor's Factoring,
   Ekerå-Håstad Factoring, Quantum Dynamics, Grover's Search, Phase
   Estimation) **or an uploaded program file** (Q#, OpenQASM, or QIR), with an
   "Add Program" option that adds the upload to the benchmark list.
2. **Physical Architecture** — GateBased (default; error rate, gate time,
   measurement time, optional two-qubit gate time) or Majorana (error rate
   from 1e-4/1e-5/1e-6, operation time).
3. **Error Correction Code** — coupled to the architecture: Surface Code
   (GateBased, default) or Three-Aux (Majorana).
4. **Magic State Factory** — Round-Based (default) or Litinski19 (GateBased
   with error rate ≤ 1e-3 only).
5. **Trace Transform** — PSSPC (T states per rotation, CCX magic states) or
   Lattice Surgery (fixed slowdown factor).
6. **Max Error** — the total tolerated logical error probability, as a cap
   (default 1.0 = unconstrained).
7. **Run Name** *(optional)* — auto-generated from the configuration when
   left blank.

The QRE engine version is captured on every run so results stay reproducible
as QRE updates.

A run produces a **Pareto frontier of estimates** — one or more optimal
trade-off points, each reporting at minimum: physical qubits, runtime, logical
cycle time, factories used, total error, and code distance (six defaults of up
to 37 possible fields; a typical run reports ~10–15) — plus the full raw QRE
output, which we always preserve.

Runs are **immutable**: you never edit a run, you **rerun** it — the Rerun
action pre-fills a new configuration from an existing run for re-execution
with modifications. This is what makes history trustworthy and comparison
meaningful.

## Who it's for

Government and industry users who treat QRE as a **decision tool**: they want
resource estimates, architecture comparisons, and benchmark-level analysis —
not a quantum programming environment. Design for **configuration simplicity,
metric interpretability, and comparison**, not for code editing.

## Scope, by SOW part

| SOW Part | What it covers | Target window (see timeline) |
|---|---|---|
| **Part 1: Core Estimation Workflow** | Desktop app shell, unified dashboard, configuration of all run inputs, local execution, result display + filtering | Weeks 1–3 |
| **Part 2: Run History, Traceability, Comparison** | Immutable local run records, history UI (view details / rerun / delete / export Markdown, with search + filters), comparison workspace with tables + bar charts | Weeks 4–5 |
| **Part 3: Export, Versioning, Maintainability** | Markdown-first export of runs & comparison sets, bundled baseline QRE v3, per-run version tracking, pull-oriented app + benchmark-library updates | Weeks 6–7 |
| **Part 4: Final Outcomes** | Packaged macOS/Windows apps, final presentation, documentation, recommendations | Weeks 8–9 |

Key contract dates: **Midterm deliverable Fri Jul 24**,
**Final deliverable + report Fri Aug 28**.

## The four main surfaces of the app

These come from the mockup specification and map directly onto the SOW:

1. **Run Configuration** — where a user fills out the seven inputs above and
   launches a run.
2. **Results Area** — the output fields of a completed run, with filtering
   over which values are in view (display, table, **and** graph):
   - a **Pareto Frontier table** — one row per estimate, showing the six
     default fields (physical qubits, runtime, logical cycle time, factories
     used, total error, code distance) plus whatever the filter adds;
   - a **Pareto Frontier graph** — physical qubits vs. runtime, each table
     row plotted as a point;
   - optionally a **larger display** of the selected row's values;
   - the full raw output always reachable.
3. **Run History Area** — the list of all saved runs. Each record carries the
   run name, full configuration, date/time, QRE version, and everything from
   the Results area. Filterable by run-name search, application, physical
   architecture, error correction code, magic state factory, and QRE version.
   Actions per run: **View Details**, **Rerun** (opens Run Configuration
   pre-filled from the selected run), **Delete**, and **Export Markdown** of
   the run's results.
4. **Comparison page** — select runs from History and compare them
   side-by-side: a table of each selected run's selected result fields (the
   six defaults by default), comparison graphs (likely bar charts: physical
   qubits, runtime, logical cycle time, physical factory qubits, total error,
   and code distance per run), and an export covering the selected runs'
   configurations, timestamps, QRE versions, and the comparison table.

## What "good" looks like

- **Reproducible:** any saved run can be understood and re-derived later — full
  config, QRE version, timestamp, full raw output.
- **Simple on the surface, rigorous underneath:** an analyst can set up a
  sensible run in under a minute using defaults; an expert can still reach the
  detailed knobs and full QRE output.
- **Local and reliable:** everything runs offline on the user's machine —
  execution, storage (SQLite), export.
- **Comparable:** the app's differentiating value is making cross-architecture
  and cross-configuration comparison effortless.

## What we are explicitly NOT building

- A quantum program editor or IDE (users select/import programs; they don't write them here).
- A cloud service — no accounts, no server-side execution, no telemetry.
- A replacement for QRE itself — we bundle and orchestrate the real engine;
  we never re-implement or approximate its math.

## Learn the domain

Read `Intro_to_QRE.md` (repo root) and skim
[Microsoft's resource estimator docs](https://learn.microsoft.com/en-us/azure/quantum/intro-to-resource-estimation).
Then read `docs/glossary.md`. You don't need to understand quantum error
correction deeply, but you must know what each input and output metric *means*
to a user — you're building the interface that explains it to them.
