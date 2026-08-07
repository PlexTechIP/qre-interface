import { Modal } from "./Modal";
import type { RerunRequest } from "./rerun";

/**
 * Rerun — the affordance + the seam, not the wiring. `reconstructConfig`
 * (PROVIDED in contracts) has already produced a pre-fill `RunConfig` with a
 * fresh id + createdAt; this surfaces that payload so the reconstruction is
 * demonstrable against mock records. Loading it into the live Run Configuration
 * form is week-4 integration.
 */
export interface RerunDialogProps {
  request: RerunRequest;
  onClose: () => void;
}

export function RerunDialog({ request, onClose }: RerunDialogProps) {
  return (
    <Modal
      titleId="rerun-title"
      title="Rerun — reconstructed configuration"
      onClose={onClose}
      footer={
        <button type="button" onClick={onClose}>
          Close
        </button>
      }
    >
      <p className="muted">
        Pre-fill configuration reconstructed from <strong>{request.sourceRecord.config.name}</strong>,
        with a fresh run id and timestamp. Loading it into the Run Configuration form is week-4
        integration.
      </p>
      <pre className="code-block" aria-label="Reconstructed configuration">
        {JSON.stringify(request.config, null, 2)}
      </pre>
    </Modal>
  );
}
