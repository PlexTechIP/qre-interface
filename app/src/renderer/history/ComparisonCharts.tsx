import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatMetric } from "../results/formatMetric";
import { buildCharts, type ChartSpec, type ComparisonColumn } from "./comparisonModel";

/**
 * The comparison bar charts — one chart per NUMERIC field the table is showing,
 * one bar per selected run. The set is chained to the table through the same
 * `hiddenKeys`, so filtering a field in or out of the table adds or removes its
 * chart here too. Built with the approved charting library (Recharts), not
 * hand-rolled. Every tick/label/tooltip value routes through `formatMetric`.
 *
 * Accessibility: each chart pairs a formatted value label on every bar (so the
 * data reads without color), a summarizing aria-label, and the comparison table
 * as its full text equivalent. A single-run selection renders one bar cleanly;
 * separating each metric into its own chart keeps any single axis from spanning
 * wildly different magnitudes.
 */
export interface ComparisonChartsProps {
  columns: ComparisonColumn[];
  /** Shared with the table: which additional fields are hidden. */
  hiddenKeys: ReadonlySet<string>;
}

interface BarDatum {
  name: string;
  fullName: string;
  value: number | null;
  display: string;
}

export function ComparisonCharts({ columns, hiddenKeys }: ComparisonChartsProps) {
  const charts = buildCharts(columns, hiddenKeys);

  if (charts.length === 0) {
    return (
      <p className="muted comparison-charts__empty">
        No numeric metrics to plot for the current selection.
      </p>
    );
  }

  return (
    <div className="comparison-charts">
      {charts.map((spec) => (
        <ComparisonBarChart key={spec.key} spec={spec} />
      ))}
    </div>
  );
}

function ComparisonBarChart({ spec }: { spec: ChartSpec }) {
  const data: BarDatum[] = spec.bars.map((bar) => ({
    name: bar.shortName,
    fullName: bar.name,
    value: bar.value,
    display: bar.display,
  }));

  const tickFormatter = (value: number): string =>
    formatMetric({ value, unit: spec.unit, display: "" }, { notation: "compact" });

  const summary = spec.bars.map((bar) => `${bar.name}: ${bar.display}`).join("; ");

  return (
    <figure className="comparison-chart" aria-label={`${spec.label} by run — ${summary}`}>
      <figcaption>{spec.label}</figcaption>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 20, right: 12, bottom: 4, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-chart-grid)" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="var(--color-chart-axis)" interval={0} />
          <YAxis
            width={64}
            tick={{ fontSize: 11 }}
            stroke="var(--color-chart-axis)"
            tickFormatter={tickFormatter}
          />
          <Tooltip cursor={{ fill: "var(--color-row-hover)" }} content={<ChartTooltip />} />
          <Bar dataKey="value" fill="var(--color-accent)" maxBarSize={72} radius={[3, 3, 0, 0]}>
            <LabelList dataKey="display" position="top" style={{ fontSize: 11, fill: "var(--color-body)" }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </figure>
  );
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: BarDatum }>;
}

function ChartTooltip({ active, payload }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  return (
    <div className="comparison-tooltip">
      <strong>{point.fullName}</strong>
      <span>{point.display}</span>
    </div>
  );
}
