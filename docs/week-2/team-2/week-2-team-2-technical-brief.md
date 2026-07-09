# Week 2 — Team 2 — Technical Brief: Compare Dashboard (Output Display & Filtering)

Your track: the **Results Area** — SOW Part 1, items 6–7. You render whatever a
conformant `RunResult` contains: the Pareto frontier prominently (table +
graph), everything else reachably, with field filtering, for an analyst
audience. You are the *consumer* side of the contract.

> A run returns a **Pareto frontier** — one or more estimate rows, each with
> **six default fields** (physical qubits, runtime, logical cycle time,
> factories used, total error, code distance) out of 37 possible (~10–15
> typically reported). See `docs/data-contracts.md` and `contracts/`. Your
> surface renders the frontier as a **table and a scatter graph**.

**PM emphasis for this track: the Results Area is visual-first.** Numbers alone
don't serve this audience — the deliverable includes **graphs, tables, and
visualizations, interactive where possible** (see §Visuals are the deliverable
below). A screenshot of your surface should read as an instrument panel, not a
printout.

## Component contract (the design that makes week 3 free)

The prop shape is **committed in `contracts/types.ts` as `ResultsAreaProps`** —
import it; both you and Team 1 build against it from Day 0:

```
props in:  { result: RunResult | null,
             phase: "idle" | "running" | "done",
             config?: RunConfig | null }   // the producing config, for your summary
knowledge: contracts/runresult.schema.json — and NOTHING else
```

Your surface is a **pure function of a `RunResult`**. It does not know whether
the result came from a mock, the real engine, or (in week 4+) a SQLite record —
which is exactly why it survives all three transitions unchanged. No fetching,
no `EstimatorService` calls, no engine imports. Data arrives as props from the
parent seam defined by `contracts/types.ts`; placement is handled by the app
scaffold / week-3 integration work, not as a week-2 deliverable.

**`phase: "done"` covers succeeded AND failed runs** — you read
`result.status` and render the success view or the failure view. **Failure
content is yours**: `error.code` + `error.message` + a suggested next step.
Team 1's chrome around your surface owns the Retry / Edit-configuration
buttons — don't build those.

## The `frontier` / `raw` split — why it matters to you

- **`frontier`** is the curated projection: an array of Pareto-optimal
  estimate rows. Every row is contract-guaranteed the **six default fields**
  (physical qubits, runtime, logical cycle time, factories, total error, code
  distance), each as `{value, unit, display}`; further fields (of the 37 in
  the `data-contracts.md` appendix — typically ~10–15 arrive) ride along per
  row and are what your filter exposes. A `value` can legitimately be `0`,
  and some appendix fields are non-numeric (e.g. `source`, `FEASIBILITY`) —
  information, not gaps. Render defensively ("—" beats a crash), but design
  for zeros and strings, not for missing default fields.
- **A frontier can have one row.** A one-row result is still a table
  with one row and a graph with one point — the layout must not look broken
  when the trade-off space collapses.
- **`raw`** is the complete, verbatim QRE output — and it's where *shape
  varies* by configuration and engine version. The SOW requires "additional
  QRE-provided metrics" available and "full output availability" behind
  filtering — that's your raw explorer. Treat `raw` as *schema-less*: render
  whatever object arrives (key/value tree with collapsible nesting). On
  failures, `raw` carries the engine's verbatim diagnostics — or is **`null`**
  when the engine produced nothing (TIMEOUT / ENGINE_CRASH); your failed view
  must work in both cases.
- **Never compute from `display`.** Math, sorting, plotting, and comparisons
  use `value` + `unit`. `display` is a convenience; your own formatters may
  supersede it where the reference design demands.

## Filtering (SOW Part 1.7 — read carefully)

"Provide filtering controls for metric selection **while preserving full
output availability**." Practical interpretation:

- The user chooses which **result fields** are in view, and the choice
  applies everywhere the data shows — **the detail display, the table's
  columns, and (where sensible) the graph** — over whatever fields the run
  reports (~10–15 of the 37; the six defaults start visible).
- Filtering hides from *view*; it never drops *data*. Full output stays one
  interaction away regardless of filter state (the raw explorer always has
  everything).
- Filter state persists in memory across result switches this session.
  (Persistence of preferences = later.)

## Visuals are the deliverable (PM emphasis — read this twice)

Analysts decide from pictures. The spec itself is visual: the frontier is
delivered as a **table and a graph**, and the graph is how an
analyst *sees* the trade-off space.

| Visual (required) | What it is | Details |
|---|---|---|
| **1. Pareto Frontier table** | One row per frontier estimate | Columns: the **six default fields** (physical qubits, runtime, logical cycle time, factories used, total error, code distance) plus whatever the field filter adds (of the ~10–15 reported per row). Rows are **selectable**; formatted values from your formatting module |
| **2. Pareto Frontier graph** | Scatter: **physical qubits (y) vs. runtime (x)** | Every table row plotted as a point — the shape of the frontier (fewer qubits ⇄ longer runtime) is the payoff. Axes labeled with formatted ticks; handles one-point frontiers and wide magnitude ranges (log-friendly scales where the design allows) |
| **3. Selected-row detail ("larger display")** | The selected row's full field set, larger | Selecting a table row or a graph point shows all its reported values prominently. The spec marks this "maybe" — treat it as **strongly recommended**; it's also the natural home for the non-default fields the filter reveals |

**Selection is the connective tissue:** clicking a graph point selects its
table row and vice versa — one shared selection state. That link is what makes
the surface feel like an instrument panel instead of two disconnected widgets.

**Interactivity bar:**

- *Required:* every graph point and table row is selectable, and every point
  exposes a tooltip with its key values (exact + formatted) — reachable by
  **hover AND keyboard focus**; table↔graph selection sync; the field-filter
  controls; the collapsible raw explorer.
- *Stretch, if time allows:* the selected-row detail panel (visual 3) if you
  don't make it core; a fields-vs-rows column sorter on the table; clicking
  through from a row to its `raw` section in the explorer.

**Implementation guidance:** a scatter plot and a table are still
**hand-rolled, accessible SVG (or CSS) territory** — keep the bundle light.
The project-wide charting-library ruling (Recharts vs. Plotly,
`docs/tech-stack.md`) is deliberately deferred to the comparison work — **do
not adopt a heavy charting dependency this week without PM sign-off in the
channel.** Build the table, scatter, and tooltip as standalone components
taking plain props (rows + accessors + a formatter): week 5's comparison
graphs and week 6's export reuse them, and any later library swap stays
contained.

**Visual correctness rules:** tooltip and axis numbers come from your
formatting module (`value` + `unit` — never parse `display`); every visual has
a text equivalent (the table IS the graph's universal fallback — same data,
same order); color is never the only encoding (a selected point is also
bigger/ringed, not just recolored); legible in both light and dark themes.

**Fixture data:** use the committed fixtures in `contracts/fixtures/` as your
dev switcher data. They cover multi-row success, formatting stress,
sparse/one-row success, and failure states.

## States are half your track

Analysts trust tools that fail legibly. Your surface owns:

| State | Trigger | Must show |
|---|---|---|
| Empty | No run yet (`phase = "idle"` / `result = null`) | Orientation ("configure a run to see results"), not blank space |
| Running | `phase = "running"` | Progress affordance per reference design |
| Done/success | `phase = "done"`, `status = "succeeded"` | The frontier table + graph described above |
| Failed | `phase = "done"`, `status = "failed"` | `error.code` + `error.message` rendered usefully + what to try next. Canonical codes are enumerated in `data-contracts.md`; render *unknown* codes gracefully too. Works with `raw` diagnostics present **and** with `raw = null` |
| Sparse | success with few reported fields, zero values, and/or a **single-row frontier** | Graceful handling — no crashes, no `undefined`, no `NaN`; unreported fields simply aren't offered by the filter; a one-point graph and one-row table still look intentional; `0` reads as a fact, not an error |

The frozen fixtures cover each state with a producing `runconfig.*` partner
per fixture (multi-row success, formatting-stress, sparse/single-row, failed);
your dev fixture-switcher loads them.

## Formatting realities of QRE data

Real estimator values span dozens of orders of magnitude in one view: qubit
counts from thousands to tens of millions, error probabilities down to ~1e-19,
factory counts from 0 upward, and runtimes anywhere from nanoseconds to
**years** on slow architectures. The contract includes non-numeric fields (`source`,
`FEASIBILITY`, `NAME`, `ASSUMPTIONS`, `MOLECULE`) that pass through as
strings. Build one tested formatting module: SI/engineering notation rules,
unit promotion (ns → µs → ms → s → min → hr → **yr**), thousands separators,
compact magnitudes (k/M/B/T), zero handled cleanly, string fields passed
through untouched, and a consistent significant-figures policy. This module
will be reused by Comparison (week 5) and Export (week 6) — write it as a
standalone utility.

## Boundaries — what is NOT yours this week

| Not yours | Whose |
|---|---|
| Producing/fetching results, calling `run()` | Team 1 (UI trigger) + Team 3 (engine) |
| Config form | Team 1 |
| Run history list, comparison views | Part 2 (weeks 4–5) — your metric display, formatters, **and single-run visual components** will be reused there, so build them cleanly |
| **Multi-run comparison charts** (runs × metrics) | Week 5 — this week's required visuals are **single-run** only |
| Picking the project charting library (Recharts vs. Plotly) | PMs, with the comparison work — hand-rolled SVG/CSS this week (see §Visuals) |
| Contract/fixture edits | PMs, via contract-change process |

## Quality bar

Strict TS; renders **every** committed fixture without error (test-enforced);
formatting utilities unit-tested; keyboard-accessible filtering **and
keyboard-accessible interactive visuals** (tooltips reachable by focus, toggle
operable by keyboard); every visual has a text equivalent and doesn't rely on
color alone; no dead-end error states.
