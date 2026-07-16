import type { FrontierRow } from "../../shared/types";
import { formatMetric } from "./formatMetric";
import { DEFAULT_FIELD_DEFINITIONS, getDisplayFields } from "./resultFields";

interface SelectedRowDetailProps {
  row: FrontierRow;
  rowNumber: number;
  /** Additional-field keys currently hidden by the field filter (shared with the table). */
  hiddenAdditionalKeys: ReadonlySet<string>;
}

export function SelectedRowDetail({ row, rowNumber, hiddenAdditionalKeys }: SelectedRowDetailProps) {
  const fields = getDisplayFields(row, hiddenAdditionalKeys);
  const rowOwnAdditionalCount = Object.keys(row.additional ?? {}).length;
  const visibleAdditionalCount = fields.length - DEFAULT_FIELD_DEFINITIONS.length;
  const subtitle =
    visibleAdditionalCount === rowOwnAdditionalCount
      ? `Row ${rowNumber} full reported field set.`
      : `Row ${rowNumber}: ${visibleAdditionalCount} of ${rowOwnAdditionalCount} additional fields shown (adjust with the column filter).`;

  return (
    <section className="panel detail-panel" aria-labelledby="selected-row-title">
      <div className="panel-header">
        <div>
          <h2 id="selected-row-title">Selected Frontier Point</h2>
          <p>{subtitle}</p>
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
