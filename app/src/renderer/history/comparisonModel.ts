import { applicationKey, type FieldMetric, type FrontierRow, type RunRecord } from "../../shared/types";
import {
  DEFAULT_FIELD_DEFINITIONS,
  getAdditionalFieldDefinitions,
  getDefaultMetric,
  type ResultFieldDefinition,
} from "../results/resultFields";
import { formatMetric } from "../results/formatMetric";
import { resolveSelectedFrontierRow } from "../results/selectedRows";
import { ARCHITECTURE_LABELS, applicationLabel } from "./historyLabels";

/**
 * Pure derivation layer for the Comparison surface. It turns a selected set of
 * immutable `RunRecord`s into the column/row/bar shapes the table and charts
 * render — and it does so WITHOUT touching the store or the engine (grep-provable
 * purity holds here too). Every value the surface shows is derived from
 * `config`/`result`; nothing is duplicated onto the record.
 *
 * Each run is represented by the frontier row selected for it in app session
 * state, defaulting to the first row. A failed run has no frontier, so its row
 * is null and its cells/bars read as "no data" rather than crashing.
 *
 * Two derivations live here, and they answer different questions. The
 * table/bars reduce each run to its ONE representative row ("which run is
 * bigger"); `buildParetoModel` keeps every frontier row so each run plots as its
 * own curve ("where do these two architectures cross over").
 */

/** Truncated run name for a chart's category axis; the tooltip/table carry the full name. */
export function shortName(name: string): string {
  return name.length > 18 ? `${name.slice(0, 17)}…` : name;
}

/** One selected run, resolved to the identity + representative row the surface needs. */
export interface ComparisonColumn {
  id: string;
  name: string;
  shortName: string;
  application: string;
  architecture: string;
  qreVersion: string;
  failed: boolean;
  /** Zero-based representative row index after safe fallback. */
  selectedIndex: number;
  /** Total frontier rows reported by this run. */
  frontierCount: number;
  /** The representative frontier row; null on a failed or empty-frontier run. */
  row: FrontierRow | null;
}

export function toComparisonColumn(
  record: RunRecord,
  selectedIndex = 0,
): ComparisonColumn {
  const { config, result } = record;
  const selected = resolveSelectedFrontierRow(result, selectedIndex);
  return {
    id: record.id,
    name: config.name,
    shortName: shortName(config.name),
    application: applicationLabel(config),
    architecture: ARCHITECTURE_LABELS[config.architecture.type] ?? config.architecture.type,
    // Authoritative engine version is result.qreVersion, NOT config.qreVersion.
    qreVersion: result.qreVersion,
    failed: result.status === "failed",
    selectedIndex: selected.index,
    frontierCount: selected.count,
    row: selected.row,
  };
}

/** The union of additional (non-default) result fields reported across the selected runs. */
export function additionalFieldDefinitions(columns: readonly ComparisonColumn[]): ResultFieldDefinition[] {
  const rows = columns.map((c) => c.row).filter((r): r is FrontierRow => r != null);
  return getAdditionalFieldDefinitions(rows);
}

/** One table row: a result field, with the aligned metric for each column (null = not reported). */
export interface ComparisonRow {
  key: string;
  label: string;
  unitLabel: string;
  metrics: (FieldMetric | null)[];
}

/**
 * Build the comparison table's rows: the six defaults always, then any additional
 * fields not hidden by the field filter. Metrics align 1:1 with `columns`.
 */
export function buildComparisonRows(
  columns: readonly ComparisonColumn[],
  hiddenKeys: ReadonlySet<string>,
): ComparisonRow[] {
  const defaults: ComparisonRow[] = DEFAULT_FIELD_DEFINITIONS.map((def) => ({
    key: def.key,
    label: def.label,
    unitLabel: def.unitLabel,
    metrics: columns.map((col) => (col.row ? getDefaultMetric(col.row, def.key) : null)),
  }));

  const additional: ComparisonRow[] = additionalFieldDefinitions(columns)
    .filter((def) => !hiddenKeys.has(def.key))
    .map((def) => ({
      key: def.key,
      label: def.label,
      unitLabel: def.unitLabel,
      metrics: columns.map((col) => col.row?.additional?.[def.key] ?? null),
    }));

  return [...defaults, ...additional];
}

/** One metric's bar across all selected runs. */
export interface ComparisonBar {
  id: string;
  name: string;
  shortName: string;
  /** Numeric value, or null when the run did not report this metric (failed/missing). */
  value: number | null;
  /** Pre-formatted label via formatMetric — the text equivalent for the bar. */
  display: string;
}

export interface ChartSpec {
  key: string;
  label: string;
  /** The metric's unit, captured from the first reporting run — routes formatMetric (ns/probability/…). */
  unit: string;
  bars: ComparisonBar[];
}

/** The SOW comparison-chart set, in order. physicalFactoryQubits is an additional field. */
const CHART_METRICS: ReadonlyArray<{ key: string; label: string; get: (row: FrontierRow) => FieldMetric | undefined }> = [
  { key: "physicalQubits", label: "Physical Qubits", get: (r) => r.physicalQubits },
  { key: "runtime", label: "Runtime", get: (r) => r.runtime },
  { key: "logicalCycleTime", label: "Logical Cycle Time", get: (r) => r.logicalCycleTime },
  { key: "physicalFactoryQubits", label: "Physical Factory Qubits", get: (r) => r.additional?.physicalFactoryQubits },
  { key: "totalError", label: "Total Error", get: (r) => r.totalError },
  { key: "codeDistance", label: "Code Distance", get: (r) => r.codeDistance },
];

/**
 * Build the six per-metric bar specs. Each metric is its OWN chart, so a single
 * axis never spans qubits (~1e6) and error (~1e-15) at once — that is how the
 * surface handles wide magnitude ranges. Values are formatted via `formatMetric`.
 */
export function buildCharts(columns: readonly ComparisonColumn[]): ChartSpec[] {
  return CHART_METRICS.map((chart) => {
    let unit = "";
    const bars: ComparisonBar[] = columns.map((col) => {
      const metric = col.row ? chart.get(col.row) : undefined;
      const numeric = metric && typeof metric.value === "number" && Number.isFinite(metric.value) ? metric.value : null;
      if (metric && unit === "") unit = metric.unit;
      return {
        id: col.id,
        name: col.name,
        shortName: col.shortName,
        value: numeric,
        display: formatMetric(metric ?? null),
      };
    });
    return { key: chart.key, label: chart.label, unit, bars };
  });
}

// ---------------------------------------------------------------------------
// Pareto frontier curves — the full frontier of every selected run, one curve
// each (physical qubits vs. runtime). Unlike the bars above, which reduce each
// run to its ONE representative row, these plot every row the engine reported,
// so two architectures' trade-off curves can be read against each other.
// ---------------------------------------------------------------------------

/** One plotted frontier point. `index` is the row's position in the saved record. */
export interface ParetoPoint {
  /** Zero-based frontier row index, as saved — the number the table calls "Row N". */
  index: number;
  /** The owning run's name. Carried per point because Recharts' scatter tooltip
   *  payload exposes the datum, not the series it belongs to. */
  runName: string;
  runtime: number;
  physicalQubits: number;
  /** Pre-formatted via formatMetric — the text equivalent for this point. */
  runtimeDisplay: string;
  qubitsDisplay: string;
  /** True for the row currently representing this run elsewhere on the surface. */
  selected: boolean;
}

/**
 * The distinguishing marker for a curve — deliberately NOT colour alone.
 *
 * There is one symbol per colour token (`--color-series-1..8`), so the two
 * channels wrap together: series 9 repeats series 1 in BOTH, rather than
 * colliding on one while the other still differs. A curve that shared a symbol
 * with another and differed only in colour would break this contract.
 */
export const SERIES_SYMBOLS = [
  "circle",
  "diamond",
  "triangle",
  "square",
  "cross",
  "star",
  "wye",
  "triangleDown",
] as const;
export type SeriesSymbol = (typeof SERIES_SYMBOLS)[number];

/** How many distinct (colour, symbol) pairs exist before the palette repeats. */
export const SERIES_PALETTE_SIZE = SERIES_SYMBOLS.length;

/** One selected run's frontier, ready to plot. */
export interface ParetoSeries {
  id: string;
  name: string;
  shortName: string;
  /** 1-based position in the selection; drives the colour/symbol assignment. */
  seriesNumber: number;
  symbol: SeriesSymbol;
  /** Points ordered along the frontier (runtime ascending), never empty. */
  points: ParetoPoint[];
  /** Total frontier rows the run reported (equals points.length unless rows were unplottable). */
  frontierCount: number;
}

/** Why a selected run has no curve. Reported in text, never silently dropped. */
export type ParetoOmissionReason = "failed" | "no-frontier" | "unplottable";

export interface ParetoOmission {
  id: string;
  name: string;
  reason: ParetoOmissionReason;
}

/** A numeric axis's scale + domain, chosen from the data rather than hardcoded. */
export interface ParetoAxis {
  scale: "linear" | "log";
  /** Explicit decade bounds on a log axis; "auto" lets Recharts fit a linear one. */
  domain: [number, number] | ["auto", "auto"];
  /** Explicit decade ticks on a log axis — Recharts' automatic ticks collapse to
   *  a single label across a range this wide. Undefined on a linear axis. */
  ticks?: number[];
}

export interface ParetoModel {
  series: ParetoSeries[];
  /** Selected runs that could not be plotted, with the reason. */
  omitted: ParetoOmission[];
  runtimeAxis: ParetoAxis;
  qubitsAxis: ParetoAxis;
}

const AUTO_AXIS: ParetoAxis = { scale: "linear", domain: ["auto", "auto"] };

/** A finite number, or null — the one place `NaN`/`undefined` is filtered out. */
function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Pick a scale for one axis. A log axis is only safe (and only useful) when
 * every value is positive and the spread is wide; a zero-valued row — the sparse
 * frontier — or a flat/single-point axis falls back to a linear auto domain.
 * On log, the domain snaps out to whole decades so the ticks land on powers of 10.
 */
export function paretoAxis(values: readonly number[]): ParetoAxis {
  const finiteValues = values.filter((v) => Number.isFinite(v));
  if (finiteValues.length < 2) return AUTO_AXIS;

  const min = Math.min(...finiteValues);
  const max = Math.max(...finiteValues);
  if (min <= 0 || min === max || max / min <= 20) return AUTO_AXIS;

  const lowExponent = Math.floor(Math.log10(min));
  const highExponent = Math.ceil(Math.log10(max));
  return {
    scale: "log",
    domain: [10 ** lowExponent, 10 ** highExponent],
    ticks: decadeTicks(lowExponent, highExponent),
  };
}

/** Powers of ten across the domain, thinned so the labels stay readable. */
function decadeTicks(lowExponent: number, highExponent: number, maxTicks = 7): number[] {
  const span = highExponent - lowExponent;
  const step = Math.max(1, Math.ceil(span / (maxTicks - 1)));
  const ticks: number[] = [];
  for (let exponent = lowExponent; exponent < highExponent; exponent += step) {
    ticks.push(10 ** exponent);
  }
  ticks.push(10 ** highExponent);
  return ticks;
}

/**
 * Build every curve from the selected records. Pure: it reads `result.frontier`
 * and the session's selected-row map, and touches neither store nor record.
 *
 * A failed run has no frontier, so it is omitted WITH its reason rather than
 * plotted as an empty or zeroed curve; a run whose rows carry non-numeric
 * qubits/runtime is omitted the same way. A one-row frontier yields a
 * one-point series, which still renders as a visible point.
 */
export function buildParetoModel(
  records: readonly RunRecord[],
  selectedRowByRunId: Readonly<Record<string, number>> = {},
): ParetoModel {
  const series: ParetoSeries[] = [];
  const omitted: ParetoOmission[] = [];

  for (const record of records) {
    const { config, result } = record;
    if (result.status === "failed") {
      omitted.push({ id: record.id, name: config.name, reason: "failed" });
      continue;
    }

    const frontier = result.frontier ?? [];
    if (frontier.length === 0) {
      omitted.push({ id: record.id, name: config.name, reason: "no-frontier" });
      continue;
    }

    const selectedIndex = resolveSelectedFrontierRow(result, selectedRowByRunId[record.id] ?? 0).index;
    const points: ParetoPoint[] = [];
    frontier.forEach((row, index) => {
      const runtime = finite(row.runtime?.value);
      const physicalQubits = finite(row.physicalQubits?.value);
      if (runtime === null || physicalQubits === null) return;
      points.push({
        index,
        runName: config.name,
        runtime,
        physicalQubits,
        runtimeDisplay: formatMetric(row.runtime),
        qubitsDisplay: formatMetric(row.physicalQubits),
        selected: index === selectedIndex,
      });
    });

    if (points.length === 0) {
      omitted.push({ id: record.id, name: config.name, reason: "unplottable" });
      continue;
    }

    // Order along the frontier, not by row order: the engine reports rows in
    // whatever order it explored them, and a curve drawn in that order zig-zags.
    points.sort((a, b) => a.runtime - b.runtime || a.physicalQubits - b.physicalQubits);

    const seriesNumber = series.length + 1;
    series.push({
      id: record.id,
      name: config.name,
      shortName: shortName(config.name),
      seriesNumber,
      symbol: SERIES_SYMBOLS[(seriesNumber - 1) % SERIES_PALETTE_SIZE] as SeriesSymbol,
      points,
      frontierCount: frontier.length,
    });
  }

  const allPoints = series.flatMap((s) => s.points);
  return {
    series,
    omitted,
    runtimeAxis: paretoAxis(allPoints.map((p) => p.runtime)),
    qubitsAxis: paretoAxis(allPoints.map((p) => p.physicalQubits)),
  };
}

// ---------------------------------------------------------------------------
// Comparison selection threshold
// ---------------------------------------------------------------------------

/**
 * A comparison needs two runs to be a comparison. Below this, "Compare Selected"
 * tells the user what's missing instead of navigating — and the Comparison
 * surface itself says so too, for anyone who arrives by the sidebar.
 */
export const MIN_COMPARISON_RUNS = 2;

/**
 * The message shown when fewer than MIN_COMPARISON_RUNS can be compared.
 *
 * `comparableCount` is the number of selected runs actually present in the
 * list — NOT the number of checkboxes ticked. `hiddenCount` is how many checked
 * runs the active filter is currently hiding; those stay selected but cannot be
 * compared while off-screen, and saying so is the difference between a warning
 * that helps and one that looks wrong ("I checked two of them").
 */
export function belowThresholdMessage(comparableCount: number, hiddenCount = 0): string {
  const hiddenNote =
    hiddenCount > 0
      ? ` ${hiddenCount} checked run${hiddenCount === 1 ? " is" : "s are"} hidden by the current filter — clear the filter to include ${hiddenCount === 1 ? "it" : "them"}.`
      : "";

  if (comparableCount === 0) {
    return `Select at least ${MIN_COMPARISON_RUNS} runs to compare. Check the runs you want in the list below, then choose Compare Selected.${hiddenNote}`;
  }

  const needed = MIN_COMPARISON_RUNS - comparableCount;
  return `Only 1 run is selected — a comparison needs at least ${MIN_COMPARISON_RUNS}. Check ${needed} more run in the list below, then choose Compare Selected.${hiddenNote}`;
}

/**
 * Placeholder Markdown preview for the comparison-set export — NOT the Part-3
 * exporter. Lists each selected run's identity so the seam is demonstrable.
 */
export function buildComparisonExportStub(records: readonly RunRecord[]): string {
  return [
    `# Run Comparison (${records.length} run${records.length === 1 ? "" : "s"})`,
    "",
    "> Export preview — placeholder. The Markdown comparison exporter ships in Part 3 (week 6).",
    "",
    "## Selected runs",
    ...records.map(
      (r) =>
        `- ${r.config.name} · ${applicationKey(r.config)} · ${r.config.architecture.type} · ${r.result.qreVersion} · saved ${r.savedAt}`,
    ),
    "",
    "The real export includes the full comparison table (one column per run) and the per-metric bars.",
  ].join("\n");
}
