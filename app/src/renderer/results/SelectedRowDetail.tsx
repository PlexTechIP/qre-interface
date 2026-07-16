import type { FrontierRow } from "../../shared/types";
import { formatMetric } from "./formatMetric";
import { getDisplayFields } from "./resultFields";

interface SelectedRowDetailProps {
  row: FrontierRow;
  rowNumber: number;
}

export function SelectedRowDetail({ row, rowNumber }: SelectedRowDetailProps) {
  const fields = getDisplayFields(row);

  return (
    <section className="panel detail-panel" aria-labelledby="selected-row-title">
      <div className="panel-header">
        <div>
          <h2 id="selected-row-title">Selected Frontier Point</h2>
          <p>Row {rowNumber} full reported field set.</p>
        </div>
      </div>
      <dl className="detail-grid">
        {fields.map((field) => (
          <div key={field.key} className="detail-item" title={field.description}>
            <dt>
              {field.label}
              {field.unitLabel ? <span>{field.unitLabel}</span> : null}
            </dt>
            <dd>{formatMetric(field.metric)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
