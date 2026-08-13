import { Modal } from "../Modal";

interface BulkDeleteConfirmDialogProps {
  count: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export function BulkDeleteConfirmDialog({
  count,
  onConfirm,
  onCancel,
}: BulkDeleteConfirmDialogProps) {
  const runLabel = `${count} run${count === 1 ? "" : "s"}`;

  return (
    <Modal
      titleId="bulk-delete-confirm-title"
      title={`Delete ${runLabel}?`}
      onClose={onCancel}
      className="modal-narrow"
      footer={
        <>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="danger" onClick={onConfirm}>
            Delete {runLabel}
          </button>
        </>
      }
    >
      <p>
        This permanently removes the selected {runLabel} from history. This cannot be undone.
      </p>
    </Modal>
  );
}
