import { formatMetric } from "../results/formatMetric";
import { DefinitionTip, definitionId } from "../components/DefinitionTip";
import { buildComparisonRows, type ComparisonColumn } from "./comparisonModel";

/**
 * The comparison table — one column per selected run, with configuration rows
 * followed by result-field rows. The six result defaults always show;
 * additional result rows are toggled by the field filter (owned by the parent,
 * passed as `hiddenKeys`). Every value routes through Team 2's `formatMetric`
 * (`value` + `unit`, never `display`). This IS the text equivalent for the bar
 * charts — pure, no store/engine knowledge.
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
              <th
                key={col.id}
                scope="col"
                className={col.failed ? "comparison-col-failed" : undefined}
              >
                <span className="comparison-run-name" title={col.name}>
                  {col.name}
                </span>
                <span className="comparison-run-meta muted">
                  {col.application}
                  {" · "}
                  {col.architecture}
                </span>
                <span className="comparison-run-meta muted">{col.qreVersion}</span>
                {col.selectedIndex > 0 ? (
                  <span className="comparison-run-meta comparison-run-row">
                    Row {col.selectedIndex + 1} of {col.frontierCount}
                  </span>
                ) : null}
                {col.failed ? <span className="status-pill failed">Failed</span> : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const tipId = definitionId(`comparison-field-${row.key}`);
            return (
            <tr key={row.key}>
              <th scope="row" className="field-col" aria-describedby={tipId}>
                <span className="comparison-field-head">
                  {row.label}
                  <DefinitionTip id={tipId} label={row.label} portal>
                    {row.description}
                  </DefinitionTip>
                </span>
              </th>
              {row.metrics.map((metric, index) => {
                // A failed run reports no frontier at all, so EVERY cell in its
                // column would otherwise be an ambiguous "—" that reads the same
                // as "this one field wasn't reported". Say which it is.
                const failed =
                  (columns[index]?.failed ?? false) &&
                  !row.availableOnFailedRun;
                return (
                  <td
                    key={columns[index]?.id ?? index}
                    className={failed ? "num comparison-col-failed" : "num"}
                  >
                    {failed ? (
                      <span className="comparison-no-data">No result data</span>
                    ) : (
                      formatMetric(metric)
                    )}
                  </td>
                );
              })}
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
