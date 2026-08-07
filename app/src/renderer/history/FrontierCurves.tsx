import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatMetric } from "../results/formatMetric";
import {
  buildFrontierSeries,
  type ComparisonColumn,
  type FrontierSeriesPoint,
  type SeriesSymbol,
} from "./comparisonModel";

/**
 * Pareto curves — one series per compared run, plotting that run's FULL frontier
 * rather than the single representative row the bar charts use. This is the chart
 * that answers "where do these two architectures cross over," which a bar per run
 * cannot.
 *
 * Axes match the single-run `FrontierScatter` (runtime on x, physical qubits on
 * y) so the two surfaces read the same way; every tick and label routes through
 * `formatMetric`. Built with Recharts, the library this page already uses — the
 * week-2 hand-rolled SVG approach is deliberately NOT copied here.
 *
 * Accessibility: the comparison table above is the full text equivalent, and
 * series identity is carried by MARKER SHAPE as well as colour, so the chart
 * never depends on colour alone. Runs with no plottable frontier (failed, or an
 * empty one) are named beneath the chart rather than silently missing.
 */
export interface FrontierCurvesProps {
  columns: ComparisonColumn[];
}

interface CurvePoint extends FrontierSeriesPoint {
  seriesName: string;
  frontierCount: number;
}

/** Half-width of a marker, in px. The selected row's marker is drawn larger. */
const MARKER = 5;
const MARKER_SELECTED = 7.5;

export function FrontierCurves({ columns }: FrontierCurvesProps) {
  const { series, omitted, runtimeUnit, qubitsUnit, logRuntime, logQubits } =
    buildFrontierSeries(columns);

  // The chart's own text equivalent, so the figure announces its content even
  // before a reader reaches the table.
  const summary =
    series.length === 0
      ? "No frontier data to plot."
      : series
          .map(
            (entry) =>
              `${entry.name}: ${entry.points.length} point${entry.points.length === 1 ? "" : "s"}, ` +
              `${entry.points[0]?.runtimeDisplay} to ${entry.points[entry.points.length - 1]?.runtimeDisplay}`,
          )
          .join("; ");

  const formatRuntime = (value: number): string =>
    formatMetric({ value, unit: runtimeUnit, display: "" }, { notation: "compact" });
  const formatQubits = (value: number): string =>
    formatMetric({ value, unit: qubitsUnit, display: "" }, { notation: "compact" });

  return (
    <figure
      className="comparison-chart comparison-curves"
      aria-label={`Pareto frontier curves by run — ${summary}`}
    >
      <figcaption>Pareto frontier — physical qubits vs. runtime</figcaption>

      {series.length === 0 ? (
        <p className="muted comparison-curves__empty">
          No frontier data to plot. The selected runs reported no Pareto frontier.
        </p>
      ) : (
        <>
          <div className="comparison-curves__legend">
            {series.map((entry) => (
              <span
                key={entry.id}
                className="comparison-curves__legend-item"
                data-testid={`curve-legend-${entry.name}`}
              >
                <svg width="16" height="16" viewBox="-8 -8 16 16" aria-hidden="true" focusable="false">
                  <SeriesMarker symbol={entry.symbol} color={entry.color} size={MARKER} filled />
                </svg>
                <span className="comparison-curves__legend-name">{entry.name}</span>
                <span className="muted"> ({entry.symbol})</span>
              </span>
            ))}
          </div>

          <ResponsiveContainer width="100%" height={320}>
            <ScatterChart margin={{ top: 12, right: 18, bottom: 28, left: 12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-chart-grid)" />
              <XAxis
                type="number"
                dataKey="runtime"
                name="Runtime"
                stroke="var(--color-chart-axis)"
                tick={{ fontSize: 11 }}
                tickFormatter={formatRuntime}
                domain={["auto", "auto"]}
                {...(logRuntime ? ({ scale: "log" } as const) : {})}
                label={{ value: "Runtime", position: "insideBottom", offset: -16, fontSize: 11 }}
              />
              <YAxis
                type="number"
                dataKey="physicalQubits"
                name="Physical qubits"
                width={72}
                stroke="var(--color-chart-axis)"
                tick={{ fontSize: 11 }}
                tickFormatter={formatQubits}
                domain={["auto", "auto"]}
                {...(logQubits ? ({ scale: "log" } as const) : {})}
                label={{
                  value: "Physical qubits",
                  angle: -90,
                  position: "insideLeft",
                  fontSize: 11,
                }}
              />
              <Tooltip content={<CurveTooltip />} />
              {series.map((entry) => (
                <Scatter
                  key={entry.id}
                  name={entry.name}
                  data={entry.points.map<CurvePoint>((point) => ({
                    ...point,
                    seriesName: entry.name,
                    frontierCount: entry.points.length,
                  }))}
                  fill={entry.color}
                  // `joint` draws the frontier as a curve through its own points;
                  // the model sorted them by runtime so the line reads left to right.
                  line={{ stroke: entry.color, strokeWidth: 2 }}
                  lineType="joint"
                  isAnimationActive={false}
                  shape={(props: unknown) => (
                    <PlottedMarker
                      {...(props as { cx?: number; cy?: number; payload?: CurvePoint })}
                      symbol={entry.symbol}
                      color={entry.color}
                    />
                  )}
                />
              ))}
            </ScatterChart>
          </ResponsiveContainer>
        </>
      )}

      {omitted.length > 0 ? (
        <p className="comparison-curves__omitted">
          <strong>Not plotted:</strong>{" "}
          {omitted
            .map(
              (entry) =>
                `${entry.name} (${entry.reason === "failed" ? "run failed" : "no frontier reported"})`,
            )
            .join(", ")}
        </p>
      ) : null}
    </figure>
  );
}

/** One plotted point: the series marker, enlarged and ringed when it is the selected row. */
function PlottedMarker({
  cx,
  cy,
  payload,
  symbol,
  color,
}: {
  cx?: number;
  cy?: number;
  payload?: CurvePoint;
  symbol: SeriesSymbol;
  color: string;
}) {
  if (cx === undefined || cy === undefined) return null;
  const selected = payload?.selected ?? false;

  return (
    <g transform={`translate(${cx}, ${cy})`}>
      {selected ? (
        <circle
          r={MARKER_SELECTED + 3}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          opacity={0.65}
        />
      ) : null}
      <SeriesMarker
        symbol={symbol}
        color={color}
        size={selected ? MARKER_SELECTED : MARKER}
        filled
      />
    </g>
  );
}

/**
 * Marker shapes, drawn locally rather than pulled from a Recharts internal, so
 * the legend swatch and the plotted point are guaranteed to be the same glyph.
 * Centred on (0, 0); callers translate.
 */
function SeriesMarker({
  symbol,
  color,
  size,
  filled,
}: {
  symbol: SeriesSymbol;
  color: string;
  size: number;
  filled: boolean;
}) {
  const fill = filled ? color : "none";
  const common = { fill, stroke: color, strokeWidth: 1.5 };

  switch (symbol) {
    case "square":
      return <rect x={-size} y={-size} width={size * 2} height={size * 2} {...common} />;
    case "triangle":
      return <polygon points={`0,${-size * 1.15} ${size},${size * 0.8} ${-size},${size * 0.8}`} {...common} />;
    case "diamond":
      return <polygon points={`0,${-size * 1.25} ${size * 1.1},0 0,${size * 1.25} ${-size * 1.1},0`} {...common} />;
    case "star":
      return <polygon points={starPoints(size * 1.3, size * 0.55)} {...common} />;
    case "cross":
      return (
        <path
          d={`M${-size},${-size} L${size},${size} M${size},${-size} L${-size},${size}`}
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          strokeLinecap="round"
        />
      );
    case "circle":
    default:
      return <circle r={size} {...common} />;
  }
}

/** Five-pointed star path, outer/inner radius alternating. */
function starPoints(outer: number, inner: number): string {
  return Array.from({ length: 10 }, (_, i) => {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    return `${(radius * Math.cos(angle)).toFixed(2)},${(radius * Math.sin(angle)).toFixed(2)}`;
  }).join(" ");
}

interface CurveTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: CurvePoint }>;
}

function CurveTooltip({ active, payload }: CurveTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  return (
    <div className="comparison-tooltip">
      <strong>{point.seriesName}</strong>
      <span>Runtime: {point.runtimeDisplay}</span>
      <span>Physical qubits: {point.qubitsDisplay}</span>
      <span className="muted">
        Row {point.index + 1}
        {point.selected ? " · representing this run" : ""}
      </span>
    </div>
  );
}
