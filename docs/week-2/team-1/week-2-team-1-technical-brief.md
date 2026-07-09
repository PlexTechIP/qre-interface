# Week 2 — Team 1 — Technical Brief: Run Dashboard (Configuration UI)

Your track: the **Run Configuration** surface — SOW Part 1, items 2–4. You turn
a user's intent into a valid, contract-conformant `RunConfig` and hand it to
the engine boundary. You are the *producer* side of the contract.

> The configuration surface has **seven inputs** with conditional sub-fields
> and coupling rules (below), per `docs/data-contracts.md` and `contracts/`.
> Form structure, validation, and serialization should build from this brief
> and the committed contract artifacts.

## The one interface you talk to

```ts
// committed in contracts/types.ts — import it, never re-declare it
interface EstimatorService {
  run(config: RunConfig): Promise<RunResult>;
  // week 3+: cancel(runId), onProgress(...) — don't build these yet
}
```

**You build the week-2 `MockEngine implements EstimatorService`** (you're its
only consumer, and week 3 uses it as the reference behavior of the boundary).
Land it in `app/src/shared/` (or your Vite equivalent, structured to move) to
this exact spec:

- Validates the incoming config against the committed
  `contracts/runconfig.schema.json` (Ajv + ajv-formats) and **rejects** the
  promise on schema-invalid input — a real engine won't accept off-contract
  input, so the mock mustn't either.
- Waits ~2s (so the running state is visible), then resolves with a committed
  fixture: `runresult.success.json` by default, `runresult.failed.json` when
  switched into failure mode (use that for your error path).
- Stamps the returned fixture's `runId = config.id` and fresh
  `startedAt`/`completedAt`; clones the fixture so repeated runs never mutate
  shared state.

**If your UI works against this mock and your `RunConfig` validates against
the schema, the week-3 swap to the real engine costs you nothing** — and a
clean swap is what lets week 3 pull run-history work forward (see the swap
gate in `docs/timeline-and-milestones.md`).

## State model (recommended shape)

Keep *one* form-state object per draft run, and make `toRunConfig(state)` a
pure function you can unit-test:

```
FormState  --toRunConfig()-->  RunConfig  --EstimatorService.run()-->  RunResult
   ▲                              |
   └── validation errors ─────────┘  (schema + semantic validation)
```

- Validate at two levels: **field-level** (inline, as the user types) and
  **submit-level** (final schema validation of the serialized `RunConfig` —
  use the committed JSON Schema, don't re-encode the rules by hand).
- `RunConfig.id` (UUID) and `createdAt` are stamped at Run-click, not while
  editing.
- Don't invent config persistence — drafts live in memory this week
  (persistence is Part 2).

## The seven inputs — fields, defaults, validation

Full rules in `docs/data-contracts.md` §Validation rules; UI view of them:

| # | Input | UI shape | Defaults & validation |
|---|---|---|---|
| 1 | **Application** | Benchmark selector (searchable, with descriptions) **or** file upload | Benchmarks: Shor's Factoring, Ekerå-Håstad Factoring, Quantum Dynamics, Grover's Search, Phase Estimation (canonical ids live in `contracts/benchmarks.json`). Upload: Q# / OpenQASM / QIR file + an **"Add Program"** option that adds it to the benchmark list |
| 2 | **Physical Architecture** | Type toggle (GateBased default / Majorana) revealing that type's fields only | GateBased: error rate (default 1e-4; 0<x<0.01), **gate time (required, >0, no default)**, **measurement time (required, >0, no default)**, two-qubit gate time (optional). Majorana: error rate select 1e-4/1e-5/1e-6 (default 1e-5), operation time (default 1000 ns; >0) |
| 3 | **Error Correction Code** | Displayed, derived from architecture | GateBased → Surface Code (default); Majorana → Three-Aux. Never offer an invalid pairing — show the derived code with a one-line why |
| 4 | **Magic State Factory** | Radio: Round-Based (default) / Litinski19 | **Litinski19 only for GateBased with error rate ≤ 1e-3** (disable with in-place reason otherwise — note the legal GateBased range extends to 0.01, so the option genuinely toggles as error rate moves); Majorana: Round-Based only |
| 5 | **Trace Transform** | Type choice revealing sub-fields | PSSPC: T states per rotation (default 20; **5 ≤ x ≤ 20**), CCX magic states (default off). Lattice Surgery: slowdown factor shown fixed at 1.0 (“optimistic”), not editable |
| 6 | **Max Error** | Numeric input | Default **1.0** (= unconstrained); **0 < x ≤ 1** (1 is valid — this is a *cap* on total error, not a budget). In-range values can still be unsatisfiable → that's a failed run, not a validation error |
| 7 | **Run Name** | Optional text | When blank, auto-generate from the config (benchmark · architecture · QEC · transform) and show the generated name before Run |

Static sources (benchmark list, canonical ids) live in one constants module
read from `contracts/benchmarks.json`. The **QRE version** read-only display
can use a local constant this week; week 3+ reads it from the engine at
runtime.

**Upload scope this week:** the file picker, format selection (Q# / OpenQASM /
QIR), the "Add Program" affordance, and emitting the `uploaded` application
variant are yours. *Parsing/compiling* the uploaded program is the engine's
job (fail-soft `INVALID_CONFIG`/`COMPILE_ERROR` — your UI just needs to
surface those failures through the normal failed-run path).

## Conditional rules (the schema enforces them — you explain them in place)

Three couplings drive most of your conditional UI; users must always see *why*
something is fixed or disabled:

1. **Architecture → QEC:** the QEC code is derived (Surface Code / Three-Aux),
   not freely chosen.
2. **Architecture + error rate → factory availability:** Litinski19 is only
   selectable on GateBased runs with error rate ≤ 1e-3; switching architecture
   or raising the error rate must visibly re-disable it (and fall back to
   Round-Based) with an explanation, never silently.
3. **Transform type → sub-fields:** PSSPC's two knobs vs. Lattice Surgery's
   fixed display swap with the type.

## UX intent (from the SOW, non-negotiable)

- **Configuration simplicity is a stated project objective.** The defaults
  path must produce a valid run in under a minute. Note the spec's one
  intentional friction: GateBased **gate time and measurement time have no
  defaults** — the fastest valid run is "pick a benchmark, type two numbers,
  Run." Design so those two fields are impossible to miss; everything else
  stays defaulted.
- Users are analysts, not quantum programmers. Copy explains *consequences*
  ("smaller max error → more physical qubits / longer runtime"; "Litinski19
  needs better qubits, but its factories are cheaper"), not just definitions.
- The seven inputs are the spec's list — resist adding knobs beyond the
  reference design this week.

## Boundaries — what is NOT yours this week

| Not yours | Whose |
|---|---|
| Rendering the result that comes back — **including rendering the failure content** | Team 2 (you hand every finished `RunResult` — succeeded *or* failed — to their surface via the seam props; your chrome adds the Retry / Edit-configuration affordances around it) |
| The real engine behind `EstimatorService` | Team 3 (you build only the `MockEngine` per the spec above) |
| Parsing/compiling uploaded program files | Team 3's engine (you emit the `uploaded` variant; failures come back as failed runs) |
| Contract/fixture/benchmark-list edits | PMs, via contract-change process |
| Run persistence, history, Rerun | Part 2 (weeks 4–5; may start mid-week-3 if the swap gate passes) |

## Quality bar

- Strict TS, no `any` at boundaries; `toRunConfig` unit-tested against the
  schema; components keyboard-navigable; no dead-end states (every error has
  a next step for the user).
