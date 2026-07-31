import { describe, expect, it } from "vitest";

import {
  SAMPLE_RUN_RECORDS,
  buildFrontierRow,
  buildRunRecord,
} from "../../shared/testing";
import type { FrontierRow, RunRecord } from "../../shared/types";
import {
  COMPARE_MIN_SELECTION,
  buildFrontierSeries,
  compareSelectionWarning,
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

/** A frontier point at an explicit (runtime ns, physical qubits) coordinate. */
function pointAt(runtime: number, physicalQubits: number): FrontierRow {
  return buildFrontierRow({
    runtime: { value: runtime, unit: "ns", display: "ignored" },
    physicalQubits: { value: physicalQubits, unit: "qubits", display: "ignored" },
  });
}

function recordWithFrontier(
  name: string,
  id: string,
  frontier: FrontierRow[],
): RunRecord {
  return buildRunRecord({ config: { id, name }, result: { frontier } });
}

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

  it("carries the whole frontier, not just the representative row", () => {
    const record = recordWithSeveralRows();

    expect(toComparisonColumn(record, 1).frontier).toHaveLength(3);
  });
});

describe("frontier curve series", () => {
  it("plots every point of every run, not just the representative row", () => {
    const columns = [
      recordWithFrontier("Run A", "10000000-0000-4000-8000-00000000000a", [
        pointAt(10, 100),
        pointAt(20, 90),
        pointAt(30, 80),
      ]),
      recordWithFrontier("Run B", "10000000-0000-4000-8000-00000000000b", [
        pointAt(15, 200),
        pointAt(25, 150),
      ]),
    ].map((record) => toComparisonColumn(record));

    const { series } = buildFrontierSeries(columns);

    expect(series).toHaveLength(2);
    expect(series[0]?.name).toBe("Run A");
    expect(series[0]?.points).toHaveLength(3);
    expect(series[1]?.points).toHaveLength(2);
  });

  it("orders each run's points by runtime so the curve reads left to right", () => {
    const column = toComparisonColumn(
      recordWithFrontier("Unsorted", "10000000-0000-4000-8000-00000000000c", [
        pointAt(30, 80),
        pointAt(10, 100),
        pointAt(20, 90),
      ]),
    );

    const points = buildFrontierSeries([column]).series[0]?.points ?? [];

    expect(points.map((point) => point.runtime)).toEqual([10, 20, 30]);
    // The original frontier index rides along so selection stays addressable.
    expect(points.map((point) => point.index)).toEqual([1, 2, 0]);
  });

  it("distinguishes series by marker shape as well as colour", () => {
    const columns = [
      recordWithFrontier("A", "10000000-0000-4000-8000-00000000000a", [pointAt(1, 1)]),
      recordWithFrontier("B", "10000000-0000-4000-8000-00000000000b", [pointAt(1, 1)]),
      recordWithFrontier("C", "10000000-0000-4000-8000-00000000000c", [pointAt(1, 1)]),
    ].map((record) => toComparisonColumn(record));

    const { series } = buildFrontierSeries(columns);
    const symbols = series.map((entry) => entry.symbol);
    const colors = series.map((entry) => entry.color);

    expect(new Set(symbols).size).toBe(3);
    expect(new Set(colors).size).toBe(3);
  });

  it("keeps colour and shape from repeating together past the palette length", () => {
    // Nothing caps the comparison selection, so a 7th run is reachable. It must
    // not be visually identical to the 1st once the colour cycle wraps.
    const columns = Array.from({ length: 7 }, (_, i) =>
      toComparisonColumn(
        recordWithFrontier(`Run ${i}`, `10000000-0000-4000-8000-00000000000${i}`, [
          pointAt(1, 1),
        ]),
      ),
    );

    const { series } = buildFrontierSeries(columns);
    const pairs = series.map((entry) => `${entry.color}|${entry.symbol}`);

    expect(new Set(pairs).size).toBe(7);
    expect(series[6]?.symbol).not.toBe(series[0]?.symbol);
  });

  it("names runs it cannot plot instead of dropping them silently", () => {
    const failed = SAMPLE_RUN_RECORDS.find((r) => r.result.status === "failed");
    if (!failed) throw new Error("Expected a failed sample run.");
    const columns = [
      toComparisonColumn(
        recordWithFrontier("Plottable", "10000000-0000-4000-8000-00000000000a", [
          pointAt(10, 100),
        ]),
      ),
      toComparisonColumn(failed),
    ];

    const { series, omitted } = buildFrontierSeries(columns);

    expect(series).toHaveLength(1);
    expect(omitted).toHaveLength(1);
    expect(omitted[0]?.name).toBe(failed.config.name);
    expect(omitted[0]?.reason).toBe("failed");
  });

  it("keeps a one-row run as a visible single point", () => {
    const column = toComparisonColumn(
      recordWithFrontier("Sparse", "10000000-0000-4000-8000-00000000000d", [
        pointAt(42, 4_200),
      ]),
    );

    const { series } = buildFrontierSeries([column]);

    expect(series[0]?.points).toHaveLength(1);
    expect(series[0]?.points[0]).toMatchObject({ runtime: 42, physicalQubits: 4_200 });
  });

  it("marks the session-selected point so the curve agrees with the table", () => {
    const column = toComparisonColumn(
      recordWithFrontier("Selected", "10000000-0000-4000-8000-00000000000e", [
        pointAt(10, 100),
        pointAt(20, 90),
        pointAt(30, 80),
      ]),
      2,
    );

    const points = buildFrontierSeries([column]).series[0]?.points ?? [];

    expect(points.filter((point) => point.selected)).toHaveLength(1);
    expect(points.find((point) => point.selected)?.runtime).toBe(30);
  });

  it("switches an axis to log scale only when its magnitudes are wide and positive", () => {
    const wide = buildFrontierSeries([
      toComparisonColumn(
        recordWithFrontier("Wide", "10000000-0000-4000-8000-00000000000a", [
          pointAt(1, 10),
          pointAt(1_000_000, 20),
        ]),
      ),
    ]);
    const narrow = buildFrontierSeries([
      toComparisonColumn(
        recordWithFrontier("Narrow", "10000000-0000-4000-8000-00000000000b", [
          pointAt(10, 10),
          pointAt(20, 20),
        ]),
      ),
    ]);

    expect(wide.logRuntime).toBe(true);
    expect(wide.logQubits).toBe(false);
    expect(narrow.logRuntime).toBe(false);
    expect(narrow.logQubits).toBe(false);
  });

  it("never uses log scale when a value is zero, which log cannot plot", () => {
    const withZero = buildFrontierSeries([
      toComparisonColumn(
        recordWithFrontier("Zeroed", "10000000-0000-4000-8000-00000000000a", [
          pointAt(0, 10),
          pointAt(1_000_000, 20),
        ]),
      ),
    ]);

    expect(withZero.logRuntime).toBe(false);
  });

  it("returns no series at all when nothing in the selection has a frontier", () => {
    const failed = SAMPLE_RUN_RECORDS.filter((r) => r.result.status === "failed");
    expect(failed.length).toBeGreaterThan(0);

    const { series, omitted } = buildFrontierSeries(failed.map((r) => toComparisonColumn(r)));

    expect(series).toHaveLength(0);
    expect(omitted).toHaveLength(failed.length);
  });
});

describe("compare-selection threshold", () => {
  it("requires two runs", () => {
    expect(COMPARE_MIN_SELECTION).toBe(2);
  });

  it("explains what is needed when nothing is selected", () => {
    const warning = compareSelectionWarning(0);

    expect(warning).toMatch(/2 runs/i);
    expect(warning).toMatch(/none/i);
  });

  it("says how many more are needed when one is selected", () => {
    const warning = compareSelectionWarning(1);

    expect(warning).toMatch(/1 more/i);
  });

  it("stops warning once the threshold is met", () => {
    expect(compareSelectionWarning(2)).toBeNull();
    expect(compareSelectionWarning(6)).toBeNull();
  });
});
