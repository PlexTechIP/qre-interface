import type { RunRecord } from "../../shared/types";
import { formatMetric } from "../results/formatMetric";
import {
  ARCHITECTURE_LABELS,
  FACTORY_LABELS,
  QEC_LABELS,
  applicationLabel,
} from "./historyLabels";
 
/**
 * The Run History list — a PURE function of records + selection + callbacks.
 *
 * It knows the RunRecord shape and nothing about how records are stored: no
 * store import, no fetching, no engine. Every displayed value is DERIVED from
 * `config`/`result` (the record never duplicates them), and every result metric
 * comes from the run's representative frontier row (row 0 — RunRecord does not
 * persist a selected row; noted for review). All human-facing values route
 * through Team 2's `formatMetric`.
 *
 * This component only RENDERS and RAISES events. The container owns the store,
 * the confirm step for Delete, and the Rerun/Export handling.
 */
 
export interface RunHistoryListProps {
  records: RunRecord[];
  selectedId: string | null;
  comparisonIds: string[];
  /** True when any search/filter is active — distinguishes "no matches" from "no runs yet". */
  hasActiveFilter: boolean;
  onViewDetails: (id: string) => void;
  onRerun: (record: RunRecord) => void;
  onDelete: (id: string) => void;
  onExport: (record: RunRecord) => void;
  onToggleComparison: (id: string) => void;
}
 
function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
 
export function RunHistoryList({
  records,
  selectedId,
  comparisonIds,
  hasActiveFilter,
  onViewDetails,
  onRerun,
  onDelete,
  onExport,
  onToggleComparison,
}: RunHistoryListProps) {
  const comparisonSet = new Set(comparisonIds);
 
  return (
    <section className="panel history-panel" aria-labelledby="history-list-title">
      <div className="panel-header">
        <div>
          <h2 id="history-list-title">Completed Runs</h2>
          <p>Selected row opens in Details; check runs to compare.</p>
        </div>
        <span className="muted">
          {records.length} run{records.length === 1 ? "" : "s"}
        </span>
      </div>
 
      {records.length === 0 ? (
        <EmptyState hasActiveFilter={hasActiveFilter} />
      ) : (
        <div className="history-table-scroll">
          <table className="history-table">
            <thead>
              <tr>
                <th scope="col" className="col-compare">
                  <span className="sr-only">Select for comparison</span>
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
                // Representative frontier row for this run. null on a failed run
                // (frontier is null) — metric cells fall back to formatMetric's "—".
                const row = result.frontier?.[0] ?? null;
                const isSelected = record.id === selectedId;
                const isChecked = comparisonSet.has(record.id);
                const isFailed = result.status === "failed";
 
                return (
                  <tr
                    key={record.id}
                    className={isSelected ? "selected" : undefined}
                    // Row click is a pointer convenience; keyboard users reach the
                    // same action via Enter/Space on the focused row and the per-row
                    // "View" button. `aria-current` marks the open row and is valid on
                    // any element — `aria-selected` is only meaningful on a grid/listbox
                    // row, which this plain table row is not.
                    aria-current={isSelected || undefined}
                    tabIndex={0}
                    onClick={() => onViewDetails(record.id)}
                    onKeyDown={(event) => {
                      // Only when the row itself is focused — inner controls (the
                      // compare checkbox and the action buttons) own their own keys.
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
                        onChange={() => onToggleComparison(record.id)}
                        aria-label={`Compare ${config.name}`}
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
                          {FACTORY_LABELS[config.magicStateFactory] ?? config.magicStateFactory}
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
 
function EmptyState({ hasActiveFilter }: { hasActiveFilter: boolean }) {
  if (hasActiveFilter) {
    return (
      <div className="empty-state" role="status">
        <p>No runs match your search and filters.</p>
        <p className="muted">Clear or adjust the filters to see more runs.</p>
      </div>
    );
  }
  return (
    <div className="empty-state" role="status">
      <p>No saved runs yet.</p>
      <p className="muted">Run a configuration to see it appear here.</p>
    </div>
  );
}