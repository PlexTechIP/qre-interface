import { describe, expect, it } from "vitest";

import { SAMPLE_RUN_RECORDS, buildFrontierRow, buildRunRecord } from "../../shared/testing";
import { buildComparisonCsv } from "./ComparisonExportStubDialog";
import { buildFrontierCsv } from "./ExportStubDialog";

/** The rows of a CSV document, split on its RFC 4180 line ending. */
function rowsOf(csv: string): string[] {
  return csv.split("\r\n");
}

describe("frontier CSV", () => {
  it("is a spreadsheet of the frontier, one row per point", () => {
    const record = buildRunRecord({
      result: { frontier: [buildFrontierRow(), buildFrontierRow()] },
    });

    const rows = rowsOf(buildFrontierCsv(record));

    expect(rows).toHaveLength(3);
    expect(rows[0]).toContain("Physical Qubits (qubits)");
    expect(rows[1]?.startsWith("1,")).toBe(true);
    expect(rows[2]?.startsWith("2,")).toBe(true);
  });

  /**
   * The whole point of the CSV. The Markdown table carries `formatMetric`'s
   * output — "1,000,000" and "10 ms" — which is right for reading and useless
   * for plotting: the thousands separator makes the cell text, and the unit
   * conversion silently changes the number.
   */
  it("carries raw numbers, not the display strings the Markdown table shows", () => {
    const csv = buildFrontierCsv(buildRunRecord());
    const values = rowsOf(csv)[1] ?? "";

    expect(values).toContain("1000000");
    expect(values).not.toContain("1,000,000");
    // Runtime is nanoseconds in the record and nanoseconds in the CSV.
    expect(values).toContain("10000000");
    expect(values).not.toContain("10 ms");
    expect(values).toContain("0.0005");
  });

  it("names the unit each column is actually in", () => {
    const header = rowsOf(buildFrontierCsv(buildRunRecord()))[0] ?? "";

    expect(header).toContain("Runtime (ns)");
    expect(header).toContain("Logical Cycle Time (ns)");
    // Code distance is a bare count; a parenthetical with nothing in it is noise.
    expect(header).toContain("Code Distance");
    expect(header).not.toContain("Code Distance ()");
  });

  it("gives a column to every additional field, and an empty cell where a row omits one", () => {
    const record = buildRunRecord({
      result: {
        frontier: [
          buildFrontierRow({
            additional: { logicalDepth: { value: 6789, unit: "cycles", display: "ignored" } },
          }),
          buildFrontierRow({ additional: {} }),
        ],
      },
    });

    const rows = rowsOf(buildFrontierCsv(record));

    expect(rows[0]).toContain("Logical Depth (cycles)");
    expect(rows[1]?.endsWith("6789")).toBe(true);
    // Empty, not "—": a dash is a number as far as a spreadsheet is concerned.
    expect(rows[2]?.endsWith(",")).toBe(true);
  });

  it("keeps a non-numeric metric readable rather than dropping it", () => {
    const values = rowsOf(buildFrontierCsv(buildRunRecord()))[1] ?? "";

    expect(values).toContain("200 x T");
  });

  it("emits the header alone for a run that produced no frontier", () => {
    const failed = SAMPLE_RUN_RECORDS.find((r) => r.result.status === "failed");
    if (!failed) throw new Error("Expected a failed sample record.");

    const rows = rowsOf(buildFrontierCsv(failed));

    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain("Physical Qubits");
  });

  it("quotes a value containing a comma so the columns survive", () => {
    const record = buildRunRecord({
      result: {
        frontier: [
          buildFrontierRow({
            additional: { source: { value: "QIR, unrolled", unit: "", display: "ignored" } },
          }),
        ],
      },
    });

    expect(buildFrontierCsv(record)).toContain('"QIR, unrolled"');
  });

  it("escapes an embedded quote by doubling it, as RFC 4180 requires", () => {
    const record = buildRunRecord({
      result: {
        frontier: [
          buildFrontierRow({
            additional: { source: { value: 'the "fast" ISA', unit: "", display: "ignored" } },
          }),
        ],
      },
    });

    expect(buildFrontierCsv(record)).toContain('"the ""fast"" ISA"');
  });
});

describe("comparison CSV", () => {
  it("is one row per run, so a spreadsheet can pivot on it", () => {
    const [first, second] = SAMPLE_RUN_RECORDS;
    if (!first || !second) throw new Error("Expected at least two sample records.");

    const rows = rowsOf(buildComparisonCsv([first, second]));

    expect(rows).toHaveLength(3);
    expect(rows[0]?.startsWith("Run ID,Run,Status")).toBe(true);
    expect(rows[1]).toContain(first.id);
    expect(rows[2]).toContain(second.id);
  });

  it("carries each run's status, so an empty cell is not the only sign of a failure", () => {
    const failed = SAMPLE_RUN_RECORDS.find((r) => r.result.status === "failed");
    if (!failed) throw new Error("Expected a failed sample record.");

    const row = rowsOf(buildComparisonCsv([failed]))[1] ?? "";

    expect(row).toContain("failed");
    // No "No result data" prose in a column a spreadsheet will read as numeric.
    expect(row).not.toContain("No result data");
  });

  it("carries raw numbers here too", () => {
    const row = rowsOf(buildComparisonCsv([buildRunRecord()]))[1] ?? "";

    expect(row).toContain("1000000");
    expect(row).not.toContain("1,000,000");
  });

  it("omits the columns the analyst hid on screen", () => {
    const record = buildRunRecord();

    const shown = rowsOf(buildComparisonCsv([record]))[0] ?? "";
    const hidden =
      rowsOf(buildComparisonCsv([record], {}, new Set(["physicalFactoryQubits"])))[0] ?? "";

    expect(shown).toMatch(/Phys\. Factory Qubits/i);
    expect(hidden).not.toMatch(/Phys\. Factory Qubits/i);
  });

  /**
   * `Runtime (time)` over a raw `10000000` is worse than no unit at all: the
   * reader has to guess the scale, and the frontier CSV beside it says `(ns)`
   * for the identical number. `unitLabel` is a display category, not a unit.
   */
  it("heads each column with the unit its numbers are actually in", () => {
    const header = rowsOf(buildComparisonCsv([buildRunRecord()]))[0] ?? "";

    expect(header).toContain("Runtime (ns)");
    expect(header).not.toContain("Runtime (time)");
    expect(header).toContain("Code Distance,");
    expect(header).not.toContain("Code Distance (distance)");
    // A field whose unit is genuinely a word keeps it.
    expect(header).toContain("Total Error (probability)");
  });

  it("quotes a run name containing a comma", () => {
    const record = buildRunRecord({ config: { name: "Grover, 20 qubits" } });

    expect(buildComparisonCsv([record])).toContain('"Grover, 20 qubits"');
  });

  it("reads the frontier row the analyst selected, as the Markdown table does", () => {
    const record = buildRunRecord({
      result: {
        frontier: [
          buildFrontierRow(),
          buildFrontierRow({
            physicalQubits: { value: 42, unit: "qubits", display: "42" },
          }),
        ],
      },
    });

    expect(rowsOf(buildComparisonCsv([record], { [record.id]: 1 }))[1]).toContain("42");
  });
});
