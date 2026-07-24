import { useState } from "react";

import { applicationKey, type RunRecord } from "../../shared/types";
import { formatMetric } from "../results/formatMetric";
import {
  ARCHITECTURE_LABELS,
  FACTORY_LABELS,
  QEC_LABELS,
  applicationLabel,
} from "./historyLabels";
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
  mode?: "preview" | "complete";
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

function markdownCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

export function buildRunExportMarkdown(record: RunRecord): string {
  const { config, result } = record;
  const lines = [
    `# ${config.name}`,
    "",
    `- **Status:** ${result.status}`,
    `- **Application:** ${applicationLabel(config)}`,
    `- **Architecture:** ${ARCHITECTURE_LABELS[config.architecture.type] ?? config.architecture.type}`,
    `- **QEC code:** ${QEC_LABELS[config.qecCode] ?? config.qecCode}`,
    `- **Magic-state factory:** ${FACTORY_LABELS[config.magicStateFactory] ?? config.magicStateFactory}`,
    `- **QRE version:** ${result.qreVersion}`,
    `- **Created:** ${config.createdAt}`,
    `- **Completed:** ${result.completedAt}`,
    "",
  ];

  if (result.status === "failed") {
    lines.push(
      "## Failure",
      "",
      `- **Code:** ${result.error?.code ?? "UNKNOWN_ERROR"}`,
      `- **Message:** ${result.error?.message ?? "No diagnostic message was returned."}`,
      "",
    );
  } else {
    lines.push(
      "## Pareto frontier",
      "",
      "| # | Physical qubits | Runtime | Total error | Factories | Code distance | Logical cycle time |",
      "|---:|---:|---:|---:|---:|---:|---:|",
      ...(result.frontier ?? []).map((row, index) =>
        [
          `| ${index + 1}`,
          markdownCell(formatMetric(row.physicalQubits)),
          markdownCell(formatMetric(row.runtime)),
          markdownCell(formatMetric(row.totalError)),
          markdownCell(formatMetric(row.factories)),
          markdownCell(formatMetric(row.codeDistance)),
          `${markdownCell(formatMetric(row.logicalCycleTime))} |`,
        ].join(" | "),
      ),
      "",
    );
  }

  lines.push(
    "## Configuration",
    "",
    "```json",
    JSON.stringify(config, null, 2),
    "```",
    "",
    "## Raw engine output",
    "",
    "```json",
    JSON.stringify(result.raw, null, 2),
    "```",
  );

  return lines.join("\n");
}

function downloadMarkdown(contents: string, name: string): void {
  const blob = new Blob([contents], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "qre-run"}.md`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ExportStubDialog({
  record,
  onClose,
  mode = "preview",
}: ExportStubDialogProps) {
  const complete = mode === "complete";
  const preview = complete
    ? buildRunExportMarkdown(record)
    : buildExportStub(record);
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
      title={complete ? "Export run as Markdown" : "Export Markdown (preview)"}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onCopy}>
            {copied ? "Copied" : complete ? "Copy Markdown" : "Copy preview"}
          </button>
          {complete ? (
            <button
              type="button"
              onClick={() => downloadMarkdown(preview, record.config.name)}
            >
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
          Includes the run metadata, Pareto frontier, complete configuration, and
          raw engine output.
        </p>
      ) : (
        <p className="muted">
          This is a placeholder preview. The real Markdown export — the full configuration, results,
          and raw output — is built in Part 3 (week 6).
        </p>
      )}
      <pre className="code-block" aria-label="Export preview">
        {preview}
      </pre>
    </Modal>
  );
}
