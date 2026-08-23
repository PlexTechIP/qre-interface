// @vitest-environment node

/**
 * The frontier span a run summary carries.
 *
 * This exists so that comparing runs does not cost a `qre_get_run` per run, and
 * the whole value of it is that the two numbers in a pair belong together. A
 * Pareto frontier trades qubits against time: the cheapest point in qubits is
 * the slowest one. Reporting `min(physicalQubits)` beside `min(runtime)` would
 * therefore describe a configuration the engine never returned and nothing can
 * be run at — cheaper AND faster than anything on the curve. The tests below are
 * mostly about that one mistake.
 */

import { describe, expect, it } from "vitest";

import { toRunSummary } from "./projections.js";
import { buildFrontierRow, buildRunRecord } from "../shared/testing/builders.js";
import type { FrontierRow, RunRecord } from "../shared/types.js";

/** A frontier point at a given size, priced the way a real frontier prices it. */
function point(qubits: number, runtime: number): FrontierRow {
  return buildFrontierRow({
    physicalQubits: { value: qubits, unit: "qubits", display: `${qubits}` },
    runtime: { value: runtime, unit: "ns", display: `${runtime}` },
  });
}

function summaryOf(frontier: FrontierRow[] | null, status: "succeeded" | "failed" = "succeeded") {
  const record: RunRecord = buildRunRecord({
    result:
      status === "failed"
        ? { status: "failed", frontier: null, error: { code: "ENGINE_CRASH", message: "boom" } }
        : { status: "succeeded", frontier },
  });
  return toRunSummary(record).frontier;
}

describe("the frontier span in a run summary", () => {
  it("pairs each qubit count with the runtime measured at that point", () => {
    // Rows deliberately out of order, and priced so that fewer qubits costs
    // MORE time — which is what a frontier is.
    const span = summaryOf([
      point(2_000_000, 5_000),
      point(1_000_000, 40_000),
      point(4_000_000, 1_000),
    ]);

    expect(span).toEqual({
      points: 3,
      physicalQubitsUnit: "qubits",
      runtimeUnit: "ns",
      fewestQubits: { physicalQubits: 1_000_000, runtime: 40_000 },
      mostQubits: { physicalQubits: 4_000_000, runtime: 1_000 },
    });
  });

  it("never reports the cheapest qubits beside the shortest runtime", () => {
    const span = summaryOf([
      point(1_000_000, 40_000),
      point(4_000_000, 1_000),
    ]);

    // The defect this guards: a configuration that is both the smallest and the
    // fastest, which is not on the curve and cannot be run.
    expect(span?.fewestQubits.runtime).toBe(40_000);
    expect(span?.fewestQubits.runtime).toBeGreaterThan(span?.mostQubits.runtime ?? 0);
  });

  it("does not trust the engine's row order", () => {
    const ascending = summaryOf([point(10, 900), point(20, 400), point(30, 100)]);
    const descending = summaryOf([point(30, 100), point(20, 400), point(10, 900)]);

    expect(ascending).toEqual(descending);
  });

  it("reports one point as both ends", () => {
    const span = summaryOf([point(7_000, 55)]);

    expect(span?.points).toBe(1);
    expect(span?.fewestQubits).toEqual(span?.mostQubits);
  });

  it("is null for a run that failed", () => {
    expect(summaryOf(null, "failed")).toBeNull();
  });

  it("is null for a run that succeeded with no feasible point", () => {
    expect(summaryOf([])).toBeNull();
  });

  it("bounds a unit the engine controls the length of", () => {
    const span = summaryOf([
      buildFrontierRow({
        physicalQubits: { value: 1, unit: "q".repeat(500), display: "1" },
        runtime: { value: 1, unit: "n".repeat(500), display: "1" },
      }),
    ]);

    expect([...(span?.physicalQubitsUnit ?? "")].length).toBeLessThanOrEqual(100);
    expect([...(span?.runtimeUnit ?? "")].length).toBeLessThanOrEqual(100);
  });
});
