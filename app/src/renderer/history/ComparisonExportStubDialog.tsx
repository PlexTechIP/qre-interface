import { useState } from "react";

import type { RunRecord } from "../../shared/types";
import { formatMetric } from "../results/formatMetric";
import { Modal } from "./Modal";
import {
  buildComparisonExportStub,
  buildComparisonRows,
  toComparisonColumn,
} from "./comparisonModel";

/**
 * Export the comparison set — STUB ONLY. Mirrors the per-run Export stub: it
 * builds the seam (a copyable placeholder preview of the selected runs) but not
 * the real Markdown exporter, which ships in Part 3 (week 6).
 */
export interface ComparisonExportStubDialogProps {
  records: RunRecord[];
  onClose: () => void;
  mode?: "preview" | "complete";
}

function markdownCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

export function buildComparisonExportMarkdown(
  records: readonly RunRecord[],
): string {
  const columns = records.map(toComparisonColumn);
  const rows = buildComparisonRows(columns, new Set());
  return [
    `# QRE Run Comparison (${records.length} runs)`,
    "",
    "## Selected runs",
    "",
    ...records.map(
      (record) =>
        `- **${record.config.name}** — ${record.result.status}, QRE ${record.result.qreVersion}, created ${record.config.createdAt}`,
    ),
    "",
    "## Resource comparison",
    "",
    [
      "| Field",
      ...columns.map((column) => markdownCell(column.name)),
      "|",
    ].join(" | "),
    [
      "|---",
      ...columns.map(() => "---:"),
      "|",
    ].join(" | "),
    ...rows.map((row) =>
      [
        `| ${markdownCell(
          row.unitLabel ? `${row.label} (${row.unitLabel})` : row.label,
        )}`,
        ...row.metrics.map((metric) => markdownCell(formatMetric(metric))),
        "|",
      ].join(" | "),
    ),
  ].join("\n");
}

function downloadMarkdown(contents: string): void {
  const blob = new Blob([contents], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "qre-run-comparison.md";
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ComparisonExportStubDialog({
  records,
  onClose,
  mode = "preview",
}: ComparisonExportStubDialogProps) {
  const complete = mode === "complete";
  const preview = complete
    ? buildComparisonExportMarkdown(records)
    : buildComparisonExportStub(records);
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
      title={
        complete ? "Export comparison as Markdown" : "Export comparison (preview)"
      }
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onCopy}>
            {copied ? "Copied" : complete ? "Copy Markdown" : "Copy preview"}
          </button>
          {complete ? (
            <button type="button" onClick={() => downloadMarkdown(preview)}>
              Download .md
            </button>
          ) : null}
          <button type="button" onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      {complete ? (
        <p className="muted">
          Includes selected-run metadata and the complete side-by-side resource
          table.
        </p>
      ) : (
        <p className="muted">
          This is a placeholder preview of the comparison export. The real Markdown export — the selected
          runs&rsquo; configs, timestamps, QRE versions, and the full comparison table — is built in Part 3
          (week 6).
        </p>
      )}
      <pre className="code-block" aria-label="Comparison export preview">
        {preview}
      </pre>
    </Modal>
  );
}
