import type { ResultFieldDefinition } from "./resultFields";

interface FieldFilterProps {
  id: string;
  fields: ResultFieldDefinition[];
  hiddenKeys: ReadonlySet<string>;
  onToggle: (key: string) => void;
  onShowAll: () => void;
  onShowDefaultsOnly: () => void;
  /**
   * Header copy. Defaults to the results-surface wording (defaults always show,
   * only extras are filterable). The comparison surface, where every field is
   * filterable, passes its own.
   */
  note?: string;
}

export function FieldFilter({ id, fields, hiddenKeys, onToggle, onShowAll, onShowDefaultsOnly, note }: FieldFilterProps) {
  return (
    <div id={id} className="field-filter">
      <div className="field-filter-header">
        <p>
          {note ??
            `The six default fields always show. Choose which of the ${fields.length} additional reported field${
              fields.length === 1 ? "" : "s"
            } this run reported also appear in the table and selected-row detail.`}
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
          // Namespaced by the panel `id` so a second filter (the comparison
          // charts share this control with the table) never collides ids.
          const inputId = `${id}-${field.key}`;
          const checked = !hiddenKeys.has(field.key);

          return (
            <li key={field.key}>
              <label htmlFor={inputId} title={field.description}>
                <input id={inputId} type="checkbox" checked={checked} onChange={() => onToggle(field.key)} />
                <span>{field.label}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
