import { describe, expect, it } from "vitest";
import {
  formatCompactNumber,
  formatFactories,
  formatMetric,
  formatProbability,
  formatStandardNumber,
  formatTimeFromNs,
} from "./formatMetric";

describe("formatMetric", () => {
  it("formats standard numbers with thousands separators from value", () => {
    expect(formatStandardNumber(829_766)).toBe("829,766");
    expect(formatMetric({ value: 1_234_567, unit: "qubits", display: "do not use me" })).toBe("1,234,567");
  });

  it("formats compact magnitudes", () => {
    expect(formatCompactNumber(1_200)).toBe("1.2k");
    expect(formatCompactNumber(4_500_000)).toBe("4.5M");
    expect(formatCompactNumber(8_000_000_000)).toBe("8B");
    expect(formatCompactNumber(1_200_000_000_000)).toBe("1.2T");
  });

  it("formats tiny probabilities with scientific notation", () => {
    expect(formatProbability(0.00042)).toBe("4.2e-4");
    expect(formatProbability(1e-19)).toBe("1e-19");
    expect(formatMetric({ value: 0.00000000000000000012, unit: "probability", display: "wrong" })).toBe("1.2e-19");
  });

  it("promotes nanosecond durations through larger time units", () => {
    expect(formatTimeFromNs(3)).toBe("3 ns");
    expect(formatTimeFromNs(5_200)).toBe("5.2 µs");
    expect(formatTimeFromNs(19_100_000)).toBe("19.1 ms");
    expect(formatTimeFromNs(2_000_000_000)).toBe("2 s");
    expect(formatTimeFromNs(120_000_000_000)).toBe("2 min");
    expect(formatTimeFromNs(7_200_000_000_000)).toBe("2 hr");
    expect(formatTimeFromNs(31_536_000_000_000_000)).toBe("1 yr");
  });

  it("handles zero as a real value", () => {
    expect(formatStandardNumber(0)).toBe("0");
    expect(formatCompactNumber(0)).toBe("0");
    expect(formatTimeFromNs(0)).toBe("0 ns");
    expect(formatProbability(0)).toBe("0");
  });

  it("passes string and boolean fields through from value", () => {
    expect(formatMetric({ value: "feasible", unit: "", display: "Feasible" })).toBe("feasible");
    expect(formatMetric({ value: true, unit: "", display: "Yes" })).toBe("true");
  });

  it("formats factory arrays from value", () => {
    expect(formatFactories([])).toBe("none");
    expect(formatFactories([{ stateType: "T", copies: 216 }])).toBe("216 x T");
    expect(
      formatMetric({
        value: [
          { stateType: "T", copies: 216 },
          { stateType: "CCX", copies: 3 },
        ],
        unit: "factories",
        display: "wrong",
      }),
    ).toBe("216 x T, 3 x CCX");
  });
});
