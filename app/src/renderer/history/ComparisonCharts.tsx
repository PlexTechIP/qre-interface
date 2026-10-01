import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
  /** The run's number in the legend, shown under its bar. */
  position: string;
  name: string;
  fullName: string;
  value: number | null;
  display: string;
  color: string;
}

/** Axis text: the muted text token. The axis-line colour is too faint to read. */
const AXIS_TICK = { fontSize: 11, fill: "var(--color-muted)" };

export function ComparisonCharts({ columns, hiddenKeys }: ComparisonChartsProps) {
  const charts = buildCharts(columns, hiddenKeys);

  if (charts.length === 0) {
    return (
      <p className="muted comparison-charts__empty">
        No numeric metrics to plot for the current selection.
      </p>
    );
  }

  // Each run is named once, here, in its series colour. Named under every bar
  // instead, the names of three runs in a 280px chart ran into each other.
  const runs = charts[0]?.bars ?? [];

  return (
    <>
      <ul className="comparison-charts__legend" aria-label="Runs in these charts">
        {runs.map((run, index) => (
          <li key={run.id} className="comparison-charts__legend-item">
            <span
              className="comparison-charts__swatch"
              style={{ background: run.color }}
              aria-hidden="true"
            >
              {index + 1}
            </span>
            {run.name}
          </li>
        ))}
      </ul>
      <div className="comparison-charts">
        {charts.map((spec) => (
          <ComparisonBarChart key={spec.key} spec={spec} />
        ))}
      </div>
    </>
  );
}

function ComparisonBarChart({ spec }: { spec: ChartSpec }) {
  const data: BarDatum[] = spec.bars.map((bar, index) => ({
    position: String(index + 1),
    name: bar.shortName,
    fullName: bar.name,
    value: bar.value,
    display: bar.display,
    color: bar.color,
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
          {/* Numbers, not names: the legend above names each run once. */}
          <XAxis
            dataKey="position"
            tick={AXIS_TICK}
            interval={0}
            stroke="var(--color-chart-axis)"
          />
          <YAxis
            width={64}
            tick={AXIS_TICK}
            stroke="var(--color-chart-axis)"
            tickFormatter={tickFormatter}
          />
          {/* Free to leave the plot area: a long run name is wider than one chart,
              and kept inside it the tooltip was cut off at the chart's edge. */}
          <Tooltip
            cursor={{ fill: "var(--color-row-hover)" }}
            content={<ChartTooltip />}
            allowEscapeViewBox={{ x: true, y: true }}
            wrapperStyle={{ zIndex: 30 }}
          />
          <Bar dataKey="value" maxBarSize={72} radius={[3, 3, 0, 0]}>
            {data.map((datum) => (
              <Cell key={datum.fullName} fill={datum.color} />
            ))}
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
