# Week 2 — Team 3 — Technical Brief: Engine & Execution

Your track: SOW Part 1, items 1, 3, 5 — run **QRE locally** as a bundled
engine. You consume `RunConfig`, execute a real estimation, and emit a
conformant `RunResult`. **No UI.** Your "interface" this week is a conformance
harness; your customers are next week's integrated app and the contract.

> Read `docs/data-contracts.md` first. The product contract requires an engine
> surface with **parameterized architectures, selectable magic-state factories
> (Round-Based / Litinski19), trace transforms (PSSPC / Lattice Surgery),
> Three-Aux QEC, max-error caps, and Pareto-frontier output** (multiple
> estimate rows; up to 37 fields each). **Identifying and proving the package +
> API that exposes this surface** (the `qdk` estimation surface is the prime
> candidate) is the core of your spike. Your real output captures are the basis
> for PM fixture verification, so this is on the project's critical path.

You are also carrying this week's biggest project risk: if local QRE execution
doesn't work, nothing downstream matters. That's why the checklist front-loads
the spikes — and why the Wed-EOD escalation gate matters even more this week.

## The two candidate routes — prove API coverage first

QRE ships in Microsoft's open-source QDK; the core is Rust with JS/WASM and
Python bindings. **Step zero of the spike: find which package + API version
exposes the product feature set** (factories, trace transforms, Three-Aux,
max-error, Pareto-frontier output). The **`qdk`** estimation surface is the
prime candidate. Then evaluate the two packaging routes against *that* surface
(**verify details during the spike — this brief is orientation, not gospel**):

### Route A — the QDK's JS/WASM package (npm)

- **For:** in-process under Electron's main process (no external runtime);
  packaging is just `node_modules`; version pinning = package version.
- **Investigate:** does the current npm surface expose the **contract features**
  (parameterized qubit params, factory selection, trace transforms,
  frontier/table output)? Which input formats (Q# source? OpenQASM? QIR)?
  Memory/time behavior on heavy estimates? Worker/child-process isolation so
  a heavy estimate can't freeze the main process?

### Route B — the `qdk` Python package (subprocess)

- **For:** the Python estimation API is typically best-documented and gets
  new estimator features first; full parameter control likely proven there.
- **Investigate:** the same contract feature coverage; bundling a Python runtime
  into a desktop app for macOS + Windows (size, signing, reliability);
  JSON-over-stdio invocation protocol; cold-start latency; version pinning of
  interpreter + package. (`qsharp` PyPI is deprecated in favor of `qdk` —
  evaluate the current package.)

### Decision memo

One page: **which package/API exposes the contract surface** (with evidence —
real output showing frontier rows, factory/transform control), what you got
working on each route, input-format support, packaging implications,
failure-mode control, version-pinning plan, and **your recommendation**.

## Your deliverable's shape

```ts
// EstimatorService is committed in contracts/types.ts — import it, never re-declare
class QreEngine implements EstimatorService {
  run(config: RunConfig): Promise<RunResult>;
}
```

Behind that: translate config → invoke engine → translate output. Keep the
three stages separate and separately testable:

1. **`configToInvocation(config)`** — benchmark id → actual program source
   (see Benchmarks below); architecture/QEC/budget ids → QRE target
   parameters. Pure function, unit-test it. **Validate exactly the contract's
   semantic rules, no more, no less** — in particular the pairing rule below.
2. **`execute(invocation)`** — the only stage that touches the engine.
   Async; enforce a timeout; capture stdout/stderr; never let a crash
   propagate as an unhandled rejection.
3. **`outputToResult(raw, config, timing)`** — build the **`frontier`
   array**: one entry per estimate row, the six default fields extracted
   (numeric `value`, `unit`, `display`), every further reported field mapped
   per the `data-contracts.md` appendix; attach the **complete verbatim
   output as `raw`**, stamp `status`/`error`/`qreVersion`/timestamps. Pure
   function, unit-test it against captured real outputs (multi-row AND
   single-row frontiers).

## Contract obligations (the parts people trip on)

- **`raw` is the complete, unmodified engine output.** Not a summary, not
  re-keyed, not pruned. Team 2's raw explorer and Part 3's exports depend on
  verbatim fidelity; reproducibility is a stated SOW objective. On failures,
  put the engine's verbatim diagnostics in `raw`; `raw: null` is allowed
  **only** when the engine produced nothing at all (TIMEOUT, ENGINE_CRASH).
- **Every frontier value is a number in a declared `unit`** (strings for the
  genuinely non-numeric appendix fields like `source`). If the engine reports
  "19.1 ms", you store the number and unit, not the string (the string can go
  in `display`). On success **every frontier row carries all six default
  fields** — a row missing one means that run is `failed` with
  `ESTIMATION_FAILED`. A value of `0` is legitimate.
- **Failures are results, not exceptions.** Bad program, engine crash,
  timeout → `status: "failed"` + structured `error`. The promise resolves;
  reserve rejections for programmer error (e.g., schema-invalid input —
  though you should validate and fail-soft even there). **`error.code` is the
  canonical enum** in `docs/data-contracts.md` (`INVALID_CONFIG`,
  `COMPILE_ERROR`, `ESTIMATION_FAILED`, `TIMEOUT`, `ENGINE_CRASH`) — Team 2
  renders exactly these; don't invent codes. `error.message` is
  analyst-facing with a suggested next step.
- **`qreVersion` comes from the engine/package at runtime**, never a constant
  — it's the reproducibility anchor for every run ever recorded.

## Config semantics you enforce (exactly these — see data-contracts §Validation)

Catch early with a clean `INVALID_CONFIG` rather than a raw engine string;
enforce **no more, no less** than the contract:

- **Architecture → QEC coupling:** GateBased ⇒ `surface_code`; Majorana ⇒
  `three_aux`. Any other pairing is invalid.
- **Numeric bounds:** GateBased error rate ∈ (0, 0.01); gate/measurement
  times required > 0; optional two-qubit gate time > 0 when present; Majorana
  error rate ∈ {1e-4, 1e-5, 1e-6}; operation time > 0; PSSPC T-states-per-
  rotation ∈ [5, 20]; max error ∈ (0, 1].
- **Factory availability:** `litinski19` only for GateBased with error rate
  ≤ 1e-3; Majorana runs are `round_based` only.
- **In-range but unsatisfiable** (e.g. a tight max error the hardware can't
  reach) is NOT yours to pre-block — run it and let the engine's failure map
  to `ESTIMATION_FAILED` (or surface the engine's own infeasibility signal —
  see the `FEASIBILITY` appendix field — as PMs rule through the
  contract-change process).

## Benchmarks & uploads (week-2 scope)

The starter benchmarks are **Shor's Factoring, Ekerå-Håstad Factoring,
Quantum Dynamics, Grover's Search, Phase Estimation** (canonical ids live in
`contracts/benchmarks.json`). You make every id real: source
programs for each, stored in-repo with id + name + description metadata —
this seeds Part 3's benchmark library. Confirm during the spike where each
comes from in the chosen engine's samples/library, and flag any that don't
exist there to the PMs immediately.

**Uploaded programs are in scope** (`qsharp` / `openqasm` / `qir`): the engine
accepts the `uploaded` application variant, compiles/ingests the file, and
fails soft (`INVALID_CONFIG` for unsupported/garbled input, `COMPILE_ERROR`
for programs that don't compile). Prove at least one uploaded program
end-to-end this week; deep format coverage can follow.

Unknown benchmark ids fail-soft with `INVALID_CONFIG`; adding an id is a
contract change, not a registry edit.

## Real output capture (do this EARLY)

The PMs verify fixture fidelity against your captures from the chosen engine
surface. As soon as the right API runs:

- Capture verbatim output for a spread of configs — a multi-row frontier, a
  single-row frontier, a formatting-stress config, and a real failure — and
  hand them to the PMs.
- Include at least one capture per architecture type and one per trace
  transform, so the fixtures exercise the conditional space.
- New configs the PMs request go through the contract-change process; capture
  turnaround is expected to be same-day.

## Boundaries — what is NOT yours this week

| Not yours | Whose |
|---|---|
| Any UI, even a debug panel | Teams 1–2; your harness is CLI/tests |
| Wiring into the Config UI | Week 3 (PM-coordinated swap) |
| SQLite persistence of results | Part 2 |
| Auto-update / benchmark-library update mechanisms | Part 3 (your benchmark metadata seeds it) |
| Contract edits | PMs via contract-change process — you *propose*, they arbitrate |

## Quality bar

Strict TS; the three stages unit-tested (translation stages against fixtures +
captured outputs); conformance harness green on every committed `runconfig`
fixtures; no hardcoded absolute paths; engine invocation can't hang
its caller (timeout enforced).
