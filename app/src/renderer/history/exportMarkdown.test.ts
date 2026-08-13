import { describe, expect, it } from "vitest";

import { SAMPLE_RUN_RECORDS, buildFrontierRow, buildRunRecord } from "../../shared/testing";
import { buildComparisonExportMarkdown } from "./ComparisonExportStubDialog";
import { buildRunExportMarkdown } from "./ExportStubDialog";

/**
 * The Markdown generators are correct and are NOT rewritten here. The one gap
 * this covers: the frontier table emitted only the six default fields, while a
 * typical run reports ~10–15 of 37 — the rest live in `frontier[].additional`
 * and were silently dropped from the export.
 */
function recordReportingExtraFields() {
  return buildRunRecord({
    result: {
      frontier: [
        buildFrontierRow({
          additional: {
            physicalFactoryQubits: { value: 12_345, unit: "qubits", display: "ignored" },
            logicalDepth: { value: 6_789, unit: "cycles", display: "ignored" },
          },
        }),
        buildFrontierRow({
          additional: {
            physicalFactoryQubits: { value: 54_321, unit: "qubits", display: "ignored" },
            logicalDepth: { value: 9_876, unit: "cycles", display: "ignored" },
          },
        }),
      ],
    },
  });
}

describe("run export — frontier completeness", () => {
  it("uses the approved configuration labels in run and comparison Markdown", () => {
    const record = buildRunRecord();
    const runMarkdown = buildRunExportMarkdown(record);
    const comparisonMarkdown = buildComparisonExportMarkdown([record]);

    for (const markdown of [runMarkdown, comparisonMarkdown]) {
      expect(markdown).toContain("Total Fault Tolerant Execution Error");
      expect(markdown).toContain("T Count Per Rotation");
      expect(markdown).not.toContain("Max Error");
      expect(markdown).not.toContain("T States / Rotation");
    }
  });

  it("emits a column for every additional field the run reported", () => {
    const markdown = buildRunExportMarkdown(recordReportingExtraFields());

    expect(markdown).toMatch(/Phys\. Factory Qubits/i);
    expect(markdown).toMatch(/12,345/);
    expect(markdown).toMatch(/54,321/);
    expect(markdown).toMatch(/6,789/);
  });

  it("still emits the six default columns first", () => {
    const markdown = buildRunExportMarkdown(recordReportingExtraFields());
    const header = markdown.split("\n").find((line) => line.includes("Physical qubits"));

    expect(header).toBeDefined();
    const columns = (header ?? "").split("|").map((cell) => cell.trim()).filter(Boolean);
    expect(columns.slice(0, 7)).toEqual([
      "#",
      "Physical qubits",
      "Runtime",
      "Total error",
      "Factories",
      "Code distance",
      "Logical cycle time",
    ]);
  });

  it("leaves a row blank-safe when one row omits a field another reported", () => {
    const record = buildRunRecord({
      result: {
        frontier: [
          buildFrontierRow({
            additional: {
              physicalFactoryQubits: { value: 100, unit: "qubits", display: "ignored" },
            },
          }),
          buildFrontierRow({ additional: {} }),
        ],
      },
    });

    const markdown = buildRunExportMarkdown(record);

    // The column exists once, and the row that lacks it reads as no-data, not as
    // a shifted or missing cell.
    expect(markdown).toMatch(/Phys\. Factory Qubits/i);
    expect(markdown).toMatch(/—/);
  });

  it("reads a failed run's comparison cells as failed, matching the on-screen table", () => {
    const failed = SAMPLE_RUN_RECORDS.find((r) => r.result.status === "failed");
    const succeeded = SAMPLE_RUN_RECORDS.find((r) => r.result.status === "succeeded");
    if (!failed || !succeeded) throw new Error("Expected both a failed and a succeeded run.");

    const markdown = buildComparisonExportMarkdown([succeeded, failed]);

    // The screen says "No result data" for a failed column; a bare "—" there would
    // be the same ambiguity ("field not reported" vs "run failed") in the export.
    expect(markdown).toMatch(/No result data/i);
  });

  it("omits the additional columns entirely when no row reports one", () => {
    const markdown = buildRunExportMarkdown(
      buildRunRecord({ result: { frontier: [buildFrontierRow({ additional: {} })] } }),
    );
    const header = markdown.split("\n").find((line) => line.includes("Physical qubits")) ?? "";

    expect(header.split("|").filter((cell) => cell.trim()).length).toBe(7);
  });
});

/**
 * Cells of a Markdown table row.
 *
 * Strict about the outer pipes on purpose: the defect this guards against was a
 * row built as `[..., "|"].join(" | ")`, which ends `| |` and reads as a real
 * trailing cell to every Markdown renderer. Counting cells is the only
 * assertion that catches it — the row still *looks* well-formed.
 */
function cellsOf(row: string): string[] {
  const trimmed = row.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) {
    throw new Error(`Not a delimited table row: ${row}`);
  }
  return trimmed
    .slice(1, -1)
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim());
}

/** Every line that is part of the one Markdown table in `markdown`. */
function tableRows(markdown: string): string[] {
  return markdown.split("\n").filter((line) => line.trim().startsWith("|"));
}

describe("comparison export — table shape", () => {
  it("emits one cell per run plus the field label, and no phantom trailing column", () => {
    const [first, second] = SAMPLE_RUN_RECORDS;
    if (!first || !second) throw new Error("Expected at least two sample records.");

    const rows = tableRows(buildComparisonExportMarkdown([first, second]));

    expect(rows.length).toBeGreaterThan(2);
    for (const row of rows) {
      expect(cellsOf(row)).toHaveLength(3);
    }
  });

  it("keeps the delimiter row a valid alignment row for every column", () => {
    const [first, second] = SAMPLE_RUN_RECORDS;
    if (!first || !second) throw new Error("Expected at least two sample records.");

    const delimiter = tableRows(buildComparisonExportMarkdown([first, second]))[1] ?? "";

    for (const cell of cellsOf(delimiter)) {
      expect(cell).toMatch(/^:?-+:?$/);
    }
  });
});

describe("comparison export — the field filter", () => {
  it("omits a field the analyst hid on screen", () => {
    const record = buildRunRecord({
      result: {
        frontier: [
          buildFrontierRow({
            additional: {
              physicalFactoryQubits: { value: 12_345, unit: "qubits", display: "ignored" },
            },
          }),
        ],
      },
    });

    const shown = buildComparisonExportMarkdown([record], {}, new Set());
    const hidden = buildComparisonExportMarkdown([record], {}, new Set(["physicalFactoryQubits"]));

    expect(shown).toMatch(/Phys\. Factory Qubits/i);
    expect(hidden).not.toMatch(/Phys\. Factory Qubits/i);
    // Hiding one row does not disturb the rest of the table.
    expect(hidden).toMatch(/Physical Qubits/i);
  });

  it("exports every field when nothing is hidden, as it did before the filter was honoured", () => {
    const record = buildRunRecord();

    expect(buildComparisonExportMarkdown([record])).toBe(
      buildComparisonExportMarkdown([record], {}, new Set()),
    );
  });
});

describe("exports — provenance", () => {
  it("names the frontier row each comparison column was read from", () => {
    const record = buildRunRecord({
      result: {
        frontier: [buildFrontierRow(), buildFrontierRow(), buildFrontierRow()],
      },
    });

    const markdown = buildComparisonExportMarkdown([record], { [record.id]: 1 });

    // Which row these numbers came from is what makes the table reproducible —
    // `selectedRowByRunId` changes every metric in it.
    expect(markdown).toContain("frontier row 2 of 3");
  });

  it("does not claim a frontier row for a run that produced none", () => {
    const failed = SAMPLE_RUN_RECORDS.find((r) => r.result.status === "failed");
    if (!failed) throw new Error("Expected a failed sample record.");

    expect(buildComparisonExportMarkdown([failed])).not.toMatch(/frontier row/i);
  });

  it("identifies each compared run by id, since run names are not unique", () => {
    const [first, second] = SAMPLE_RUN_RECORDS;
    if (!first || !second) throw new Error("Expected at least two sample records.");

    const markdown = buildComparisonExportMarkdown([first, second]);

    expect(markdown).toContain(first.id);
    expect(markdown).toContain(second.id);
  });

  it("carries the record-level timestamps the run export used to drop", () => {
    const record = buildRunRecord();
    const markdown = buildRunExportMarkdown(record);

    // `savedAt` and `startedAt` live on the record and the result, so neither is
    // recoverable from the embedded config JSON the way the run id is.
    expect(markdown).toContain(`- **Run ID:** ${record.id}`);
    expect(markdown).toContain(`- **Saved:** ${record.savedAt}`);
    expect(markdown).toContain(`- **Started:** ${record.result.startedAt}`);
  });
});

/**
 * An export leaves the app and is read later, beside other exports of the same
 * runs. Without a date on the document itself, "which of these two is current"
 * is answerable only from a file mtime, which copying, syncing or mailing the
 * file destroys.
 */
describe("exports — when and against what", () => {
  const EXPORTED_AT = "2026-08-12T19:04:31.000Z";

  it("dates the run export", () => {
    const markdown = buildRunExportMarkdown(buildRunRecord(), EXPORTED_AT);

    expect(markdown).toContain(`> Exported from the QRE Dashboard on ${EXPORTED_AT}.`);
  });

  it("dates the comparison export", () => {
    const markdown = buildComparisonExportMarkdown(
      [buildRunRecord()],
      {},
      new Set(),
      EXPORTED_AT,
    );

    expect(markdown).toContain(`> Exported from the QRE Dashboard on ${EXPORTED_AT}.`);
  });

  it("records the contract version the run export's numbers came from", () => {
    const record = buildRunRecord();

    expect(buildRunExportMarkdown(record, EXPORTED_AT)).toContain(
      `- **Schema version:** ${record.schemaVersion}`,
    );
  });

  it("omits the line rather than dating an export it was not told the time of", () => {
    expect(buildRunExportMarkdown(buildRunRecord())).not.toMatch(/> Exported from/);
    expect(buildComparisonExportMarkdown([buildRunRecord()])).not.toMatch(/> Exported from/);
  });
});
