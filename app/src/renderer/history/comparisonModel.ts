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
  /** The run's FULL frontier — the curve chart plots all of it, not just `row`. */
  frontier: readonly FrontierRow[];
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
    frontier: result.frontier ?? [],
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

/* ---- Pareto curves (one series per compared run) -------------------------- */

/**
 * A run is not one point, it is a frontier. The bar charts above compare single
 * scalars; these series carry EVERY frontier point of every selected run so an
 * analyst can see where two architectures cross over rather than only which is
 * bigger at one row.
 *
 * Axes deliberately match the single-run `FrontierScatter`: runtime on x,
 * physical qubits on y.
 */
export interface FrontierSeriesPoint {
  /** Index into the run's ORIGINAL frontier, so a plotted point stays addressable. */
  index: number;
  runtime: number;
  physicalQubits: number;
  runtimeDisplay: string;
  qubitsDisplay: string;
  /** True for the row currently representing this run in the table. */
  selected: boolean;
}

/** A Recharts symbol name — shape carries series identity when colour cannot. */
export type SeriesSymbol = "circle" | "square" | "triangle" | "diamond" | "star" | "cross";

export interface FrontierSeries {
  id: string;
  name: string;
  shortName: string;
  color: string;
  symbol: SeriesSymbol;
  points: FrontierSeriesPoint[];
}

/** A selected run that has no plottable frontier — named on the chart, never dropped. */
export interface OmittedSeries {
  id: string;
  name: string;
  reason: "failed" | "no-frontier";
}

export interface FrontierComparison {
  series: FrontierSeries[];
  omitted: OmittedSeries[];
  runtimeUnit: string;
  qubitsUnit: string;
  logRuntime: boolean;
  logQubits: boolean;
}

/**
 * Series identity is carried by colour AND shape, so the chart never relies on
 * colour alone (a11y bar carried over from week 2).
 *
 * Nothing caps the comparison selection, so the palettes must survive wrapping.
 * They are cycled INDEPENDENTLY and the shape index is advanced by one extra
 * step per completed colour cycle — so run 7 reuses colour 1 but not shape 1,
 * and a (colour, shape) pair does not repeat until run 37.
 */
const SERIES_COLORS: readonly string[] = [
  "var(--color-series-1)",
  "var(--color-series-2)",
  "var(--color-series-3)",
  "var(--color-series-4)",
  "var(--color-series-5)",
  "var(--color-series-6)",
];

const SERIES_SYMBOLS: readonly SeriesSymbol[] = [
  "circle",
  "square",
  "triangle",
  "diamond",
  "star",
  "cross",
];

export function seriesStyle(index: number): { color: string; symbol: SeriesSymbol } {
  const lap = Math.floor(index / SERIES_COLORS.length);
  return {
    color: SERIES_COLORS[index % SERIES_COLORS.length]!,
    symbol: SERIES_SYMBOLS[(index + lap) % SERIES_SYMBOLS.length]!,
  };
}

/** Log scaling earns its keep only across wide, strictly positive ranges. */
const LOG_SCALE_RATIO = 100;

function shouldUseLogScale(values: readonly number[]): boolean {
  // Log cannot plot zero or negatives, so a single non-positive value rules it out.
  if (values.length < 2 || values.some((value) => !(value > 0))) return false;
  return Math.max(...values) / Math.min(...values) >= LOG_SCALE_RATIO;
}

function numericValue(metric: FieldMetric | undefined): number | null {
  return metric && typeof metric.value === "number" && Number.isFinite(metric.value)
    ? metric.value
    : null;
}

/**
 * Turn the selected columns into one curve per run. Runs with no plottable
 * frontier (failed, or an empty/unusable one) are reported in `omitted` so the
 * surface can say they are absent rather than silently showing fewer curves.
 */
export function buildFrontierSeries(columns: readonly ComparisonColumn[]): FrontierComparison {
  const series: FrontierSeries[] = [];
  const omitted: OmittedSeries[] = [];
  let runtimeUnit = "";
  let qubitsUnit = "";

  for (const col of columns) {
    const points: FrontierSeriesPoint[] = [];

    col.frontier.forEach((row, index) => {
      const runtime = numericValue(row.runtime);
      const physicalQubits = numericValue(row.physicalQubits);
      if (runtime === null || physicalQubits === null) return;
      if (runtimeUnit === "") runtimeUnit = row.runtime.unit;
      if (qubitsUnit === "") qubitsUnit = row.physicalQubits.unit;
      points.push({
        index,
        runtime,
        physicalQubits,
        runtimeDisplay: formatMetric(row.runtime),
        qubitsDisplay: formatMetric(row.physicalQubits),
        selected: index === col.selectedIndex,
      });
    });

    if (points.length === 0) {
      omitted.push({ id: col.id, name: col.name, reason: col.failed ? "failed" : "no-frontier" });
      continue;
    }

    // Sorted by runtime so the connecting line reads left-to-right rather than
    // zig-zagging in whatever order the engine happened to emit rows.
    points.sort((a, b) => a.runtime - b.runtime);

    const style = seriesStyle(series.length);
    series.push({
      id: col.id,
      name: col.name,
      shortName: col.shortName,
      color: style.color,
      symbol: style.symbol,
      points,
    });
  }

  const allRuntimes = series.flatMap((s) => s.points.map((p) => p.runtime));
  const allQubits = series.flatMap((s) => s.points.map((p) => p.physicalQubits));

  return {
    series,
    omitted,
    runtimeUnit: runtimeUnit || "ns",
    qubitsUnit: qubitsUnit || "qubits",
    logRuntime: shouldUseLogScale(allRuntimes),
    logQubits: shouldUseLogScale(allQubits),
  };
}

/* ---- Compare-selection threshold ----------------------------------------- */

/**
 * Comparing one run against nothing is not a comparison, so "Compare Selected"
 * needs two. Below that the user stays on History and is TOLD what is missing —
 * a disabled button with no explanation is the same bug in a different costume.
 */
export const COMPARE_MIN_SELECTION = 2;

/**
 * The in-place warning for a below-threshold selection; null once it is met.
 *
 * `comparableCount` is the number of selected runs actually present in the
 * list — NOT the number of checkboxes ticked. `hiddenCount` is how many checked
 * runs the active filter is currently hiding; those stay selected but cannot be
 * compared while off-screen, and saying so is the difference between a warning
 * that helps and one that looks wrong ("I ticked two of them").
 */
export function compareSelectionWarning(
  comparableCount: number,
  hiddenCount = 0,
): string | null {
  if (comparableCount >= COMPARE_MIN_SELECTION) return null;

  const needed = COMPARE_MIN_SELECTION - comparableCount;
  const have =
    comparableCount === 0
      ? "None are selected yet"
      : `${comparableCount} run${comparableCount === 1 ? " is" : "s are"} selected`;
  const hiddenNote =
    hiddenCount > 0
      ? ` ${hiddenCount} checked run${hiddenCount === 1 ? " is" : "s are"} hidden by the current filter — clear the filter to include ${hiddenCount === 1 ? "it" : "them"}.`
      : "";

  return `Select at least ${COMPARE_MIN_SELECTION} runs to compare. ${have} — tick ${needed} more in the list below.${hiddenNote}`;
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
