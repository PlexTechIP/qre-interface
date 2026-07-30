import type { RunRecord } from "../../shared/types";
import { Modal } from "./Modal";

/**
 * The confirm gate before a destructive Delete. The container owns the actual
 * `RunStore.delete` — this only asks. Records are immutable, so Delete is the
 * one and only removal; making it explicit is a DoD requirement.
 */
export interface DeleteConfirmDialogProps {
  record: RunRecord;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteConfirmDialog({ record, onConfirm, onCancel }: DeleteConfirmDialogProps) {
  return (
    <Modal
      titleId="delete-confirm-title"
      title="Delete run?"
      onClose={onCancel}
      className="modal-narrow"
      footer={
        <>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="danger" onClick={onConfirm}>
            Delete run
          </button>
        </>
      }
    >
      <p>
        Delete <strong>{record.config.name}</strong>? This permanently removes the saved run from
        history. Run records are immutable — this cannot be undone.
      </p>
    </Modal>
  );
}
