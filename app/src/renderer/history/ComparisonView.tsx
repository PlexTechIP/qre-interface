import { useMemo, useState } from "react";

import type { RunRecord } from "../../shared/types";
import { FieldFilter } from "../results/FieldFilter";
import { ComparisonCharts } from "./ComparisonCharts";
import { ComparisonTable } from "./ComparisonTable";
import { additionalFieldDefinitions, toComparisonColumn } from "./comparisonModel";

/**
 * The Comparison surface — a PURE function of a selected set of `RunRecord`s plus
 * callbacks. No store, no engine (grep-provable): it reads the same records the
 * History list already renders. It owns only the local field-filter view state
 * (which additional rows show), reusing Team 2's `FieldFilter` + `formatMetric`.
 *
 * States: an empty "pick runs to compare" prompt, a single-run selection, and a
 * many-run selection all render cleanly against the mock records.
 */
export interface ComparisonViewProps {
  records: RunRecord[];
  onClear: () => void;
  onRemove: (id: string) => void;
  /** Opens the comparison-set export stub (the real exporter is Part 3). */
  onExport: () => void;
}

export function ComparisonView({ records, onClear, onRemove, onExport }: ComparisonViewProps) {
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set());
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const columns = useMemo(() => records.map(toComparisonColumn), [records]);
  const additionalFields = useMemo(() => additionalFieldDefinitions(columns), [columns]);
  const visibleAdditionalCount = additionalFields.filter((field) => !hiddenKeys.has(field.key)).length;

  const toggleField = (key: string) =>
    setHiddenKeys((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const showAll = () =>
    setHiddenKeys((previous) => {
      const next = new Set(previous);
      additionalFields.forEach((field) => next.delete(field.key));
      return next;
    });
  const showDefaultsOnly = () =>
    setHiddenKeys((previous) => {
      const next = new Set(previous);
      additionalFields.forEach((field) => next.add(field.key));
      return next;
    });

  return (
    <section className="comparison-view" aria-labelledby="comparison-title">
      <div className="panel-header">
        <div>
          <h2 id="comparison-title">Comparison</h2>
          <p>
            {records.length === 0
              ? "Select runs from History to compare them side by side."
              : `Comparing ${records.length} selected run${records.length === 1 ? "" : "s"}.`}
          </p>
        </div>
        <div className="comparison-actions">
          <button type="button" onClick={onExport} disabled={records.length === 0}>
            Export comparison
          </button>
          <button type="button" onClick={onClear} disabled={records.length === 0}>
            Clear selection
          </button>
        </div>
      </div>

      {records.length === 0 ? (
        <div className="empty-state" role="status">
          <p>No runs selected for comparison.</p>
          <p className="muted">
            Check the boxes next to runs in the History list, then return here to compare them.
          </p>
        </div>
      ) : (
        <>
          <div className="comparison-chips" aria-label="Selected runs">
            {columns.map((col) => (
              <span key={col.id} className="comparison-chip">
                {col.name}
                <button
                  type="button"
                  className="chip-remove"
                  onClick={() => onRemove(col.id)}
                  aria-label={`Remove ${col.name} from comparison`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h3>Comparison table</h3>
                <p>One column per run, one row per result field.</p>
              </div>
              {additionalFields.length > 0 ? (
                <button
                  type="button"
                  className="filter-toggle"
                  aria-expanded={isFilterOpen}
                  aria-controls="comparison-field-filter"
                  onClick={() => setIsFilterOpen((open) => !open)}
                >
                  Filter fields ({visibleAdditionalCount}/{additionalFields.length} extra shown)
                  <span aria-hidden="true">{isFilterOpen ? "▲" : "▼"}</span>
                </button>
              ) : (
                <span className="muted">6 default fields — the selected runs reported no extra fields</span>
              )}
            </div>
            {isFilterOpen && additionalFields.length > 0 ? (
              <FieldFilter
                id="comparison-field-filter"
                fields={additionalFields}
                hiddenKeys={hiddenKeys}
                onToggle={toggleField}
                onShowAll={showAll}
                onShowDefaultsOnly={showDefaultsOnly}
              />
            ) : null}
            <ComparisonTable columns={columns} hiddenKeys={hiddenKeys} />
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h3>Per-metric bars</h3>
                <p>One bar per run; the table above is the text equivalent.</p>
              </div>
            </div>
            <ComparisonCharts columns={columns} />
          </section>
        </>
      )}
    </section>
  );
}
