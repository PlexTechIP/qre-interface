import { applicationKey, type FieldMetric, type FrontierRow, type RunRecord } from "../../shared/types";
import {
  DEFAULT_FIELD_DEFINITIONS,
  getAdditionalFieldDefinitions,
  getDefaultMetric,
  type ResultFieldDefinition,
} from "../results/resultFields";
import { formatMetric } from "../results/formatMetric";
import { ARCHITECTURE_LABELS, applicationLabel } from "./historyLabels";

/**
 * Pure derivation layer for the Comparison surface. It turns a selected set of
 * immutable `RunRecord`s into the column/row/bar shapes the table and charts
 * render — and it does so WITHOUT touching the store or the engine (grep-provable
 * purity holds here too). Every value the surface shows is derived from
 * `config`/`result`; nothing is duplicated onto the record.
 *
 * Each run is represented by its FIRST frontier row — the same representative-row
 * convention the History list uses (RunRecord does not persist a selected row).
 * A failed run has no frontier, so its row is null and its cells/bars read as
 * "no data" rather than crashing.
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
  /** The representative (first) frontier row; null on a failed run. */
  row: FrontierRow | null;
}

export function toComparisonColumn(record: RunRecord): ComparisonColumn {
  const { config, result } = record;
  return {
    id: record.id,
    name: config.name,
    shortName: shortName(config.name),
    application: applicationLabel(config),
    architecture: ARCHITECTURE_LABELS[config.architecture.type] ?? config.architecture.type,
    // Authoritative engine version is result.qreVersion, NOT config.qreVersion.
    qreVersion: result.qreVersion,
    failed: result.status === "failed",
    row: result.frontier?.[0] ?? null,
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
