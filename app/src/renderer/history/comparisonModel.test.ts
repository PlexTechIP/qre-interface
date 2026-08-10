import { describe, expect, it } from "vitest";

import {
  SAMPLE_RUN_RECORDS,
  buildFrontierRow,
  buildRunRecord,
} from "../../shared/testing";
import type { FrontierRow, RunRecord } from "../../shared/types";
import {
  COMPARE_MIN_SELECTION,
  additionalFieldDefinitions,
  buildComparisonRows,
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

  it("shows the renamed configuration fields for every compared run", () => {
    const column = toComparisonColumn(buildRunRecord());
    const rows = buildComparisonRows([column], new Set());

    expect(rows.find((row) => row.key === "config.maxError")).toMatchObject({
      label: "Total Fault Tolerant Execution Error",
      availableOnFailedRun: true,
    });
    expect(
      rows.find((row) => row.key === "config.tStatesPerRotation"),
    ).toMatchObject({
      label: "T Count Per Rotation",
      availableOnFailedRun: true,
    });
  });

  it("does not duplicate T Count Per Rotation when qdk also reports it", () => {
    const record = buildRunRecord({
      result: {
        frontier: [
          buildFrontierRow({
            additional: {
              numTsPerRotation: {
                value: 20,
                unit: "T states",
                display: "20",
              },
            },
          }),
        ],
      },
    });
    const rows = buildComparisonRows([toComparisonColumn(record)], new Set());

    expect(rows.filter((row) => row.label === "T Count Per Rotation")).toHaveLength(1);
  });

  /**
   * A record whose traceTransform does not parse — a v1.1.0 record, or one
   * mixing contract shapes. The lenient `normalizeTraceTransform` repairs it to
   * the pipeline defaults for DISPLAY, and reading the configuration row off
   * that repair printed a confident "20" for a run that never recorded one,
   * beside runs whose 20 is real. Worse, the row that would have exposed the
   * disagreement — qdk's own reported metric — was filtered out as a duplicate
   * of the fabricated value, so neither number was visible.
   */
  describe("a record whose traceTransform cannot be read", () => {
    function unreadableRecord(): RunRecord {
      const record = buildRunRecord({
        result: {
          frontier: [
            buildFrontierRow({
              additional: {
                numTsPerRotation: { value: 13, unit: "T states", display: "13" },
              },
            }),
          ],
        },
      });
      // A legacy discriminant AND a v1.4.0 stage key: `parseTraceTransform`
      // rejects the contradiction outright rather than picking a repair.
      (record.config as { traceTransform: unknown }).traceTransform = {
        type: "psspc",
        tStatesPerRotation: 13,
        ccxMagicStates: false,
        unmemory: false,
      };
      return record;
    }

    it("reports no configured T count rather than the pipeline default", () => {
      expect(toComparisonColumn(unreadableRecord()).tCountPerRotation).toBeNull();
    });

    it("keeps qdk's reported T count visible instead of a fabricated 20", () => {
      const rows = buildComparisonRows([toComparisonColumn(unreadableRecord())], new Set());

      expect(rows.find((row) => row.key === "config.tStatesPerRotation")).toBeUndefined();
      expect(rows.find((row) => row.key === "numTsPerRotation")?.metrics[0]?.value).toBe(13);
    });

    /**
     * The field filter enumerates `additionalFieldDefinitions`, so the dedup
     * has to live THERE. Filtering inside `buildComparisonRows` instead left
     * the filter offering a "T Count Per Rotation" checkbox that toggled a row
     * nobody rendered, and counting it in "n/m extra shown".
     */
    it("renders exactly the additional fields the filter lists", () => {
      for (const record of [unreadableRecord(), buildRunRecord()]) {
        const columns = [toComparisonColumn(record)];
        const listed = additionalFieldDefinitions(columns).map((def) => def.key);
        const rendered = buildComparisonRows(columns, new Set())
          .filter((row) => !row.key.startsWith("config."))
          .map((row) => row.key);

        for (const key of listed) expect(rendered).toContain(key);
      }
    });
  });
});

describe("magic state factory row", () => {
  it("states each run's configured factory even when the engine reported none", () => {
    // A run using round_based whose representative point carries no factory node
    // → the result field is absent. The config-sourced row must still name it.
    const record = buildRunRecord({
      config: { magicStateFactories: ["round_based"] },
      result: { frontier: [buildFrontierRow({ additional: {} })] },
    });

    const rows = buildComparisonRows([toComparisonColumn(record)], new Set());
    const factoryRow = rows.find((row) => row.key === "config.magicStateFactories");

    expect(factoryRow?.label).toBe("Magic State Factory");
    expect(factoryRow?.metrics[0]?.display).toBe("Round-Based");
  });

  it("joins a multi-factory set and drops the duplicate result field from the filter", () => {
    const record = buildRunRecord({
      config: { magicStateFactories: ["round_based", "litinski19"] },
      result: {
        frontier: [
          buildFrontierRow({ additional: { magicStateFactory: { value: "round_based", unit: "", display: "round_based" } } }),
        ],
      },
    });
    const columns = [toComparisonColumn(record)];

    const rows = buildComparisonRows(columns, new Set());
    expect(rows.find((row) => row.key === "config.magicStateFactories")?.metrics[0]?.display).toBe(
      "Round-Based + Litinski19",
    );
    // The engine's per-point field is deduped away, so the filter never lists it.
    expect(additionalFieldDefinitions(columns).map((def) => def.key)).not.toContain(
      "magicStateFactory",
    );
  });
});

describe("additional field filter list", () => {
  const withExtra = (
    name: string,
    id: string,
    key: string,
    onNonRepresentativeRow = false,
  ): RunRecord => {
    const extraRow = buildFrontierRow({
      additional: { [key]: { value: 1, unit: "", display: "1" } },
    });
    const plainRow = buildFrontierRow({ additional: {} });
    return recordWithFrontier(
      name,
      id,
      onNonRepresentativeRow ? [plainRow, extraRow] : [extraRow],
    );
  };

  it("lists every additional field any selected run returned, even differing subsets", () => {
    const columns = [
      withExtra("A", "20000000-0000-4000-8000-00000000000a", "loss"),
      withExtra("B", "20000000-0000-4000-8000-00000000000b", "evaluationTime"),
    ].map((record) => toComparisonColumn(record));

    const keys = additionalFieldDefinitions(columns).map((def) => def.key);

    expect(keys).toContain("loss");
    expect(keys).toContain("evaluationTime");
  });

  it("includes a field a run returned only on a non-representative frontier row", () => {
    // selectedIndex 0 lacks the field; the run still returned it on row 1, so the
    // filter has to surface it — the union is over the whole frontier, not the
    // representative row.
    const columns = [
      toComparisonColumn(
        withExtra("multi", "20000000-0000-4000-8000-00000000000c", "codeCycleTime", true),
      ),
    ];

    const keys = additionalFieldDefinitions(columns).map((def) => def.key);

    expect(keys).toContain("codeCycleTime");
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
