import type { RunRecord } from "../../shared/types";
import { formatMetric } from "../results/formatMetric";
import {
  resolveSelectedFrontierRow,
  type SelectedRowByRunId,
} from "../results/selectedRows";
import {
  ARCHITECTURE_LABELS,
  factorySetLabel,
  QEC_LABELS,
  applicationLabel,
} from "./historyLabels";

/**
 * The Run History list — a PURE function of records + selection + callbacks.
 *
 * It knows the RunRecord shape and nothing about how records are stored: no
 * store import, no fetching, no engine. Every displayed value is DERIVED from
 * `config`/`result` (the record never duplicates them), and every result metric
 * comes from the run's session-selected representative frontier row (defaulting
 * to row 1; RunRecord remains immutable). All human-facing values route through
 * Team 2's `formatMetric`.
 *
 * A SINGLE row selection feeds both actions: the checked runs are what "Compare
 * Selected" and "Delete Selected" operate on. This component only RENDERS and
 * RAISES events. The container owns the store, the confirm step for Delete, the
 * too-small-selection popups, and the Rerun/Export handling.
 */

export interface RunHistoryListProps {
  records: RunRecord[];
  selectedId: string | null;
  /** The unified selection: run ids checked for Compare / Delete. */
  selectedIds: string[];
  /** Present-and-selected count, used for the Compare Selected button badge. */
  selectedCount: number;
  selectedRowByRunId: SelectedRowByRunId;
  /** True when any search/filter is active — distinguishes "no matches" from "no runs yet". */
  hasActiveFilter: boolean;
  onViewDetails: (id: string) => void;
  onRerun: (record: RunRecord) => void;
  onDelete: (id: string) => void;
  onExport: (record: RunRecord) => void;
  onToggleSelection: (id: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onCompareSelected: () => void;
  onDeleteSelected: () => void;
  /** Navigate to Run Configuration from the empty state. Optional. */
  onNavigateToConfig?: () => void;
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  // Compact numeric date (xx/xx/xx) + time keeps the column narrow.
  const datePart = date.toLocaleDateString(undefined, {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  });
  const timePart = date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${datePart} ${timePart}`;
}

export function RunHistoryList({
  records,
  selectedId,
  selectedIds,
  selectedCount,
  selectedRowByRunId,
  hasActiveFilter,
  onViewDetails,
  onRerun,
  onDelete,
  onExport,
  onToggleSelection,
  onSelectAll,
  onClearSelection,
  onCompareSelected,
  onDeleteSelected,
  onNavigateToConfig,
}: RunHistoryListProps) {
  const selectedSet = new Set(selectedIds);

  return (
    <section className="panel history-panel" aria-labelledby="history-list-title">
      <div className="panel-header">
        <div>
          <h2 id="history-list-title">Completed Runs</h2>
          <p>Select a run to open details; check two or more to compare or delete.</p>
        </div>
        <div className="history-panel__summary">
          <span className="muted">
            {records.length} run{records.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      {records.length > 0 ? (
        <div className="history-actions" role="group" aria-label="Selection actions">
          <div className="history-actions__group">
            <button type="button" onClick={onSelectAll}>
              Select all
            </button>
            <button type="button" onClick={onClearSelection}>
              Clear selection
            </button>
          </div>
          <div className="history-actions__group">
            <button type="button" onClick={onCompareSelected}>
              Compare Selected{selectedCount > 0 ? ` (${selectedCount})` : ""}
            </button>
            <button type="button" className="danger" onClick={onDeleteSelected}>
              Delete Selected
            </button>
          </div>
        </div>
      ) : null}

      {records.length === 0 ? (
        <EmptyState
          hasActiveFilter={hasActiveFilter}
          {...(onNavigateToConfig ? { onNavigateToConfig } : {})}
        />
      ) : (
        <div className="history-table-scroll">
          <table className="history-table">
            <thead>
              <tr>
                <th scope="col" className="col-compare">
                  <span className="sr-only">Select</span>
                </th>
                <th scope="col">Run Name</th>
                <th scope="col">Configuration</th>
                <th scope="col">Date / Time</th>
                <th scope="col">Version</th>
                <th scope="col" className="num">Qubits</th>
                <th scope="col" className="num">Runtime</th>
                <th scope="col" className="num">Cycle Time</th>
                <th scope="col" className="num">Factories</th>
                <th scope="col" className="num">Total Error</th>
                <th scope="col" className="num">Code Dist.</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => {
                const { config, result } = record;
                // Representative frontier row for this run. Session selections
                // never mutate the saved record; missing/stale indices fall back
                // to row 1, and failed runs remain rowless.
                const { row } = resolveSelectedFrontierRow(
                  result,
                  selectedRowByRunId[record.id] ?? 0,
                );
                const isOpen = record.id === selectedId;
                const isChecked = selectedSet.has(record.id);
                const isFailed = result.status === "failed";

                return (
                  <tr
                    key={record.id}
                    className={isOpen ? "selected" : undefined}
                    // Row click is a pointer convenience; keyboard users reach the
                    // same action via Enter/Space on the focused row and the per-row
                    // "View" button. `aria-current` marks the open row and is valid on
                    // any element — `aria-selected` is only meaningful on a grid/listbox
                    // row, which this plain table row is not.
                    aria-current={isOpen || undefined}
                    tabIndex={0}
                    onClick={() => onViewDetails(record.id)}
                    onKeyDown={(event) => {
                      // Only when the row itself is focused — inner controls (the
                      // select checkbox and the action buttons) own their own keys.
                      if (
                        event.target === event.currentTarget &&
                        (event.key === "Enter" || event.key === " ")
                      ) {
                        event.preventDefault();
                        onViewDetails(record.id);
                      }
                    }}
                  >
                    <td className="col-compare" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => onToggleSelection(record.id)}
                        aria-label={`Select ${config.name}`}
                      />
                    </td>
                    <td>
                      <span className="run-name">{config.name}</span>
                      {isFailed ? <span className="status-pill failed">Failed</span> : null}
                    </td>
                    <td>
                      <div className="config-cell">
                        <span>{applicationLabel(config)}</span>
                        <span className="muted">
                          {ARCHITECTURE_LABELS[config.architecture.type] ?? config.architecture.type}
                          {" · "}
                          {QEC_LABELS[config.qecCode] ?? config.qecCode}
                          {" · "}
                          {factorySetLabel(config)}
                        </span>
                      </div>
                    </td>
                    <td>{formatDateTime(config.createdAt)}</td>
                    {/* Authoritative engine version is result.qreVersion, NOT config.qreVersion. */}
                    <td>{result.qreVersion}</td>
                    <td className="num">{formatMetric(row?.physicalQubits)}</td>
                    <td className="num">{formatMetric(row?.runtime)}</td>
                    <td className="num">{formatMetric(row?.logicalCycleTime)}</td>
                    <td className="num">{formatMetric(row?.factories)}</td>
                    <td className="num">{formatMetric(row?.totalError)}</td>
                    <td className="num">{formatMetric(row?.codeDistance)}</td>
                    <td className="col-actions" onClick={(e) => e.stopPropagation()}>
                      <div className="row-actions">
                        <button type="button" onClick={() => onViewDetails(record.id)}>
                          View
                        </button>
                        <button type="button" onClick={() => onRerun(record)}>
                          Rerun
                        </button>
                        <button type="button" onClick={() => onExport(record)}>
                          Export
                        </button>
                        <button
                          type="button"
                          className="danger"
                          onClick={() => onDelete(record.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function EmptyState({
  hasActiveFilter,
  onNavigateToConfig,
}: {
  hasActiveFilter: boolean;
  onNavigateToConfig?: () => void;
}) {
  if (hasActiveFilter) {
    return (
      <div className="empty-state empty-state--inline" role="status">
        <p>No runs match your search and filters.</p>
        <p className="muted">Clear or adjust the filters to see more runs.</p>
      </div>
    );
  }
  return (
    <div className="empty-state empty-state--inline" role="status">
      <p className="muted">
        No runs found.{" "}
        {onNavigateToConfig ? (
          <button type="button" className="link-button" onClick={onNavigateToConfig}>
            Run a configuration
          </button>
        ) : (
          "Run a configuration"
        )}{" "}
        to see results here.
      </p>
    </div>
  );
}
