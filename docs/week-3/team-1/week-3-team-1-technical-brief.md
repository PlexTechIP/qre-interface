# Week 3 — Team 1 — Technical Brief: Run History UI + Comparison UI

Your track: **two full page tabs** — the **Run History** surface and the
**Comparison** surface — SOW Part 2 (Run History, Traceability, Comparison). You
render the list of every saved run and its per-run actions, you let analysts select
runs and compare them side by side, and you reuse Team 2's already-merged Results
components throughout. You are the *consumer* side of the new run-record contract —
the same posture you had toward `RunResult` in week 2, one surface up. **Build both
tabs to the reference design (Figma):**
<https://frolicking-zabaione-b67d47.netlify.app/> (the History and Comparison
frames); where Figma and this brief disagree on layout, follow Figma and flag it.

> The **Run History Area** (`docs/project-overview.md`) is the list of all saved
> runs. Each record carries the run name, full configuration, date/time, QRE
> version, and everything from the Results area. It is filterable by run-name
> search, application, physical architecture, error correction code, magic state
> factory, and QRE version. Per-run actions: **View Details**, **Rerun** (opens
> Run Configuration pre-filled), **Delete**, and **Export Markdown**.

## What's already built — and what you reuse

Your week-2 Run Configuration surface is **merged on `main`** and stays as-is
this week (a short post-swap smoke check aside). Team 2's Results surface is
also merged. The PMs composed the two into one app (see `../week-3-overview.md`
§Building on the already-merged integration for the full recipe): Team 2's shell
+ `styles.css` (design tokens + light/dark) is the baseline, Team 1's form + run
flow dropped in on top, and Team 1's disposable `ResultsSeam` stub was swapped
for Team 2's real `<ResultsArea>` against the same `ResultsAreaProps`. Two
consequences for you: **contract types import from the canonical `shared/types`**
(the duplicate `shared/contracts/types.ts` was dropped in the merge), and
**`ResultsArea` is already wired and styled** on `main`.

**You do not rebuild the frontier table/graph** — the Run History detail view
renders a saved run by handing its `RunResult` + `RunConfig` to Team 2's
`ResultsArea` via `ResultsAreaProps` (`phase: "done"`) — the same seam the merge
already exercises. A saved run — success *or* failure — must display exactly
like a fresh one. That reuse is the whole point of building Results as a pure
function of a `RunResult` in week 2.

## The interfaces you talk to

These PM-owned seams are **already committed to `contracts/types.ts`** (and its
`app/src/shared/types.ts` copy) — import them, never re-declare them:

```ts
// committed in contracts/types.ts (Part 2 additions)
interface RunStore {
  save(record: RunRecord): Promise<void>;       // Team 2's write path
  list(): Promise<RunRecord[]>;                 // newest-first
  get(id: string): Promise<RunRecord | null>;
  delete(id: string): Promise<void>;
  query(filter: RunFilter): Promise<RunRecord[]>;
}

// the Rerun reconstruction helper — PROVIDED (call it; do not re-implement)
function reconstructConfig(
  record: RunRecord,
  stamp: { id: string; createdAt: string },   // a fresh id + createdAt for the new run
): RunConfig;
```

**You build against the provided `InMemoryRunStore`**
(`app/src/shared/runStore.ts`), seeded with `MOCK_RUN_RECORDS` — the same
decoupling trick as week 2's MockEngine, except you no longer hand-roll the mock
store. If your UI consumes `RunRecord`/`RunStore` exactly as typed, the week-4
swap to the real SQLite store costs you nothing.

## The record you render (PM-owned — do not freeze it yourself)

A **`RunRecord`** is an **immutable** saved run, and it is deliberately minimal:
`{ schemaVersion, id, config, result, savedAt }`, where
`id === config.id === result.runId`. The values your list and filters need are
**derived from `config`/`result`**, not duplicated on the record — the run name
is `config.name`, the architecture is `config.architecture.type`, the QEC code is
`config.qecCode`, the authoritative engine version is `result.qreVersion`, and the
run's launch time is `config.createdAt` (`savedAt` is when it was persisted). You
never edit a record — that's what makes history trustworthy and Rerun (not edit)
the only way to iterate. Treat it as read-only: render it, filter it, delete it,
or reconstruct a *new* config from it. If a value you need genuinely isn't
derivable, that's a contract-change request to the PMs — propose it, don't add it
locally.

## Component contract (the design that makes the store swap free)

Your surface is a **pure function of the record list + selection + action
callbacks** — no SQLite knowledge, no engine imports, no fetching beyond the
injected `RunStore`:

```
props in:  { records: RunRecord[],            // from RunStore.list()/query()
             selectedId: string | null,
             onViewDetails(id), onRerun(record),
             onDelete(id), onExport(record) }
knowledge: RunRecord + RunStore types — and NOTHING about how they're stored
```

This is why it survives the store swap unchanged: it does not know whether the
records came from the mock or real SQLite. Placement into the app shell is
integration work, not a week-3 deliverable.

## Search & filters — the analyst's entry point

Filtering here is **record selection**, not field selection (that was week 2).
The filter set is fixed by the SOW:

| Control | Shape | Notes |
|---|---|---|
| **Run name** | Search box (substring, case-insensitive) | Matches the record's name |
| **Application** | Multi-select / dropdown | Benchmark id or uploaded program |
| **Physical architecture** | Select (GateBased / Majorana) | From the record's config |
| **Error correction code** | Select (Surface Code / Three-Aux) | Derived field, still filterable |
| **Magic state factory** | Select (Round-Based / Litinski19) | From the record's config |
| **QRE version** | Select | The reproducibility anchor — analysts filter by engine version |

Rules: filters are **combinable**; each control's options derive from what's
actually present in the records (don't hardcode a QRE version that never
appears); filtering/search change *view*, never the data (records are immutable;
**Delete** is the only removal and it's explicit); a filtered-to-empty result
reads as an intentional "no matches", distinct from the "no runs yet" empty
state.

## Per-run actions

| Action | This week |
|---|---|
| **View Details** | Reuse Team 2's `ResultsArea` + `ConfigSummary` to render the saved `RunResult` + `RunConfig` (`phase: "done"`). Works for a saved **failed** run too |
| **Delete** | `RunStore.delete(id)` behind a confirm step; list updates; never mutates a record |
| **Export Markdown** | **Stub only** — present the affordance and a placeholder/preview (modal or copyable stub). The real Markdown generator is Part 3 (week 6). Build the seam, not the exporter |
| **Rerun** | Feed the selected record to the provided `reconstructConfig(record, stamp)` (`contracts/types.ts`) to get the pre-fill `RunConfig`. Against mock records, prove the action yields the reconstructed config. **Navigating into the live pre-filled form is week-4 integration** — you own the affordance and the handoff, not the wiring |

## The Comparison surface (second tab — build it fully)

The **Comparison page** (`docs/project-overview.md` §The four main surfaces) lets an
analyst select runs from History and compare them side by side. Like History, it is
a **pure function of a selected set of `RunRecord`s** — no new contract, no store
knowledge; it reads the same records you already render. Build it to the **Figma**
reference.

- **Multi-run selection.** The user picks N runs to compare — via a selection
  control on the Comparison tab and/or a "compare selected" hand-off from History.
  The selected set is the surface's input; a **one-run** and a **many-run**
  selection must both render sensibly.
- **Comparison table.** One **column per selected run**, one **row per result
  field** — the **six default fields** visible by default (physical qubits, runtime,
  logical cycle time, factories used, total error, code distance), with the same
  **field-filter** affordance from week 2 to add/remove rows (reuse Team 2's field
  filter + `formatMetric`; never parse `display`). Each column header carries the
  run's identity: name · application · architecture · QRE version.
- **Comparison bar charts.** Per-metric bar charts across the selected runs —
  **physical qubits, runtime, logical cycle time, physical factory qubits, total
  error, code distance** (the SOW set). One bar per run per metric; labeled,
  formatted axes (via `formatMetric`); handles wide magnitude ranges and a
  single-run selection without looking broken; color is never the only encoding and
  every chart has a text equivalent (the table is it). **Build these with the
  approved charting library (Recharts or Plotly) — do not hand-roll them** (see the
  charting note); format all tick/label/tooltip values with `formatMetric`.
- **Comparison export (stub).** The affordance to export the comparison set
  (selected runs' configs, timestamps, QRE versions, and the comparison table) is
  present and wired to a placeholder/preview — the **real** Markdown exporter is
  Part 3 (week 6). Build the seam, not the exporter.

**Charting library — ruled:** use **Recharts or Plotly** for the comparison bars
(Recharts recommended as the lighter React-native fit; either is approved). The PMs
have signed off on the dependency — **do not hand-roll the bars.** Keep the week-2
accessibility bar (text-equivalent table, never color-alone) and route all
tick/label/tooltip values through `formatMetric`. Team 2's week-2 scatter stays
hand-rolled and untouched; this covers the new comparison charts only.

**Data:** build against the committed **mock run records** — the set spans varied
architectures/benchmarks/QRE versions so the table and bars show real differences.
If you need a multi-run scenario the fixtures don't cover, request it from the PMs
(contract-change process); don't fabricate records locally.

## Boundaries — what is NOT yours this week

| Not yours | Whose |
|---|---|
| The real SQLite store + the `RunStore` write path | Team 2 (you consume the read/query/delete API; `reconstructConfig` is provided in `contracts/` — call it directly) |
| The frontier table/graph and result rendering | Team 2's already-merged Results components — you reuse them, you don't rebuild them |
| The real Markdown exporter | Part 3 (week 6) — you ship the stub affordance |
| Wiring Rerun into the live config form; the store swap; the save-after-run trigger | Week-4 integration |
| Choosing *whether* to use a charting library | PMs — **ruled: use Recharts or Plotly** for the comparison bars (approved; don't hand-roll them — see §The Comparison surface) |
| Wiring Comparison/History to the **live** SQLite store; the **real** comparison exporter | Week-4 integration (store) / Part 3, week 6 (export) — both tabs run on mock records with export stubs this week |
| The `RunRecord`/`RunStore` schema + the estimation contract | PMs, via contract-change process |
| Standing up the Electron main process / IPC | Team 3 |

## Quality bar

Strict TS, no `any` at boundaries; record/API types imported from `contracts/`,
never re-declared; the surface is a pure function of records + callbacks (no
store/engine imports — grep-provable); list, filters, and per-run actions
keyboard-navigable; no dead-end states (empty, no-matches, a saved failed run,
and a deleted-last-record state each have a clear next step); renders every
committed mock record — including a sparse/one-row and a failed record — without
crashing. **Comparison** holds the same bar: the comparison table + bars are
keyboard-navigable, a one-run and a many-run selection both render cleanly, every
chart has a text equivalent and never relies on color alone, and all values come
from `formatMetric` (`value` + `unit`, never `display`).
