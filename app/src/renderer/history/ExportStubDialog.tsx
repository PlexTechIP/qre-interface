import { useState } from "react";

import { applicationKey, type RunRecord } from "../../shared/types";
import { Modal } from "./Modal";

/**
 * Export Markdown — STUB ONLY. The real Markdown generator ships in Part 3
 * (week 6); this builds the *seam*: the per-run affordance plus a
 * placeholder/preview the user can copy. Nothing here is the real exporter —
 * the preview is a deliberately minimal header, not the frontier table.
 */
export interface ExportStubDialogProps {
  record: RunRecord;
  onClose: () => void;
}

/** A placeholder preview payload — NOT the Part-3 exporter output. */
export function buildExportStub(record: RunRecord): string {
  const { config, result } = record;
  return [
    `# ${config.name}`,
    "",
    "> Export preview — placeholder. The Markdown generator ships in Part 3 (week 6).",
    "",
    `- Run ID: ${record.id}`,
    `- Application: ${applicationKey(config)}`,
    `- Architecture: ${config.architecture.type}`,
    `- QEC code: ${config.qecCode}`,
    `- Magic state factory: ${config.magicStateFactory}`,
    `- QRE version: ${result.qreVersion}`,
    `- Created: ${config.createdAt}`,
    `- Saved: ${record.savedAt}`,
    `- Status: ${result.status}`,
  ].join("\n");
}

export function ExportStubDialog({ record, onClose }: ExportStubDialogProps) {
  const preview = buildExportStub(record);
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
      titleId="export-stub-title"
      title="Export Markdown (preview)"
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
        This is a placeholder preview. The real Markdown export — the full configuration, results,
        and raw output — is built in Part 3 (week 6).
      </p>
      <pre className="code-block" aria-label="Export preview">
        {preview}
      </pre>
    </Modal>
  );
}
