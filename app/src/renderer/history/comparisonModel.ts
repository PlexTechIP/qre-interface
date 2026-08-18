import {
  type FieldMetric,
  type FrontierRow,
  type MagicStateFactoryId,
  type RunRecord,
} from "../../shared/types";
import {
  DEFAULT_FIELD_DEFINITIONS,
  getAdditionalFieldDefinitions,
  getDefaultMetric,
  type ResultFieldDefinition,
} from "../results/resultFields";
import { formatMetric } from "../results/formatMetric";
import { resolveSelectedFrontierRow } from "../results/selectedRows";
import { parseTraceTransform } from "../../shared/traceTransform";
import {
  MAGIC_STATE_FACTORY_LABELS,
  T_COUNT_PER_ROTATION_LABEL,
  TOTAL_FAULT_TOLERANT_EXECUTION_ERROR_LABEL,
} from "../constants/labels";
import {
  CONFIG_DEFINITIONS,
  TRACE_TRANSFORM_DEFINITIONS,
} from "../constants/configDefinitions";
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
  maxError: number;
  /**
   * The T count this run was CONFIGURED with, or null when the record's
   * traceTransform does not parse (a v1.1.0 record, or one mixing contract
   * shapes). Null rather than the pipeline default: `normalizeTraceTransform`
   * repairs an unreadable transform to `DEFAULT_TRACE_TRANSFORM` for display,
   * and printing that 20 in a comparison cell would assert a configured value
   * the record does not actually carry — against runs whose 20 is real.
   */
  tCountPerRotation: number | null;
  /**
   * The magic-state factory (or factories) this run was CONFIGURED with, joined
   * for display. Sourced from config, not the result: the engine's per-point
   * `magicStateFactory` is only filled in when a factory transform is
   * identifiable for that frontier point, so a single-factory run legitimately
   * reports it as absent — showing "—" for a factory the run plainly used. The
   * configured set is always known.
   */
  magicStateFactories: string;
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
    maxError: config.maxError,
    tCountPerRotation: configuredTCountPerRotation(config.traceTransform),
    magicStateFactories: configuredFactories(config.magicStateFactories),
    failed: result.status === "failed",
    selectedIndex: selected.index,
    frontierCount: selected.count,
    row: selected.row,
    frontier: result.frontier ?? [],
  };
}

/**
 * The T count a record was configured with, or null when its traceTransform is
 * not readable. Uses the STRICT parse, not `normalizeTraceTransform`: the
 * lenient read repairs an unparseable transform to the pipeline defaults, which
 * is right for "render something coherent" and wrong for "state what this run
 * was configured with".
 */
function configuredTCountPerRotation(transform: unknown): number | null {
  const parsed = parseTraceTransform(transform);
  return parsed.ok ? parsed.transform.tStatesPerRotation : null;
}

/** The configured factory set, labelled and joined; a dash when somehow empty. */
function configuredFactories(factories: readonly MagicStateFactoryId[]): string {
  const labels = factories.map((factory) => MAGIC_STATE_FACTORY_LABELS[factory]);
  return labels.length > 0 ? labels.join(" + ") : "—";
}

/**
 * Whether the configuration row for T count can speak for every column.
 *
 * This is the single predicate deciding both whether that row is emitted and
 * whether qdk's own `numTsPerRotation` row is suppressed as a duplicate — the
 * two decisions have to agree or the table shows the field twice or not at all.
 * `additionalFieldDefinitions` is what the field filter enumerates, so keeping
 * the dedup THERE rather than in `buildComparisonRows` is also what stops the
 * filter offering a checkbox that toggles a row nobody renders.
 */
function tCountIsConfiguredForEveryColumn(
  columns: readonly ComparisonColumn[],
): boolean {
  return columns.length > 0 && columns.every((c) => c.tCountPerRotation !== null);
}

/**
 * The union of additional (non-default) result fields reported across the
 * selected runs, minus any the configuration rows already cover.
 *
 * Gathered from every run's FULL frontier, not just its representative row: runs
 * return different subsets of the reported fields, and the filter has to list
 * every field ANY selected run returned so none is silently unreachable. A field
 * a given run did not return simply reads "—" in that run's column.
 *
 * `numTsPerRotation` is dropped ONLY when the configuration row can state the
 * value for every column. Where a record's transform does not parse, the
 * engine-reported metric is the only honest source for that field, so it stays
 * — otherwise a legacy record would show neither number.
 */
export function additionalFieldDefinitions(columns: readonly ComparisonColumn[]): ResultFieldDefinition[] {
  const rows = columns.flatMap((c) => c.frontier);
  // The configured Magic State Factory row (below) always states the factory, so
  // the engine's sparse per-point `magicStateFactory` result field is dropped as
  // a duplicate — it would otherwise show "—" for a run that reported no factory
  // node on its representative point despite plainly using one.
  const definitions = getAdditionalFieldDefinitions(rows).filter(
    (def) => def.key !== "magicStateFactory",
  );
  if (!tCountIsConfiguredForEveryColumn(columns)) return definitions;
  return definitions.filter((def) => def.key !== "numTsPerRotation");
}

/** One table row: a result field, with the aligned metric for each column (null = not reported). */
export interface ComparisonRow {
  key: string;
  label: string;
  unitLabel: string;
  /** On-demand field definition, mirroring the configuration/results tooltips. */
  description: string;
  metrics: (FieldMetric | null)[];
  /** Configuration values still exist when estimation failed. */
  availableOnFailedRun: boolean;
}

/**
 * Build the comparison table's rows: the two cross-run configuration values,
 * the six default result fields, then any additional result fields not hidden
 * by the field filter. Metrics align 1:1 with `columns`.
 */
export function buildComparisonRows(
  columns: readonly ComparisonColumn[],
  hiddenKeys: ReadonlySet<string>,
): ComparisonRow[] {
  const configuration: ComparisonRow[] = [
    {
      key: "config.maxError",
      label: TOTAL_FAULT_TOLERANT_EXECUTION_ERROR_LABEL,
      unitLabel: "probability",
      description: CONFIG_DEFINITIONS.maxError,
      metrics: columns.map((column) => ({
        value: column.maxError,
        unit: "probability",
        display: String(column.maxError),
      })),
      availableOnFailedRun: true,
    },
  ];

  // Emitted only when every column can state a configured value — otherwise
  // `additionalFieldDefinitions` keeps qdk's reported metric and that row does
  // the job instead. The two are never both present, and never both absent.
  if (tCountIsConfiguredForEveryColumn(columns)) {
    configuration.push({
      key: "config.tStatesPerRotation",
      label: T_COUNT_PER_ROTATION_LABEL,
      unitLabel: "T states",
      description: TRACE_TRANSFORM_DEFINITIONS.tStatesPerRotation,
      metrics: columns.map((column) => ({
        value: column.tCountPerRotation,
        unit: "T states",
        display: String(column.tCountPerRotation),
      })),
      availableOnFailedRun: true,
    });
  }

  // Sourced from config so it is always populated, even when the engine's
  // per-point `magicStateFactory` result field is absent (see the dedup in
  // `additionalFieldDefinitions`) or the run failed outright.
  configuration.push({
    key: "config.magicStateFactories",
    label: "Magic State Factory",
    unitLabel: "",
    description:
      "The magic-state factory (or factories) this run was configured to use for its non-Clifford operations.",
    metrics: columns.map((column) => ({
      value: column.magicStateFactories,
      unit: "",
      display: column.magicStateFactories,
    })),
    availableOnFailedRun: true,
  });

  const defaults: ComparisonRow[] = DEFAULT_FIELD_DEFINITIONS.map((def) => ({
    key: def.key,
    label: def.label,
    unitLabel: def.unitLabel,
    description: def.description,
    metrics: columns.map((col) => (col.row ? getDefaultMetric(col.row, def.key) : null)),
    availableOnFailedRun: false,
  }));

  const additional: ComparisonRow[] = additionalFieldDefinitions(columns).map((def) => ({
    key: def.key,
    label: def.label,
    unitLabel: def.unitLabel,
    description: def.description,
    metrics: columns.map((col) => col.row?.additional?.[def.key] ?? null),
    availableOnFailedRun: false,
  }));

  // Every row is filterable — configuration values, the defaults, and the
  // additional fields alike — so the field filter can hide ANY of them, not just
  // the extras.
  return [...configuration, ...defaults, ...additional].filter(
    (row) => !hiddenKeys.has(row.key),
  );
}

/**
 * Every field the comparison table can show, in table order — the two/three
 * configuration rows, the six result defaults, then the additional reported
 * fields. This is what the field filter enumerates: the analyst can toggle any
 * of them, so the list is not limited to the "extra" fields. Derived from
 * `buildComparisonRows` with nothing hidden, so the filter and the table can
 * never disagree about which rows exist.
 */
export function comparisonFieldDefinitions(
  columns: readonly ComparisonColumn[],
): ResultFieldDefinition[] {
  return buildComparisonRows(columns, new Set()).map((row) => ({
    key: row.key,
    label: row.label,
    unitLabel: row.unitLabel,
    description: row.description,
  }));
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

/**
 * Build one per-metric bar chart for every NUMERIC field the comparison table is
 * currently showing — the charts are chained to the table through the same
 * `hiddenKeys`, so filtering a field in or out adds or removes its chart too.
 * Each metric is its OWN chart, so a single axis never spans qubits (~1e6) and
 * error (~1e-15) at once. Rows whose value is not a finite number (Factories,
 * Source, Feasibility, …) cannot be a bar and are skipped. Values are formatted
 * via `formatMetric`.
 */
export function buildCharts(
  columns: readonly ComparisonColumn[],
  hiddenKeys: ReadonlySet<string>,
): ChartSpec[] {
  const charts: ChartSpec[] = [];
  for (const row of buildComparisonRows(columns, hiddenKeys)) {
    let unit = "";
    let hasNumeric = false;
    const bars: ComparisonBar[] = columns.map((col, index) => {
      const metric = row.metrics[index] ?? null;
      const value = numericValue(metric ?? undefined);
      if (value !== null) {
        hasNumeric = true;
        if (unit === "" && metric) unit = metric.unit;
      }
      return {
        id: col.id,
        name: col.name,
        shortName: col.shortName,
        value,
        display: formatMetric(metric),
      };
    });
    if (hasNumeric) charts.push({ key: row.key, label: row.label, unit, bars });
  }
  return charts;
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
