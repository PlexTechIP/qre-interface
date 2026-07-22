import { useState } from "react";
import type { FieldMetric, FrontierRow } from "../../shared/types";
import { formatMetric } from "./formatMetric";

const SVG_WIDTH = 420;
const SVG_HEIGHT = 280;
const TOOLTIP_WIDTH = 210;
const TOOLTIP_HEIGHT = 118;
const PLOT = {
  left: 62,
  right: 24,
  top: 24,
  bottom: 54,
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
  const runtimeValues = rows.map((row) => row.runtime.value);
  const qubitValues = rows.map((row) => row.physicalQubits.value);
  const xTicks = makeTicks(runtimeValues, "runtime");
  const yTicks = makeTicks(qubitValues, "physicalQubits");
  const points = rows.map<PlotPoint>((row, index) => ({
    row,
    index,
    x: PLOT.left + scaleValue(row.runtime.value, runtimeValues) * plotWidth,
    y: PLOT.top + (1 - scaleValue(row.physicalQubits.value, qubitValues)) * plotHeight,
  }));
  const activePoint = activeTooltipIndex === null ? null : points[activeTooltipIndex] ?? null;

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
          {yTicks.map((tick) => {
            const y = PLOT.top + (1 - scaleValue(tick, qubitValues)) * plotHeight;
            return (
              <g key={`y-${tick}`}>
                <line className="chart-gridline" x1={PLOT.left} x2={SVG_WIDTH - PLOT.right} y1={y} y2={y} />
                <text className="chart-tick y" x={PLOT.left - 10} y={y + 4}>
                  {formatMetric({ value: tick, unit: "qubits", display: "" }, { notation: "compact" })}
                </text>
              </g>
            );
          })}
          {xTicks.map((tick) => {
            const x = PLOT.left + scaleValue(tick, runtimeValues) * plotWidth;
            return (
              <g key={`x-${tick}`}>
                <text className="chart-tick x" x={x} y={SVG_HEIGHT - 24}>
                  {formatMetric({ value: tick, unit: "ns", display: "" })}
                </text>
              </g>
            );
          })}
          <line
            className="chart-axis"
            x1={PLOT.left}
            x2={PLOT.left}
            y1={PLOT.top}
            y2={SVG_HEIGHT - PLOT.bottom}
          />
          <line
            className="chart-axis"
            x1={PLOT.left}
            x2={SVG_WIDTH - PLOT.right}
            y1={SVG_HEIGHT - PLOT.bottom}
            y2={SVG_HEIGHT - PLOT.bottom}
          />
          <text className="chart-label x" x={PLOT.left + plotWidth / 2} y={SVG_HEIGHT - 4}>
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

        {points.length > 1 ? (
          <polyline
            className="frontier-line"
            points={points.map((point) => `${point.x},${point.y}`).join(" ")}
            aria-hidden="true"
          />
        ) : null}

        {points.map((point) => {
          const isSelected = point.index === selectedIndex;
          const pointLabel = `Select row ${point.index + 1}: ${formatMetric(point.row.runtime)} runtime, ${formatMetric(
            point.row.physicalQubits,
          )} physical qubits`;

          return (
            <g key={`${point.row.runtime.value}-${point.row.physicalQubits.value}-${point.index}`}>
              {isSelected ? <circle className="scatter-point-ring" cx={point.x} cy={point.y} r={11} aria-hidden="true" /> : null}
              <circle
                className={isSelected ? "scatter-point selected" : "scatter-point"}
                cx={point.x}
                cy={point.y}
                r={isSelected ? 6 : 4}
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
  const tooltipX = clamp(point.x + 14, 8, SVG_WIDTH - TOOLTIP_WIDTH - 8);
  const preferredY = point.y - TOOLTIP_HEIGHT / 2;
  const tooltipY = clamp(preferredY, 8, SVG_HEIGHT - TOOLTIP_HEIGHT - 8);
  const rows = [
    ["Qubits", tooltipMetric(point.row.physicalQubits)],
    ["Runtime", tooltipMetric(point.row.runtime)],
    ["Total Error", tooltipMetric(point.row.totalError)],
    ["Code Dist.", tooltipMetric(point.row.codeDistance)],
    ["Factories", tooltipMetric(point.row.factories)],
  ];

  return (
    <g className="scatter-tooltip" pointerEvents="none" role="status" aria-live="polite">
      <rect className="scatter-tooltip-bg" x={tooltipX} y={tooltipY} width={TOOLTIP_WIDTH} height={TOOLTIP_HEIGHT} rx={8} />
      <text className="scatter-tooltip-title" x={tooltipX + 12} y={tooltipY + 20}>
        Row {point.index + 1} details
      </text>
      {rows.map(([label, value], index) => {
        const y = tooltipY + 40 + index * 15;
        return (
          <text className="scatter-tooltip-row" x={tooltipX + 12} y={y} key={label}>
            <tspan className="scatter-tooltip-label">{label}</tspan>
            <tspan className="scatter-tooltip-value" x={tooltipX + 88}>
              {value}
            </tspan>
          </text>
        );
      })}
    </g>
  );
}

function makeTicks(values: number[], field: "runtime" | "physicalQubits"): number[] {
  if (values.length === 0) {
    return [];
  }

  if (values.length === 1) {
    const value = values[0] ?? 0;
    return value === 0 ? [0] : [value];
  }

  const min = Math.min(...values);
  const max = Math.max(...values);

  if (min === max) {
    return [min];
  }

  if (field === "runtime") {
    return [min, (min + max) / 2, max];
  }

  return [min, max];
}

function scaleValue(value: number, values: number[]): number {
  if (values.length <= 1) {
    return 0.5;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);

  if (min === max) {
    return 0.5;
  }

  if (min > 0 && max / min > 20) {
    const logMin = Math.log10(min);
    const logMax = Math.log10(max);
    return (Math.log10(value) - logMin) / (logMax - logMin);
  }

  return (value - min) / (max - min);
}

function tooltipMetric(metric: FieldMetric): string {
  return formatMetric(metric);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
