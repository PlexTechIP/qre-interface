import type { RunRecord } from "../../shared/types";
import { formatMetric } from "../results/formatMetric";
import type { SelectedRowByRunId } from "../results/selectedRows";
import { csvDocument, csvHeader, csvValue } from "../csv";
import { CopyButton } from "../CopyButton";
import { exportedOnLine, useExportedAt } from "../exportProvenance";
import { downloadCsv, downloadMarkdown } from "../download";
import { markdownRow } from "../markdown";
import { Modal } from "../Modal";
import {
  buildComparisonRows,
  type ComparisonRow,
  toComparisonColumn,
} from "./comparisonModel";

/**
 * The selected runs, exported: the side-by-side Markdown table, the CSV, and
 * the dialog that offers both. Mirrors the per-run `ExportDialog`, including
 * having lost the `mode` prop that used to default to a week-3 placeholder.
 */
export interface ComparisonExportDialogProps {
  records: RunRecord[];
  selectedRowByRunId?: SelectedRowByRunId;
  /** The fields hidden by the comparison surface's filter when Export was pressed. */
  hiddenKeys?: ReadonlySet<string>;
  onClose: () => void;
}

export function buildComparisonExportMarkdown(
  records: readonly RunRecord[],
  selectedRowByRunId: SelectedRowByRunId = {},
  /**
   * The fields the analyst hid on screen, so the export is the comparison they
   * built rather than every field the runs happen to report. Defaults to
   * hiding nothing, which is what a caller with no filter state means.
   */
  hiddenKeys: ReadonlySet<string> = new Set(),
  /** When this export was produced (ISO 8601); omitted, the document is undated. */
  exportedAt?: string,
): string {
  const exported = exportedOnLine(exportedAt);
  const columns = records.map((record) =>
    toComparisonColumn(record, selectedRowByRunId[record.id] ?? 0),
  );
  const rows = buildComparisonRows(columns, hiddenKeys);
  return [
    `# QRE Run Comparison (${records.length} runs)`,
    "",
    ...(exported === null ? [] : [exported, ""]),
    "## Selected runs",
    "",
    ...records.map((record, index) => {
      const column = columns[index];
      /*
       * Which frontier row this run's column was read from. Every metric in the
       * table below moves when the analyst picks a different row, so an export
       * that omitted this could not be reproduced from itself — and two exports
       * of the same selection could disagree with no way to tell why.
       */
      const source =
        column && column.frontierCount > 0
          ? `, frontier row ${column.selectedIndex + 1} of ${column.frontierCount}`
          : "";
      // Identified by id as well as name: run names are analyst-chosen and not
      // unique, so the name alone cannot tie a column back to a stored record.
      return `- **${record.config.name}** (\`${record.id}\`) — ${record.result.status}, QRE ${record.result.qreVersion}, created ${record.config.createdAt}${source}`;
    }),
    "",
    "## Configuration and resource comparison",
    "",
    markdownRow(["Field", ...columns.map((column) => column.name)]),
    `|${["---", ...columns.map(() => "---:")].join("|")}|`,
    ...rows.map((row) =>
      markdownRow([
        row.unitLabel ? `${row.label} (${row.unitLabel})` : row.label,
        // Matches the on-screen table: a failed run's whole column reads as failed.
        // A bare "—" here would carry the same ambiguity the table deliberately
        // removed ("field not reported" vs "the run never produced results").
        ...row.metrics.map((metric, index) =>
          columns[index]?.failed && !row.availableOnFailedRun
            ? "No result data"
            : formatMetric(metric),
        ),
      ]),
    ),
  ].join("\n");
}

/** The unit a comparison row's numbers are in, from the first run that reports it. */
function unitOfRow(row: ComparisonRow): string {
  for (const metric of row.metrics) {
    if (metric && metric.unit.length > 0) return metric.unit;
  }
  return "";
}

/**
 * The comparison as CSV — one row per run, not one row per field.
 *
 * Deliberately the transpose of the Markdown table. On screen, field-by-row is
 * right: there are a handful of runs and dozens of fields, so the runs are the
 * columns that fit. In a spreadsheet the opposite is true — one row per
 * observation is the shape every pivot, filter and chart expects, and it is
 * what makes a second exported comparison concatenate onto the first.
 *
 * Carries `Status` as a real column because the Markdown's "No result data"
 * cannot come along: it is prose in a column a spreadsheet will read as
 * numeric. Empty cells plus a status column say the same thing as data.
 */
export function buildComparisonCsv(
  records: readonly RunRecord[],
  selectedRowByRunId: SelectedRowByRunId = {},
  hiddenKeys: ReadonlySet<string> = new Set(),
): string {
  const columns = records.map((record) =>
    toComparisonColumn(record, selectedRowByRunId[record.id] ?? 0),
  );
  const rows = buildComparisonRows(columns, hiddenKeys);

  return csvDocument([
    [
      "Run ID",
      "Run",
      "Status",
      "QRE version",
      "Frontier row",
      // The unit the numbers are IN, taken from the metrics themselves — not
      // `unitLabel`, which is a display category. A column headed "time" over a
      // raw nanosecond count leaves the reader to guess the scale, and the
      // frontier CSV beside it says "(ns)" for the identical number.
      ...rows.map((row) => csvHeader(row.label, unitOfRow(row))),
    ],
    ...columns.map((column, index) => [
      column.id,
      column.name,
      column.failed ? "failed" : "succeeded",
      column.qreVersion,
      // Same provenance the Markdown bullet carries: every metric on this row
      // depends on which frontier point it was read from.
      column.frontierCount > 0 ? `${column.selectedIndex + 1} of ${column.frontierCount}` : "",
      ...rows.map((row) => csvValue(row.metrics[index])),
    ]),
  ]);
}

export function ComparisonExportDialog({
  records,
  selectedRowByRunId = {},
  hiddenKeys = new Set(),
  onClose,
}: ComparisonExportDialogProps) {
  const exportedAt = useExportedAt();
  const preview = buildComparisonExportMarkdown(
    records,
    selectedRowByRunId,
    hiddenKeys,
    exportedAt,
  );

  return (
    <Modal
      titleId="comparison-export-title"
      title="Export comparison"
      onClose={onClose}
      footer={
        <>
          <CopyButton value={preview} label="Copy Markdown" />
          <button
            type="button"
            onClick={() => downloadMarkdown(preview, "qre-run-comparison", { exportedAt })}
          >
            Download .md
          </button>
          <button
            type="button"
            onClick={() =>
              downloadCsv(
                buildComparisonCsv(records, selectedRowByRunId, hiddenKeys),
                "qre-run-comparison",
                { exportedAt },
              )
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
        Includes selected-run metadata and the complete side-by-side resource
        table. The CSV is one row per run, with raw numeric values.
      </p>
      <pre className="code-block" aria-label="Comparison export preview">
        {preview}
      </pre>
    </Modal>
  );
}
