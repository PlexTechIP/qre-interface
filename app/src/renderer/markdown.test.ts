import { describe, expect, it } from "vitest";

import { markdownCell, markdownRow } from "./markdown";

describe("markdownCell", () => {
  /** Run names and conversation titles are free text, so both are reachable. */
  it("escapes a pipe, which would otherwise end the cell early", () => {
    expect(markdownCell("Grover | 20 qubits")).toBe("Grover \\| 20 qubits");
  });

  it("flattens a newline, which would otherwise end the row", () => {
    expect(markdownCell("Grover\n20 qubits")).toBe("Grover 20 qubits");
  });

  it("leaves ordinary text alone", () => {
    expect(markdownCell("Shor's Factoring - Litinski19")).toBe("Shor's Factoring - Litinski19");
  });
});

describe("markdownRow", () => {
  it("wraps the cells in the outer pipes a table row needs", () => {
    expect(markdownRow(["Field", "A", "B"])).toBe("| Field | A | B |");
  });

  /**
   * The defect this exists to prevent: a row built by appending a bare "|" to
   * the cell list ends "| |", which every Markdown renderer reads as a real
   * trailing empty cell.
   */
  it("adds no trailing empty cell", () => {
    expect(markdownRow(["A", "B"]).endsWith("| B |")).toBe(true);
  });

  it("escapes its cells, so a caller cannot forget to", () => {
    expect(markdownRow(["a|b", "c"])).toBe("| a\\|b | c |");
  });
});
