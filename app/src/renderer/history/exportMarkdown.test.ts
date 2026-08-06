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
