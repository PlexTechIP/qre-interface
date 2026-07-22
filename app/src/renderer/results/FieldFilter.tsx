import type { ResultFieldDefinition } from "./resultFields";

interface FieldFilterProps {
  id: string;
  fields: ResultFieldDefinition[];
  hiddenKeys: ReadonlySet<string>;
  onToggle: (key: string) => void;
  onShowAll: () => void;
  onShowDefaultsOnly: () => void;
}

export function FieldFilter({ id, fields, hiddenKeys, onToggle, onShowAll, onShowDefaultsOnly }: FieldFilterProps) {
  return (
    <div id={id} className="field-filter">
      <div className="field-filter-header">
        <p>
          The six default fields always show. Choose which of the {fields.length} additional reported field
          {fields.length === 1 ? "" : "s"} this run reported also appear in the table and selected-row detail.
        </p>
        <div className="field-filter-actions">
          <button type="button" onClick={onShowAll}>
            Show all
          </button>
          <button type="button" onClick={onShowDefaultsOnly}>
            Defaults only
          </button>
        </div>
      </div>
      <ul className="field-filter-list">
        {fields.map((field) => {
          const inputId = `field-filter-${field.key}`;
          const checked = !hiddenKeys.has(field.key);

          return (
            <li key={field.key}>
              <label htmlFor={inputId} title={field.description}>
                <input id={inputId} type="checkbox" checked={checked} onChange={() => onToggle(field.key)} />
                <span>{field.label}</span>
                {field.unitLabel ? <small>{field.unitLabel}</small> : null}
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
