import type { FieldMetric, FrontierRow, RunRecord } from "../../shared/types";
import { parseTraceTransform } from "../../shared/traceTransform";
import { formatMetric } from "../results/formatMetric";
import { DEFAULT_FIELD_DEFINITIONS, getAdditionalFieldDefinitions } from "../results/resultFields";
import {
  T_COUNT_PER_ROTATION_LABEL,
  TOTAL_FAULT_TOLERANT_EXECUTION_ERROR_LABEL,
} from "../constants/labels";
import {
  ARCHITECTURE_LABELS,
  factorySetLabel,
  QEC_LABELS,
  applicationLabel,
} from "./historyLabels";
import { CopyButton } from "../CopyButton";
import { csvDocument, csvHeader, csvValue } from "../csv";
import { exportedOnLine, useExportedAt } from "../exportProvenance";
import { downloadCsv, downloadMarkdown } from "../download";
import { markdownRow } from "../markdown";
import { Modal } from "../Modal";

/**
 * One run, exported: the Markdown document, the CSV of its frontier, and the
 * dialog that offers both.
 *
 * There used to be a `mode` prop here selecting between this and a week-3
 * placeholder, defaulting to the placeholder — so the shipped behaviour was the
 * one call site that opted out, and everything else (including this surface's
 * own tests) got the stub. The placeholder is gone; there is one exporter.
 */
export interface ExportDialogProps {
  record: RunRecord;
  onClose: () => void;
}

/** A provenance line and the blank after it, or nothing at all. */
function withBlankLine(line: string | null): string[] {
  return line === null ? [] : [line, ""];
}

/** The recorded T count, or an honest blank when the record does not carry one. */
function configuredTCount(transform: unknown): string {
  const parsed = parseTraceTransform(transform);
  return parsed.ok ? String(parsed.transform.tStatesPerRotation) : "Not recorded";
}

export function buildRunExportMarkdown(record: RunRecord, exportedAt?: string): string {
  const { config, result } = record;
  const lines = [
    `# ${config.name}`,
    "",
    // The record's own key. It equals `config.id` and so does survive inside
    // the configuration JSON below, but an export is read by a person before it
    // is parsed, and the one field that ties this document back to a stored run
    // should not be reachable only by scrolling into a JSON block.
    `- **Run ID:** ${record.id}`,
    `- **Status:** ${result.status}`,
    `- **Application:** ${applicationLabel(config)}`,
    `- **Architecture:** ${ARCHITECTURE_LABELS[config.architecture.type] ?? config.architecture.type}`,
    `- **QEC code:** ${QEC_LABELS[config.qecCode] ?? config.qecCode}`,
    `- **Magic-state ${config.magicStateFactories.length > 1 ? "factories" : "factory"}:** ${factorySetLabel(config)}`,
    `- **${TOTAL_FAULT_TOLERANT_EXECUTION_ERROR_LABEL}:** ${config.maxError}`,
    // Strict parse, not the lenient one: `normalizeTraceTransform` repairs an
    // unreadable transform to the pipeline defaults, and an export is exactly
    // where a repaired 20 would be read as a recorded fact about the run. Same
    // rule the comparison table's configuration row follows.
    `- **${T_COUNT_PER_ROTATION_LABEL}:** ${configuredTCount(config.traceTransform)}`,
    `- **QRE version:** ${result.qreVersion}`,
    `- **Created:** ${config.createdAt}`,
    // Started/completed bracket the engine call, so the two together are the
    // run's wall-clock cost; `savedAt` is when the record was persisted. None
    // of the three is recoverable from the configuration JSON below — they live
    // on the result and the record — and all three were dropped when the
    // placeholder exporter was replaced.
    `- **Started:** ${result.startedAt}`,
    `- **Completed:** ${result.completedAt}`,
    `- **Saved:** ${record.savedAt}`,
    // The contract version these fields were read under. Two bumps in six
    // weeks, and an export read a year from now has no other way to say which
    // shape it was written against.
    `- **Schema version:** ${record.schemaVersion}`,
    "",
    ...withBlankLine(exportedOnLine(exportedAt)),
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
      markdownRow(headers),
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
        return markdownRow(cells);
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

/**
 * The unit a field is reported in, from the first row that reports it.
 *
 * Per-row rather than from `ResultFieldDefinition`, whose `unitLabel` is a
 * display category ("time") and not the unit the number is actually in ("ns").
 * A CSV column headed "time" would leave the reader to guess the scale.
 */
function unitOf(
  rows: readonly FrontierRow[],
  read: (row: FrontierRow) => FieldMetric | null | undefined,
): string {
  for (const row of rows) {
    const metric = read(row);
    if (metric && metric.unit.length > 0) return metric.unit;
  }
  return "";
}

/**
 * The Pareto frontier as CSV — the same table the Markdown export renders, in
 * the form you can actually plot or pivot.
 *
 * Columns come from the same two sources the Markdown table uses, in the same
 * order: the six defaults, then whatever `additional` fields this run reported.
 * A run that produced no frontier yields the header alone, which is an honest
 * empty table rather than an empty file.
 */
export function buildFrontierCsv(record: RunRecord): string {
  const frontier = record.result.frontier ?? [];
  const additional = getAdditionalFieldDefinitions(frontier);

  const defaults = DEFAULT_FIELD_DEFINITIONS.map((def) => ({
    label: def.label,
    read: (row: FrontierRow) => row[def.key as keyof FrontierRow] as FieldMetric | undefined,
  }));
  const extras = additional.map((def) => ({
    label: def.label,
    read: (row: FrontierRow) => row.additional?.[def.key],
  }));
  const columns = [...defaults, ...extras];

  return csvDocument([
    ["#", ...columns.map((column) => csvHeader(column.label, unitOf(frontier, column.read)))],
    ...frontier.map((row, index) => [
      String(index + 1),
      ...columns.map((column) => csvValue(column.read(row))),
    ]),
  ]);
}

export function ExportDialog({ record, onClose }: ExportDialogProps) {
  const exportedAt = useExportedAt();
  const preview = buildRunExportMarkdown(record, exportedAt);

  return (
    <Modal
      titleId="export-dialog-title"
      title="Export run"
      onClose={onClose}
      footer={
        <>
          <CopyButton value={preview} label="Copy Markdown" />
          <button
            type="button"
            onClick={() =>
              downloadMarkdown(preview, record.config.name, {
                fallback: "qre-run",
                exportedAt,
              })
            }
          >
            Download .md
          </button>
          <button
            type="button"
            onClick={() =>
              downloadCsv(buildFrontierCsv(record), record.config.name, {
                fallback: "qre-run",
                exportedAt,
              })
            }
          >
            Download .csv
          </button>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      <p className="muted">
        Includes the run metadata, Pareto frontier, complete configuration, and
        raw engine output. The CSV is the frontier alone, with raw numeric
        values for plotting.
      </p>
      <pre className="code-block" aria-label="Export preview">
        {preview}
      </pre>
    </Modal>
  );
}
