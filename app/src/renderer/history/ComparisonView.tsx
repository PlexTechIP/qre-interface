import { useMemo, useState } from "react";

import type { RunRecord } from "../../shared/types";
import { FieldFilter } from "../results/FieldFilter";
import type { SelectedRowByRunId } from "../results/selectedRows";
import { ComparisonCharts } from "./ComparisonCharts";
import { ComparisonTable } from "./ComparisonTable";
import { DEFAULT_FIELD_DEFINITIONS } from "../results/resultFields";
import { FrontierCurves } from "./FrontierCurves";
import {
  comparisonFieldDefinitions,
  compareSelectionWarning,
  toComparisonColumn,
} from "./comparisonModel";

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
  selectedRowByRunId?: SelectedRowByRunId;
  onClear: () => void;
  onRemove: (id: string) => void;
  /**
   * Opens the comparison-set export, given the fields currently filtered out.
   *
   * The filter is this view's own state and the export is the caller's dialog,
   * so the hidden set has to cross that boundary explicitly — otherwise the
   * export silently reverts every field the analyst just hid.
   */
  onExport: (hiddenKeys: ReadonlySet<string>) => void;
  /** Navigate back to Run History (empty-state CTA). Optional. */
  onGoToHistory?: () => void;
  /** True when hosted inside the app shell, whose surface header already shows
   *  the "Comparison" title + description — so this view drops its own heading
   *  and keeps only the actions to avoid a duplicated header. */
  embedded?: boolean;
}

export function ComparisonView({
  records,
  selectedRowByRunId = {},
  onClear,
  onRemove,
  onExport,
  onGoToHistory,
  embedded = false,
}: ComparisonViewProps) {
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set());
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isChartFilterOpen, setIsChartFilterOpen] = useState(false);

  const columns = useMemo(
    () =>
      records.map((record) =>
        toComparisonColumn(record, selectedRowByRunId[record.id] ?? 0),
      ),
    [records, selectedRowByRunId],
  );
  // Every field the table can show — configuration rows, the six result
  // defaults, and the additional reported fields — so the filter can toggle any
  // of them, not just the extras.
  const allFields = useMemo(() => comparisonFieldDefinitions(columns), [columns]);
  const defaultKeys = useMemo(
    () => new Set<string>(DEFAULT_FIELD_DEFINITIONS.map((def) => def.key)),
    [],
  );
  const visibleFieldCount = allFields.filter((field) => !hiddenKeys.has(field.key)).length;
  const failedCount = columns.filter((col) => col.failed).length;
  const filterNote = `Choose which of the ${allFields.length} field${
    allFields.length === 1 ? "" : "s"
  } appear in the table and the per-metric bars.`;
  // The sidebar and tab nav reach this surface directly, and are deliberately NOT
  // blocked — navigation should not dead-end. So the below-threshold explanation
  // has to live here too, not only behind the Compare Selected button.
  const thresholdNotice = compareSelectionWarning(records.length);

  const toggleField = (key: string) =>
    setHiddenKeys((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const showAll = () => setHiddenKeys(new Set());
  const showDefaultsOnly = () =>
    setHiddenKeys(
      new Set(allFields.map((field) => field.key).filter((key) => !defaultKeys.has(key))),
    );

  return (
    <section
      className="comparison-view"
      {...(embedded ? { "aria-label": "Comparison" } : { "aria-labelledby": "comparison-title" })}
    >
      {embedded ? null : (
        <div className="panel-header">
          <div>
            <h2 id="comparison-title">Comparison</h2>
            <p>
              {records.length === 0
                ? "Select runs from History to compare them side by side."
                : `Comparing ${records.length} selected run${records.length === 1 ? "" : "s"}.`}
            </p>
          </div>
        </div>
      )}

      {records.length === 0 ? (
        <div className="empty-state" role="status">
          <div className="empty-icon" aria-hidden="true">
            <BarsGlyph />
          </div>
          <h1>Select at least 2 runs to compare</h1>
          <p className="muted">
            Go to Run History, check the runs you want to compare, then choose Compare Selected.
          </p>
          {onGoToHistory ? (
            <button type="button" className="run-button empty-state__cta" onClick={onGoToHistory}>
              Go to Run History
            </button>
          ) : null}
        </div>
      ) : (
        <>
          {/* Hierarchy: what is being compared → the numbers → the charts. */}
          <div className="comparison-summary">
            <div className="comparison-summary__header">
              <p
                className="comparison-summary__line"
                role="status"
                aria-label="Comparison summary"
              >
                <strong>
                  Comparing {columns.length} run{columns.length === 1 ? "" : "s"}
                </strong>
                {failedCount > 0 ? (
                  <span className="comparison-summary__failed">
                    {" · "}
                    {failedCount} failed
                  </span>
                ) : null}
                <span className="muted">
                  {" · "}
                  {visibleFieldCount} field{visibleFieldCount === 1 ? "" : "s"} shown
                </span>
              </p>
              <div className="comparison-actions">
                <button
                  type="button"
                  onClick={() => onExport(hiddenKeys)}
                  disabled={records.length === 0}
                >
                  Export comparison
                </button>
                <button type="button" onClick={onClear} disabled={records.length === 0}>
                  Clear selection
                </button>
              </div>
            </div>
            {thresholdNotice ? (
              <p
                className="compare-warning"
                role="status"
                aria-label="Below the comparison threshold"
              >
                {thresholdNotice}
              </p>
            ) : null}
            <div className="comparison-chips" aria-label="Selected runs">
              {columns.map((col) => (
                <span
                  key={col.id}
                  className={`comparison-chip${col.failed ? " comparison-chip--failed" : ""}`}
                >
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
          </div>

          <section className="panel panel--card">
            <div className="panel-header">
              <div>
                <h3>Comparison table</h3>
                <p>One column per run, one row per result field.</p>
              </div>
              {allFields.length > 0 ? (
                <button
                  type="button"
                  className="filter-toggle"
                  aria-expanded={isFilterOpen}
                  aria-controls="comparison-field-filter"
                  onClick={() => setIsFilterOpen((open) => !open)}
                >
                  Filter fields ({visibleFieldCount}/{allFields.length} shown)
                  <span aria-hidden="true">{isFilterOpen ? "▲" : "▼"}</span>
                </button>
              ) : null}
            </div>
            {isFilterOpen && allFields.length > 0 ? (
              <FieldFilter
                id="comparison-field-filter"
                fields={allFields}
                hiddenKeys={hiddenKeys}
                onToggle={toggleField}
                onShowAll={showAll}
                onShowDefaultsOnly={showDefaultsOnly}
                note={filterNote}
              />
            ) : null}
            <ComparisonTable columns={columns} hiddenKeys={hiddenKeys} />
          </section>

          <section className="panel panel--card">
            <div className="panel-header">
              <div>
                <h3>Pareto frontiers</h3>
                <p>
                  Each run's whole frontier as its own curve — where two curves cross is
                  where the better architecture changes. The table above is the text
                  equivalent.
                </p>
              </div>
            </div>
            <FrontierCurves columns={columns} />
          </section>

          <section className="panel panel--card">
            <div className="panel-header">
              <div>
                <h3>Per-metric bars</h3>
                <p>
                  One bar per numeric field shown in the table above — filtering there or
                  here adds and removes the matching chart.
                </p>
              </div>
              {allFields.length > 0 ? (
                <button
                  type="button"
                  className="filter-toggle"
                  aria-expanded={isChartFilterOpen}
                  aria-controls="comparison-chart-field-filter"
                  onClick={() => setIsChartFilterOpen((open) => !open)}
                >
                  Filter metrics ({visibleFieldCount}/{allFields.length} shown)
                  <span aria-hidden="true">{isChartFilterOpen ? "▲" : "▼"}</span>
                </button>
              ) : null}
            </div>
            {isChartFilterOpen && allFields.length > 0 ? (
              <FieldFilter
                id="comparison-chart-field-filter"
                fields={allFields}
                hiddenKeys={hiddenKeys}
                onToggle={toggleField}
                onShowAll={showAll}
                onShowDefaultsOnly={showDefaultsOnly}
                note={filterNote}
              />
            ) : null}
            <ComparisonCharts columns={columns} hiddenKeys={hiddenKeys} />
          </section>
        </>
      )}
    </section>
  );
}

/** Bar-chart glyph for the empty comparison state. */
function BarsGlyph(): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width="40"
      height="40"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M6 20v-6M12 20V6M18 20v-9" />
    </svg>
  );
}
