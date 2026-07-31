import { useMemo, useState } from "react";

import type { RunRecord } from "../../shared/types";
import { FieldFilter } from "../results/FieldFilter";
import type { SelectedRowByRunId } from "../results/selectedRows";
import { ComparisonCharts } from "./ComparisonCharts";
import { ComparisonTable } from "./ComparisonTable";
import { ParetoCurves } from "./ParetoCurves";
import {
  additionalFieldDefinitions,
  belowThresholdMessage,
  MIN_COMPARISON_RUNS,
  toComparisonColumn,
} from "./comparisonModel";

/**
 * The Comparison surface — a PURE function of a selected set of `RunRecord`s plus
 * callbacks. No store, no engine (grep-provable): it reads the same records the
 * History list already renders. It owns only the local field-filter view state
 * (which additional rows show), reusing Team 2's `FieldFilter` + `formatMetric`.
 *
 * States: an empty "pick runs to compare" prompt, a single-run selection (which
 * renders, but says it is below the two-run threshold), and a many-run selection
 * all render cleanly against the mock records.
 *
 * Three views of the same selection, in order: the table (one column per run,
 * one row per field), the Pareto frontier curves (every run's FULL frontier),
 * and the per-metric bars (one representative row per run).
 */
export interface ComparisonViewProps {
  records: RunRecord[];
  selectedRowByRunId?: SelectedRowByRunId;
  onClear: () => void;
  onRemove: (id: string) => void;
  /** Opens the comparison-set export stub (the real exporter is Part 3). */
  onExport: () => void;
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

  const columns = useMemo(
    () =>
      records.map((record) =>
        toComparisonColumn(record, selectedRowByRunId[record.id] ?? 0),
      ),
    [records, selectedRowByRunId],
  );
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
    <section
      className="comparison-view"
      {...(embedded ? { "aria-label": "Comparison" } : { "aria-labelledby": "comparison-title" })}
    >
      <div className={`panel-header${embedded ? " panel-header--actions-only" : ""}`}>
        {embedded ? null : (
          <div>
            <h2 id="comparison-title">Comparison</h2>
            <p>
              {records.length === 0
                ? "Select runs from History to compare them side by side."
                : `Comparing ${records.length} selected run${records.length === 1 ? "" : "s"}.`}
            </p>
          </div>
        )}
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
          {/*
            Below the threshold the surface still renders — a one-column view is
            more useful than a blank page — but it says plainly that this is not
            yet a comparison. Reaching Comparison with one run selected must
            never look like a finished comparison of one.
          */}
          {records.length < MIN_COMPARISON_RUNS ? (
            <div className="comparison-notice" role="alert">
              <p>{belowThresholdMessage(records.length)}</p>
              {onGoToHistory ? (
                <button type="button" className="surface-action" onClick={onGoToHistory}>
                  Go to Run History
                </button>
              ) : null}
            </div>
          ) : null}

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
                <h3>Pareto frontiers</h3>
                <p>
                  Every selected run's full frontier as its own curve — physical
                  qubits against runtime. The table above shows only each run's
                  representative row.
                </p>
              </div>
            </div>
            <ParetoCurves records={records} selectedRowByRunId={selectedRowByRunId} />
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
