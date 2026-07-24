import { useState } from "react";

import type { RunRecord } from "../../shared/types";
import { Modal } from "./Modal";
import { buildComparisonExportStub } from "./comparisonModel";

/**
 * Export the comparison set — STUB ONLY. Mirrors the per-run Export stub: it
 * builds the seam (a copyable placeholder preview of the selected runs) but not
 * the real Markdown exporter, which ships in Part 3 (week 6).
 */
export interface ComparisonExportStubDialogProps {
  records: RunRecord[];
  onClose: () => void;
}

export function ComparisonExportStubDialog({ records, onClose }: ComparisonExportStubDialogProps) {
  const preview = buildComparisonExportStub(records);
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard?.writeText(preview);
      setCopied(true);
    } catch {
      // Clipboard may be unavailable (e.g. no permission); leave the label as-is.
    }
  };

  return (
    <Modal
      titleId="comparison-export-title"
      title="Export comparison (preview)"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onCopy}>
            {copied ? "Copied" : "Copy preview"}
          </button>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      <p className="muted">
        This is a placeholder preview of the comparison export. The real Markdown export — the selected
        runs&rsquo; configs, timestamps, QRE versions, and the full comparison table — is built in Part 3
        (week 6).
      </p>
      <pre className="code-block" aria-label="Comparison export preview">
        {preview}
      </pre>
    </Modal>
  );
}
