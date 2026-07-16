import type { FrontierRow } from "../../shared/types";
import { formatMetric } from "./formatMetric";
import { DEFAULT_FIELD_DEFINITIONS, getDefaultMetric, type ResultFieldDefinition } from "./resultFields";

interface FrontierTableProps {
  rows: FrontierRow[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  /** Filter-selected additional fields (beyond the six defaults) to show as extra columns. */
  additionalFields: ResultFieldDefinition[];
}

export function FrontierTable({ rows, selectedIndex, onSelect, additionalFields }: FrontierTableProps) {
  return (
    <div className="table-scroll">
      <table className="frontier-table">
        <caption className="sr-only">Pareto frontier estimates</caption>
        <thead>
          <tr>
            <th scope="col">#</th>
            {DEFAULT_FIELD_DEFINITIONS.map((field) => (
              <th key={field.key} scope="col" title={field.description}>
                <span>{field.label}</span>
                {field.unitLabel ? <small>{field.unitLabel}</small> : null}
              </th>
            ))}
            {additionalFields.map((field) => (
              <th key={field.key} scope="col" title={field.description}>
                <span>{field.label}</span>
                {field.unitLabel ? <small>{field.unitLabel}</small> : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const isSelected = index === selectedIndex;

            return (
              <tr
                key={`${row.physicalQubits.value}-${row.runtime.value}-${index}`}
                className={isSelected ? "selected" : undefined}
                tabIndex={0}
                aria-selected={isSelected}
                onClick={() => onSelect(index)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(index);
                  }
                }}
              >
                <th scope="row">{index + 1}</th>
                {DEFAULT_FIELD_DEFINITIONS.map((field) => (
                  <td key={field.key}>{formatMetric(getDefaultMetric(row, field.key))}</td>
                ))}
                {additionalFields.map((field) => (
                  <td key={field.key}>{formatMetric(row.additional?.[field.key] ?? null)}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
