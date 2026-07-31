import { formatMetric } from "../results/formatMetric";
import { buildComparisonRows, type ComparisonColumn } from "./comparisonModel";

/**
 * The comparison table — one column per selected run, one row per result field.
 * The six defaults always show; additional rows are toggled by the field filter
 * (owned by the parent, passed as `hiddenKeys`). Every value routes through Team
 * 2's `formatMetric` (`value` + `unit`, never `display`). This IS the text
 * equivalent for the bar charts — pure, no store/engine knowledge.
 */
export interface ComparisonTableProps {
  columns: ComparisonColumn[];
  hiddenKeys: ReadonlySet<string>;
}

export function ComparisonTable({ columns, hiddenKeys }: ComparisonTableProps) {
  const rows = buildComparisonRows(columns, hiddenKeys);

  return (
    <div className="comparison-table-scroll">
      <table className="comparison-table">
        <caption className="sr-only">
          Result fields per selected run — the text equivalent of the comparison bar charts.
        </caption>
        <thead>
          <tr>
            <th scope="col" className="field-col">
              Field
            </th>
            {columns.map((col) => (
              <th key={col.id} scope="col">
                <span className="comparison-run-name">{col.name}</span>
                <span className="comparison-run-meta muted">
                  {col.application}
                  {" · "}
                  {col.architecture}
                  {" · "}
                  {col.qreVersion}
                </span>
                {col.selectedIndex > 0 ? (
                  <span className="comparison-run-meta">
                    Row {col.selectedIndex + 1} of {col.frontierCount}
                  </span>
                ) : null}
                {col.failed ? <span className="status-pill failed">Failed</span> : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <th scope="row" className="field-col">
                {row.label}
                {row.unitLabel ? <small className="muted"> · {row.unitLabel}</small> : null}
              </th>
              {row.metrics.map((metric, index) => (
                <td key={columns[index]?.id ?? index} className="num">
                  {formatMetric(metric)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
