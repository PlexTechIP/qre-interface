import { useMemo, useState } from "react";
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { RunRecord } from "../../shared/types";
import { formatMetric } from "../results/formatMetric";
import type { SelectedRowByRunId } from "../results/selectedRows";
import {
  buildParetoModel,
  SERIES_PALETTE_SIZE,
  type ParetoOmission,
  type ParetoPoint,
  type ParetoSeries,
  type SeriesSymbol,
} from "./comparisonModel";

/**
 * Pareto frontier curves for the Comparison surface — one curve per selected
 * run, plotting that run's FULL frontier (physical qubits vs. runtime) rather
 * than the single representative row the table and bars show. This is the view
 * that answers "where do these two architectures cross over".
 *
 * Built with the approved charting library (Recharts) as a `ScatterChart` with
 * one joint-line `Scatter` per run.
 *
 * Accessibility: a run is identified by THREE independent channels — a distinct
 * point symbol, a colour, and a named legend entry — so the plot never relies on
 * colour alone. The "Curve data as a table" disclosure below it — the same
 * `aria-expanded` toggle idiom the field filter uses — is the full text
 * equivalent, and every number in it routes through `formatMetric`.
 *
 * Awkward cases, all handled without NaN/undefined or a broken layout: a failed
 * run has no frontier and is named in the "not plotted" note instead of drawn;
 * a one-row frontier draws as a single visible point; wide magnitude ranges
 * switch the axis to a log scale (see `paretoAxis`); a row with a non-numeric
 * qubit/runtime value is dropped from its curve rather than plotted as zero.
 */
export interface ParetoCurvesProps {
  records: RunRecord[];
  selectedRowByRunId?: SelectedRowByRunId;
}

const CHART_HEIGHT = 340;
const POINT_RADIUS = 5;
const SELECTED_RING_RADIUS = 9;

/**
 * Series colour token. Wraps on the SAME period as the symbols, so the two
 * cues never come apart — a run is identified by the pair, not by either alone.
 * `--color-series-1..SERIES_PALETTE_SIZE` are defined in both themes.
 */
function seriesColor(seriesNumber: number): string {
  return `var(--color-series-${((seriesNumber - 1) % SERIES_PALETTE_SIZE) + 1})`;
}

export function ParetoCurves({ records, selectedRowByRunId = {} }: ParetoCurvesProps) {
  const [isDataOpen, setIsDataOpen] = useState(false);
  const model = useMemo(
    () => buildParetoModel(records, selectedRowByRunId),
    [records, selectedRowByRunId],
  );
  const { series, omitted, runtimeAxis, qubitsAxis } = model;
  const totalPoints = series.reduce((sum, s) => sum + s.points.length, 0);

  if (series.length === 0) {
    return (
      <div className="pareto-empty">
        <p className="muted">
          None of the selected runs has a frontier to plot.
        </p>
        <OmissionNote omitted={omitted} />
      </div>
    );
  }

  const summary = series
    .map(
      (s) =>
        `${s.name}: ${s.points.length} frontier point${s.points.length === 1 ? "" : "s"}, ` +
        `${s.points[0]?.qubitsDisplay} qubits at ${s.points[0]?.runtimeDisplay} to ` +
        `${s.points[s.points.length - 1]?.qubitsDisplay} qubits at ${s.points[s.points.length - 1]?.runtimeDisplay}`,
    )
    .join("; ");

  return (
    <div className="pareto-curves">
      {/*
        The accessible name stays short ("Pareto frontier curves"); the spoken
        description — axes plus each run's span — lives in the sr-only caption,
        so a screen reader gets the shape of the data without opening anything.
      */}
      <figure className="pareto-figure" aria-label="Pareto frontier curves">
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          <ScatterChart margin={{ top: 12, right: 20, bottom: 28, left: 12 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-chart-grid)" />
            <XAxis
              type="number"
              dataKey="runtime"
              name="Runtime"
              scale={runtimeAxis.scale}
              domain={runtimeAxis.domain}
              {...(runtimeAxis.ticks ? { ticks: runtimeAxis.ticks } : {})}
              allowDataOverflow={false}
              tick={{ fontSize: 11 }}
              stroke="var(--color-chart-axis)"
              tickFormatter={(value: number) => formatMetric({ value, unit: "ns", display: "" })}
              label={{
                value: "Runtime",
                position: "insideBottom",
                offset: -16,
                style: { fontSize: 12, fill: "var(--color-body)" },
              }}
            />
            <YAxis
              type="number"
              dataKey="physicalQubits"
              name="Physical Qubits"
              width={70}
              scale={qubitsAxis.scale}
              domain={qubitsAxis.domain}
              {...(qubitsAxis.ticks ? { ticks: qubitsAxis.ticks } : {})}
              allowDataOverflow={false}
              tick={{ fontSize: 11 }}
              stroke="var(--color-chart-axis)"
              tickFormatter={(value: number) =>
                formatMetric({ value, unit: "qubits", display: "" }, { notation: "compact" })
              }
              label={{
                value: "Physical Qubits",
                angle: -90,
                position: "insideLeft",
                style: { fontSize: 12, fill: "var(--color-body)" },
              }}
            />
            <Tooltip
              cursor={{ strokeDasharray: "3 3", stroke: "var(--color-chart-axis)" }}
              content={<CurveTooltip />}
            />
            {series.map((s) => (
              <Scatter
                key={s.id}
                name={s.name}
                data={s.points}
                fill={seriesColor(s.seriesNumber)}
                line={{ stroke: seriesColor(s.seriesNumber), strokeWidth: 2 }}
                lineType="joint"
                isAnimationActive={false}
                shape={(props: unknown) => (
                  <CurvePoint {...(props as CurvePointProps)} symbol={s.symbol} />
                )}
              />
            ))}
          </ScatterChart>
        </ResponsiveContainer>

        <figcaption className="sr-only">
          Physical qubits against runtime. Each selected run contributes one curve
          through every point on its frontier. {summary}.
        </figcaption>
      </figure>

      <ul className="pareto-legend" aria-label="Curve key">
        {series.map((s) => (
          <li key={s.id} className="pareto-legend__item">
            <svg
              className="pareto-legend__glyph"
              viewBox="-10 -10 20 20"
              width="16"
              height="16"
              aria-hidden="true"
              focusable="false"
            >
              <line x1={-9} x2={9} y1={0} y2={0} stroke={seriesColor(s.seriesNumber)} strokeWidth={2} />
              <path d={symbolPath(s.symbol, POINT_RADIUS)} fill={seriesColor(s.seriesNumber)} />
            </svg>
            <span className="pareto-legend__name">{s.name}</span>
            <span className="muted">
              {s.points.length} point{s.points.length === 1 ? "" : "s"}
              {s.points.length < s.frontierCount
                ? ` of ${s.frontierCount} (${s.frontierCount - s.points.length} not plottable)`
                : ""}
            </span>
          </li>
        ))}
      </ul>

      <OmissionNote omitted={omitted} />

      {/*
        The curves' full text equivalent, behind the same disclosure idiom the
        field filter uses. Collapsed by default so it doesn't dominate the
        surface; the sr-only caption above already speaks the summary.
      */}
      <div className="pareto-data">
        <button
          type="button"
          className="filter-toggle"
          aria-expanded={isDataOpen}
          aria-controls="pareto-curve-data"
          onClick={() => setIsDataOpen((open) => !open)}
        >
          Curve data as a table ({totalPoints} plotted point{totalPoints === 1 ? "" : "s"})
          <span aria-hidden="true">{isDataOpen ? "▲" : "▼"}</span>
        </button>
        {isDataOpen ? (
          <div className="comparison-table-scroll" id="pareto-curve-data">
            <table className="comparison-table">
              <caption className="sr-only">
                Every plotted frontier point per run — the text equivalent of the Pareto curves.
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="field-col">
                    Run
                  </th>
                  <th scope="col">Frontier row</th>
                  <th scope="col" className="num">
                    Runtime
                  </th>
                  <th scope="col" className="num">
                    Physical Qubits
                  </th>
                </tr>
              </thead>
              <tbody>
                {series.flatMap((s) =>
                  s.points.map((point) => (
                    <tr key={`${s.id}-${point.index}`}>
                      <th scope="row" className="field-col">
                        {s.name}
                      </th>
                      <td>
                        Row {point.index + 1} of {s.frontierCount}
                        {point.selected ? " · shown in the table above" : ""}
                      </td>
                      <td className="num">{point.runtimeDisplay}</td>
                      <td className="num">{point.qubitsDisplay}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
}

const OMISSION_REASONS: Record<ParetoOmission["reason"], string> = {
  failed: "the run failed, so it has no frontier",
  "no-frontier": "the run reported no frontier rows",
  unplottable: "no frontier row reported a numeric runtime and qubit count",
};

/** Names every selected run that has no curve, and why. Never silently dropped. */
function OmissionNote({ omitted }: { omitted: ParetoOmission[] }) {
  if (omitted.length === 0) return null;
  return (
    <p className="pareto-omitted muted" role="note">
      Not plotted:{" "}
      {omitted.map((entry, index) => (
        <span key={entry.id}>
          {index > 0 ? "; " : ""}
          <strong>{entry.name}</strong> — {OMISSION_REASONS[entry.reason]}
        </span>
      ))}
      .
    </p>
  );
}

interface CurvePointProps {
  cx?: number;
  cy?: number;
  fill?: string;
  payload?: ParetoPoint;
}

/**
 * One plotted point. The symbol is per-run (so runs stay distinguishable in
 * greyscale) and the representative row carries an extra ring, matching the
 * "Row N of M" the comparison table shows for that run.
 */
function CurvePoint({ cx, cy, fill, payload, symbol }: CurvePointProps & { symbol: SeriesSymbol }) {
  if (cx === undefined || cy === undefined || !Number.isFinite(cx) || !Number.isFinite(cy)) {
    return <g />;
  }
  return (
    <g transform={`translate(${cx}, ${cy})`}>
      {payload?.selected ? (
        <circle r={SELECTED_RING_RADIUS} fill="none" stroke={fill} strokeWidth={1.5} opacity={0.75} />
      ) : null}
      <path d={symbolPath(symbol, POINT_RADIUS)} fill={fill} stroke="var(--color-surface)" strokeWidth={1} />
    </g>
  );
}

/**
 * SVG path for a series symbol, centred on the origin. Shared by the plotted
 * points and the legend glyph so the key always matches the chart exactly.
 */
export function symbolPath(symbol: SeriesSymbol, r: number): string {
  const arm = r * 0.42;
  switch (symbol) {
    case "circle":
      return `M ${-r} 0 a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0 Z`;
    case "diamond":
      return `M 0 ${-r * 1.25} L ${r} 0 L 0 ${r * 1.25} L ${-r} 0 Z`;
    case "triangle":
      return `M 0 ${-r * 1.2} L ${r * 1.1} ${r * 0.8} L ${-r * 1.1} ${r * 0.8} Z`;
    case "triangleDown":
      return `M 0 ${r * 1.2} L ${r * 1.1} ${-r * 0.8} L ${-r * 1.1} ${-r * 0.8} Z`;
    case "square":
      return `M ${-r * 0.9} ${-r * 0.9} H ${r * 0.9} V ${r * 0.9} H ${-r * 0.9} Z`;
    case "cross":
      return `M ${-arm} ${-r} H ${arm} V ${-arm} H ${r} V ${arm} H ${arm} V ${r} H ${-arm} V ${arm} H ${-r} V ${-arm} H ${-arm} Z`;
    case "star":
      return starPath(r * 1.3, r * 0.55);
    case "wye":
      return `M ${-arm} 0 V ${r} H ${arm} V 0 L ${r * 0.95} ${-r * 0.55} L ${arm * 0.6} ${-r * 0.95} L 0 ${-r * 0.3} L ${-arm * 0.6} ${-r * 0.95} L ${-r * 0.95} ${-r * 0.55} Z`;
  }
}

/** Five-pointed star, first point straight up. */
function starPath(outer: number, inner: number): string {
  const points: string[] = [];
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    points.push(`${(radius * Math.cos(angle)).toFixed(2)} ${(radius * Math.sin(angle)).toFixed(2)}`);
  }
  return `M ${points.join(" L ")} Z`;
}

interface CurveTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: ParetoPoint }>;
}

/** Scatter tooltip payloads carry the datum, not its series — hence `runName`. */
function CurveTooltip({ active, payload }: CurveTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  return (
    <div className="comparison-tooltip">
      <strong>{point.runName}</strong>
      <span>Row {point.index + 1}</span>
      <span>{point.qubitsDisplay} qubits</span>
      <span>{point.runtimeDisplay}</span>
    </div>
  );
}

/** The named series, re-exported for tests that assert curve identity. */
export type { ParetoSeries };
