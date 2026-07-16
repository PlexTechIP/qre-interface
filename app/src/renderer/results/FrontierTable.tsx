import type { FrontierRow } from "../../shared/types";
import { formatMetric } from "./formatMetric";
import { DEFAULT_FIELD_DEFINITIONS, getDefaultMetric } from "./resultFields";

interface FrontierTableProps {
  rows: FrontierRow[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}

export function FrontierTable({ rows, selectedIndex, onSelect }: FrontierTableProps) {
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
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
