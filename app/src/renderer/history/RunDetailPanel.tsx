import type { RunRecord } from "../../shared/types";
import { ResultsArea } from "../results/ResultsArea";

/**
 * View Details — a saved run rendered exactly like a fresh one by reusing Team
 * 2's `ResultsArea` (which itself renders `ConfigSummary`). A saved *failed*
 * run flows through the same component's failure branch. This is master-detail:
 * the container swaps this in for the list while a record is selected.
 *
 * Pure: it knows the `RunRecord` shape and reuses Results components; it holds
 * no store knowledge and raises per-run actions back to the container.
 */
export interface RunDetailPanelProps {
  record: RunRecord;
  onClose: () => void;
  onRerun: (record: RunRecord) => void;
  onExport: (record: RunRecord) => void;
  onDelete: (id: string) => void;
  selectedIndex: number;
  onSelectedIndexChange: (index: number) => void;
}

export function RunDetailPanel({
  record,
  onClose,
  onRerun,
  onExport,
  onDelete,
  selectedIndex,
  onSelectedIndexChange,
}: RunDetailPanelProps) {
  return (
    <section className="run-detail" aria-labelledby="run-detail-title">
      <div className="detail-toolbar">
        <button type="button" className="back-button" onClick={onClose}>
          ← Back to history
        </button>
        <div className="detail-actions">
          <button type="button" onClick={() => onRerun(record)}>
            Rerun
          </button>
          <button type="button" onClick={() => onExport(record)}>
            Export
          </button>
          <button type="button" className="danger" onClick={() => onDelete(record.id)}>
            Delete
          </button>
        </div>
      </div>
      <h1 id="run-detail-title" className="sr-only">
        Details for {record.config.name}
      </h1>
      <ResultsArea
        result={record.result}
        phase="done"
        config={record.config}
        selectedIndex={selectedIndex}
        onSelectedIndexChange={onSelectedIndexChange}
      />
    </section>
  );
}
