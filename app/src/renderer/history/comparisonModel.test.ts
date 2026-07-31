import { describe, expect, it } from "vitest";

import {
  SAMPLE_RUN_RECORDS,
  buildFrontierRow,
  buildRunRecord,
} from "../../shared/testing";
import type { RunRecord } from "../../shared/types";
import { toComparisonColumn } from "./comparisonModel";

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
