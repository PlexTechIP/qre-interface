import { describe, expect, it } from "vitest";

import {
  SAMPLE_RUN_RECORDS,
  buildFrontierRow,
  buildRunRecord,
} from "../../shared/testing";
import type { FrontierRow, RunRecord } from "../../shared/types";
import {
  belowThresholdMessage,
  buildParetoModel,
  MIN_COMPARISON_RUNS,
  paretoAxis,
  SERIES_PALETTE_SIZE,
  SERIES_SYMBOLS,
  toComparisonColumn,
} from "./comparisonModel";

function recordWithSeveralRows(): RunRecord {
  return buildRunRecord({
    result: {
      frontier: [
        buildFrontierRow({ runtime: { value: 10, unit: "ns", display: "10 ns" } }),
        buildFrontierRow({ runtime: { value: 20, unit: "ns", display: "20 ns" } }),
        buildFrontierRow({ runtime: { value: 30, unit: "ns", display: "30 ns" } }),
      ],
    },
  });
}

/** A frontier row pinned to one (runtime, physicalQubits) pair. */
function point(runtimeNs: number, qubits: number): FrontierRow {
  return buildFrontierRow({
    runtime: { value: runtimeNs, unit: "ns", display: `${runtimeNs} ns` },
    physicalQubits: { value: qubits, unit: "qubits", display: String(qubits) },
  });
}

/** A named, uniquely-identified record carrying the given frontier. */
function runWithFrontier(
  id: string,
  name: string,
  frontier: FrontierRow[] | null,
  status: "succeeded" | "failed" = "succeeded",
): RunRecord {
  return buildRunRecord({
    config: { id, name },
    result: {
      status,
      frontier,
      ...(status === "failed"
        ? { error: { code: "ESTIMATION_FAILED", message: "No feasible point." } }
        : {}),
    },
  });
}

const ID_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ID_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("comparison representative row", () => {
  it("defaults to the first frontier row", () => {
    const record = recordWithSeveralRows();
    const column = toComparisonColumn(record);

    expect(column.selectedIndex).toBe(0);
    expect(column.row).toBe(record.result.frontier?.[0]);
  });

  it("uses the row selected for this app session", () => {
    const record = recordWithSeveralRows();
    const column = toComparisonColumn(record, 2);

    expect(column.selectedIndex).toBe(2);
    expect(column.frontierCount).toBe(record.result.frontier?.length);
    expect(column.row).toBe(record.result.frontier?.[2]);
  });

  it("falls back to row 1 when a session index is stale", () => {
    const record = recordWithSeveralRows();
    const column = toComparisonColumn(record, 999);

    expect(column.selectedIndex).toBe(0);
    expect(column.row).toBe(record.result.frontier?.[0]);
  });

  it("keeps failed runs rowless", () => {
    const record = SAMPLE_RUN_RECORDS.find(
      (candidate) => candidate.result.status === "failed",
    );
    if (!record) throw new Error("Expected a failed sample run.");

    const column = toComparisonColumn(record, 2);

    expect(column.row).toBeNull();
    expect(column.selectedIndex).toBe(0);
    expect(column.frontierCount).toBe(0);
  });
});

describe("Pareto curve model", () => {
  it("gives every selected run its own curve over its FULL frontier", () => {
    const a = runWithFrontier(ID_A, "Run A", [point(10, 900), point(30, 400)]);
    const b = runWithFrontier(ID_B, "Run B", [point(20, 700)]);

    const { series } = buildParetoModel([a, b]);

    expect(series.map((s) => s.name)).toEqual(["Run A", "Run B"]);
    expect(series[0]?.points).toHaveLength(2);
    // A one-row frontier is still a curve — one visible point, not an empty series.
    expect(series[1]?.points).toHaveLength(1);
  });

  it("orders each curve along the frontier, not by saved row order", () => {
    // Saved out of order, as the engine reports them.
    const record = runWithFrontier(ID_A, "Run A", [point(30, 400), point(10, 900), point(20, 600)]);

    const [curve] = buildParetoModel([record]).series;

    expect(curve?.points.map((p) => p.runtime)).toEqual([10, 20, 30]);
    // The saved row number travels with the point, so "Row N" stays truthful.
    expect(curve?.points.map((p) => p.index)).toEqual([1, 2, 0]);
  });

  it("marks the session's selected row on the curve", () => {
    const record = runWithFrontier(ID_A, "Run A", [point(30, 400), point(10, 900), point(20, 600)]);

    const [curve] = buildParetoModel([record], { [ID_A]: 2 }).series;

    expect(curve?.points.filter((p) => p.selected).map((p) => p.index)).toEqual([2]);
  });

  it("names a failed run as not plotted instead of drawing an empty curve", () => {
    const ok = runWithFrontier(ID_A, "Run A", [point(10, 900)]);
    const failed = runWithFrontier(ID_B, "Run B", null, "failed");

    const { series, omitted } = buildParetoModel([ok, failed]);

    expect(series.map((s) => s.name)).toEqual(["Run A"]);
    expect(omitted).toEqual([{ id: ID_B, name: "Run B", reason: "failed" }]);
  });

  it("drops rows without a numeric runtime or qubit count rather than plotting NaN", () => {
    const record = runWithFrontier(ID_A, "Run A", [
      point(10, 900),
      buildFrontierRow({
        runtime: { value: Number.NaN, unit: "ns", display: "—" },
        physicalQubits: { value: 500, unit: "qubits", display: "500" },
      }),
    ]);

    const [curve] = buildParetoModel([record]).series;

    expect(curve?.points).toHaveLength(1);
    expect(curve?.frontierCount).toBe(2);
    expect(curve?.points.every((p) => Number.isFinite(p.runtime) && Number.isFinite(p.physicalQubits))).toBe(
      true,
    );
  });

  it("omits a run whose every row is unplottable, with the reason", () => {
    const record = runWithFrontier(ID_A, "Run A", [
      buildFrontierRow({
        runtime: { value: Number.NaN, unit: "ns", display: "—" },
        physicalQubits: { value: Number.NaN, unit: "qubits", display: "—" },
      }),
    ]);

    const { series, omitted } = buildParetoModel([record]);

    expect(series).toHaveLength(0);
    expect(omitted).toEqual([{ id: ID_A, name: "Run A", reason: "unplottable" }]);
  });

  it("assigns each curve a distinct symbol so colour is never the only cue", () => {
    const records = Array.from({ length: SERIES_PALETTE_SIZE }, (_, i) =>
      runWithFrontier(`0000000${i}-0000-4000-8000-000000000000`, `Run ${i}`, [point(10 + i, 900)]),
    );

    const symbols = buildParetoModel(records).series.map((s) => s.symbol);

    expect(symbols).toHaveLength(SERIES_PALETTE_SIZE);
    expect(new Set(symbols).size).toBe(symbols.length);
  });

  it("wraps symbol and colour on the same period", () => {
    // The colour token is --color-series-((n-1) % SERIES_PALETTE_SIZE) + 1. If
    // the symbol list were shorter, two curves would share a symbol while their
    // colours still differed — leaving colour as the only cue between them,
    // which is exactly what SERIES_SYMBOLS exists to prevent.
    expect(SERIES_SYMBOLS).toHaveLength(SERIES_PALETTE_SIZE);
  });

  it("gives every point its run's name — the scatter tooltip has no series", () => {
    const a = runWithFrontier(ID_A, "Run A", [point(10, 900)]);
    const b = runWithFrontier(ID_B, "Run B", [point(20, 700)]);

    const { series } = buildParetoModel([a, b]);

    expect(series[0]?.points[0]?.runName).toBe("Run A");
    expect(series[1]?.points[0]?.runName).toBe("Run B");
  });
});

describe("Pareto axis scale", () => {
  it("switches to a decade-bounded log axis over a wide magnitude range", () => {
    expect(paretoAxis([1_000, 55_000_000])).toEqual({
      scale: "log",
      domain: [1000, 100_000_000],
      ticks: [1e3, 1e4, 1e5, 1e6, 1e7, 1e8],
    });
  });

  it("supplies explicit decade ticks — Recharts collapses log ticks to one label", () => {
    // 4 ms to 15 min in nanoseconds: six decades, one tick each.
    const axis = paretoAxis([4_000_000, 900_000_000_000]);
    expect(axis.ticks).toEqual([1e6, 1e7, 1e8, 1e9, 1e10, 1e11, 1e12]);
  });

  it("thins the ticks rather than labelling every decade of a huge range", () => {
    const axis = paretoAxis([1, 1e18]);
    expect(axis.ticks).toHaveLength(7);
    expect(axis.ticks?.[0]).toBe(1);
    expect(axis.ticks?.[6]).toBe(1e18);
  });

  it("stays linear over a narrow range", () => {
    expect(paretoAxis([100, 400])).toEqual({ scale: "linear", domain: ["auto", "auto"] });
  });

  it("stays linear when a value is zero — a log axis cannot show it", () => {
    // The sparse frontier legitimately reports a 0 ns runtime.
    expect(paretoAxis([0, 5_000_000])).toEqual({ scale: "linear", domain: ["auto", "auto"] });
  });

  it("stays linear for a single point or a flat axis", () => {
    expect(paretoAxis([42]).scale).toBe("linear");
    expect(paretoAxis([42, 42]).scale).toBe("linear");
    expect(paretoAxis([]).scale).toBe("linear");
  });
});

describe("comparison threshold", () => {
  it("needs two runs", () => {
    expect(MIN_COMPARISON_RUNS).toBe(2);
  });

  it("says what is missing at each below-threshold count", () => {
    expect(belowThresholdMessage(0)).toMatch(/at least 2 runs/i);
    expect(belowThresholdMessage(1)).toMatch(/only 1 run is selected/i);
    expect(belowThresholdMessage(1)).toMatch(/1 more run/i);
  });

  it("says nothing about filters when none is hiding a checked run", () => {
    expect(belowThresholdMessage(1, 0)).not.toMatch(/filter/i);
  });

  it("explains checked-but-hidden runs so the count does not look wrong", () => {
    // Two checked, one hidden by the filter: the user sees "(1)" having ticked
    // two boxes, and needs to be told why.
    const message = belowThresholdMessage(1, 1);
    expect(message).toMatch(/1 checked run is hidden by the current filter/i);
    expect(message).toMatch(/clear the filter to include it/i);

    expect(belowThresholdMessage(0, 2)).toMatch(/2 checked runs are hidden/i);
  });
});
