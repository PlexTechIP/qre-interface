import { useState } from "react";
import type { FieldMetric, FrontierRow } from "../../shared/types";
import { formatMetric } from "./formatMetric";

const SVG_WIDTH = 480;
const SVG_HEIGHT = 320;
// Kept under half the plot width (SVG_WIDTH / 2) so a horizontal flip can always
// seat the tooltip clear of the cursor without spilling past the SVG edge.
const TOOLTIP_WIDTH = 222;
const TOOLTIP_HEIGHT = 154;
const TOOLTIP_GAP = 14;
const TOOLTIP_MARGIN = 8;
const PLOT = {
  left: 64,
  right: 22,
  top: 22,
  bottom: 56,
};

interface FrontierScatterProps {
  rows: FrontierRow[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}

interface PlotPoint {
  row: FrontierRow;
  index: number;
  x: number;
  y: number;
}

export function FrontierScatter({ rows, selectedIndex, onSelect }: FrontierScatterProps) {
  const [activeTooltipIndex, setActiveTooltipIndex] = useState<number | null>(null);
  const plotWidth = SVG_WIDTH - PLOT.left - PLOT.right;
  const plotHeight = SVG_HEIGHT - PLOT.top - PLOT.bottom;
  const plotRight = SVG_WIDTH - PLOT.right;
  const plotBottom = SVG_HEIGHT - PLOT.bottom;

  const xScale = makeScale(rows.map((row) => row.runtime.value));
  const yScale = makeScale(rows.map((row) => row.physicalQubits.value));

  const points = rows.map<PlotPoint>((row, index) => ({
    row,
    index,
    x: PLOT.left + project(xScale, row.runtime.value) * plotWidth,
    y: PLOT.top + (1 - project(yScale, row.physicalQubits.value)) * plotHeight,
  }));
  const activePoint = activeTooltipIndex === null ? null : points[activeTooltipIndex] ?? null;

  // The frontier reads as a trade-off curve only when its vertices are walked in
  // x order; the table's row order is not guaranteed to be. Sorting a copy keeps
  // each point's original index (used for labels and selection) untouched.
  const linePoints = [...points].sort((a, b) => a.x - b.x);
  const linePath = linePoints.map((point) => `${point.x},${point.y}`).join(" ");
  // The region below the curve toward the origin is where a cheaper solution
  // would live if one existed — shading it gives the frontier a readable body.
  const areaPath =
    linePoints.length > 1
      ? `M ${linePoints[0]!.x},${plotBottom} L ${linePath} L ${linePoints[linePoints.length - 1]!.x},${plotBottom} Z`
      : null;

  return (
    <div className="scatter-wrap">
      <svg
        className="frontier-scatter"
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        role="img"
        aria-labelledby="frontier-scatter-title frontier-scatter-desc"
      >
        <title id="frontier-scatter-title">Pareto frontier scatter plot</title>
        <desc id="frontier-scatter-desc">
          Runtime on the horizontal axis and physical qubits on the vertical axis. Each point matches one table row.
        </desc>
        <g aria-hidden="true">
          {yScale.ticks.map((tick) => {
            const y = PLOT.top + (1 - project(yScale, tick)) * plotHeight;
            return (
              <g key={`y-${tick}`}>
                <line className="chart-gridline" x1={PLOT.left} x2={plotRight} y1={y} y2={y} />
                <text className="chart-tick y" x={PLOT.left - 10} y={y + 4}>
                  {formatMetric({ value: tick, unit: "qubits", display: "" }, { notation: "compact" })}
                </text>
              </g>
            );
          })}
          {xScale.ticks.map((tick) => {
            const x = PLOT.left + project(xScale, tick) * plotWidth;
            return (
              <g key={`x-${tick}`}>
                <line className="chart-gridline" x1={x} x2={x} y1={PLOT.top} y2={plotBottom} />
                <text className="chart-tick x" x={x} y={SVG_HEIGHT - 26}>
                  {formatMetric({ value: tick, unit: "ns", display: "" })}
                </text>
              </g>
            );
          })}
          <line className="chart-axis" x1={PLOT.left} x2={PLOT.left} y1={PLOT.top} y2={plotBottom} />
          <line className="chart-axis" x1={PLOT.left} x2={plotRight} y1={plotBottom} y2={plotBottom} />
          <text className="chart-label x" x={PLOT.left + plotWidth / 2} y={SVG_HEIGHT - 6}>
            Runtime
          </text>
          <text
            className="chart-label y"
            x={16}
            y={PLOT.top + plotHeight / 2}
            transform={`rotate(-90 16 ${PLOT.top + plotHeight / 2})`}
          >
            Physical Qubits
          </text>
        </g>

        {areaPath ? <path className="frontier-area" d={areaPath} aria-hidden="true" /> : null}
        {linePoints.length > 1 ? (
          <polyline className="frontier-line" points={linePath} aria-hidden="true" />
        ) : null}

        {points.map((point) => {
          const isSelected = point.index === selectedIndex;
          const pointLabel = `Select row ${point.index + 1}: ${formatMetric(point.row.runtime)} runtime, ${formatMetric(
            point.row.physicalQubits,
          )} physical qubits`;

          return (
            <g key={`${point.row.runtime.value}-${point.row.physicalQubits.value}-${point.index}`}>
              {isSelected ? <circle className="scatter-point-ring" cx={point.x} cy={point.y} r={12} aria-hidden="true" /> : null}
              <circle
                className={isSelected ? "scatter-point selected" : "scatter-point"}
                cx={point.x}
                cy={point.y}
                r={isSelected ? 7 : 5}
                role="button"
                tabIndex={0}
                aria-label={pointLabel}
                aria-pressed={isSelected}
                onClick={() => onSelect(point.index)}
                onMouseEnter={() => setActiveTooltipIndex(point.index)}
                onMouseLeave={() => setActiveTooltipIndex(null)}
                onFocus={() => setActiveTooltipIndex(point.index)}
                onBlur={() => setActiveTooltipIndex(null)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(point.index);
                  }
                }}
              >
                <title>{pointLabel}</title>
              </circle>
            </g>
          );
        })}

        {activePoint ? <ScatterTooltip point={activePoint} /> : null}
      </svg>
    </div>
  );
}

function ScatterTooltip({ point }: { point: PlotPoint }) {
  // Seat the tooltip beside the point, on the side facing the plot's interior:
  // right of a left-half point, left of a right-half point. That flip keeps the
  // cursor off the tooltip; the clamp keeps the tooltip inside the SVG. Because
  // TOOLTIP_WIDTH < SVG_WIDTH / 2, the clamp can never pull it back over the
  // cursor, so this holds for every point — including one near the center.
  const placeLeft = point.x > SVG_WIDTH / 2;
  const preferredX = placeLeft ? point.x - TOOLTIP_GAP - TOOLTIP_WIDTH : point.x + TOOLTIP_GAP;
  const tooltipX = clamp(preferredX, TOOLTIP_MARGIN, SVG_WIDTH - TOOLTIP_WIDTH - TOOLTIP_MARGIN);
  const preferredY = point.y - TOOLTIP_HEIGHT / 2;
  const tooltipY = clamp(preferredY, TOOLTIP_MARGIN, SVG_HEIGHT - TOOLTIP_HEIGHT - TOOLTIP_MARGIN);
  const rows = [
    ["Qubits", tooltipMetric(point.row.physicalQubits)],
    ["Runtime", tooltipMetric(point.row.runtime)],
    ["Total Error", tooltipMetric(point.row.totalError)],
    ["Code Dist.", tooltipMetric(point.row.codeDistance)],
    ["Factories", tooltipMetric(point.row.factories)],
  ];

  return (
    <g className="scatter-tooltip" pointerEvents="none" role="status" aria-live="polite">
      <rect className="scatter-tooltip-bg" x={tooltipX} y={tooltipY} width={TOOLTIP_WIDTH} height={TOOLTIP_HEIGHT} rx={9} />
      <text className="scatter-tooltip-title" x={tooltipX + 14} y={tooltipY + 26}>
        Row {point.index + 1} details
      </text>
      {rows.map(([label, value], index) => {
        const y = tooltipY + 52 + index * 19;
        return (
          <text className="scatter-tooltip-row" x={tooltipX + 14} y={y} key={label}>
            <tspan className="scatter-tooltip-label">{label}</tspan>
            <tspan className="scatter-tooltip-value" x={tooltipX + 108}>
              {value}
            </tspan>
          </text>
        );
      })}
    </g>
  );
}

interface Scale {
  kind: "linear" | "log";
  // The (possibly padded) domain the plot actually spans.
  min: number;
  max: number;
  // Whether the domain is degenerate (0 or 1 distinct value): everything maps
  // to the middle of the axis and there is a single tick.
  degenerate: boolean;
  ticks: number[];
}

// One descriptor drives both projection and tick placement, so a tick can never
// be drawn at a position the scale would not put its value.
function makeScale(values: number[]): Scale {
  const finite = values.filter((value) => Number.isFinite(value));
  if (finite.length === 0) {
    return { kind: "linear", min: 0, max: 1, degenerate: true, ticks: [] };
  }

  const dataMin = Math.min(...finite);
  const dataMax = Math.max(...finite);
  if (dataMin === dataMax) {
    return { kind: "linear", min: dataMin, max: dataMax, degenerate: true, ticks: [dataMin] };
  }

  // Wide dynamic ranges (many orders of magnitude) are unreadable on a linear
  // axis — the small points collapse onto the origin — so switch to log.
  if (dataMin > 0 && dataMax / dataMin > 20) {
    const min = Math.pow(10, Math.floor(Math.log10(dataMin)));
    const max = Math.pow(10, Math.ceil(Math.log10(dataMax)));
    return { kind: "log", min, max, degenerate: false, ticks: decadeTicks(min, max) };
  }

  const { min, max, ticks } = niceLinear(dataMin, dataMax);
  return { kind: "linear", min, max, degenerate: false, ticks };
}

function project(scale: Scale, value: number): number {
  if (scale.degenerate) {
    return 0.5;
  }
  if (scale.kind === "log") {
    const logMin = Math.log10(scale.min);
    const logMax = Math.log10(scale.max);
    return (Math.log10(value) - logMin) / (logMax - logMin);
  }
  return (value - scale.min) / (scale.max - scale.min);
}

// "Nice" round tick steps (1/2/5 × 10ⁿ) with the domain widened to the outer
// ticks, so points sit inside a framed plot and labels read as round numbers.
function niceLinear(dataMin: number, dataMax: number, count = 4): { min: number; max: number; ticks: number[] } {
  const step = niceNum(niceNum(dataMax - dataMin, false) / Math.max(1, count - 1), true);
  const min = Math.floor(dataMin / step) * step;
  const max = Math.ceil(dataMax / step) * step;
  const decimals = Math.max(0, -Math.floor(Math.log10(step)));
  const ticks: number[] = [];
  for (let value = min; value <= max + step * 0.5; value += step) {
    ticks.push(Number(value.toFixed(decimals)));
  }
  return { min, max, ticks };
}

function niceNum(range: number, round: boolean): number {
  if (range <= 0) {
    return 1;
  }
  const exponent = Math.floor(Math.log10(range));
  const fraction = range / Math.pow(10, exponent);
  let niceFraction: number;
  if (round) {
    niceFraction = fraction < 1.5 ? 1 : fraction < 3 ? 2 : fraction < 7 ? 5 : 10;
  } else {
    niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  }
  return niceFraction * Math.pow(10, exponent);
}

// Powers of ten spanning the domain; thinned so a tall range does not crowd the
// axis with more labels than it can hold.
function decadeTicks(min: number, max: number): number[] {
  const first = Math.round(Math.log10(min));
  const last = Math.round(Math.log10(max));
  const decades = last - first;
  const stride = decades <= 5 ? 1 : Math.ceil(decades / 5);
  const ticks: number[] = [];
  for (let exponent = first; exponent <= last; exponent += stride) {
    ticks.push(Math.pow(10, exponent));
  }
  return ticks;
}

function tooltipMetric(metric: FieldMetric): string {
  return formatMetric(metric);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
