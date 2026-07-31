import { useState } from "react";

import { applicationKey, type RunRecord } from "../../shared/types";
import { formatMetric } from "../results/formatMetric";
import { getAdditionalFieldDefinitions } from "../results/resultFields";
import {
  ARCHITECTURE_LABELS,
  factorySetLabel,
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
    `- Magic state factories: ${config.magicStateFactories.join(", ")}`,
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
    `- **Magic-state ${config.magicStateFactories.length > 1 ? "factories" : "factory"}:** ${factorySetLabel(config)}`,
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
    const frontier = result.frontier ?? [];
    // A typical run reports ~10–15 of the 37 possible fields; the six defaults are
    // only the head of that. Everything else lives in `frontier[].additional` and
    // used to be dropped from the export. Same derivation the UI uses, so the
    // exported table and the on-screen one agree on which columns exist.
    const additional = getAdditionalFieldDefinitions(frontier);
    const headers = [
      "#",
      "Physical qubits",
      "Runtime",
      "Total error",
      "Factories",
      "Code distance",
      "Logical cycle time",
      ...additional.map((def) => def.label),
    ];

    lines.push(
      "## Pareto frontier",
      "",
      `| ${headers.map(markdownCell).join(" | ")} |`,
      `|${headers.map(() => "---:").join("|")}|`,
      ...frontier.map((row, index) => {
        const cells = [
          `${index + 1}`,
          formatMetric(row.physicalQubits),
          formatMetric(row.runtime),
          formatMetric(row.totalError),
          formatMetric(row.factories),
          formatMetric(row.codeDistance),
          formatMetric(row.logicalCycleTime),
          // A field one row reports and another omits renders as formatMetric's
          // "—" rather than shifting the row's cells.
          ...additional.map((def) => formatMetric(row.additional?.[def.key] ?? null)),
        ];
        return `| ${cells.map(markdownCell).join(" | ")} |`;
      }),
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
