// @vitest-environment node

import { describe, expect, it } from "vitest";

import { buildFrontierRow, buildRunRecord } from "../shared/testing/builders.js";
import { toRunDetail } from "./projections.js";

/**
 * The `additional` metric map is keyed by whatever the engine named things.
 * Plain assignment of a key named `__proto__` rewires the map instead of
 * storing the metric, so the entry vanished from the result and the object was
 * left with a prototype nobody asked for.
 */
describe("toRunDetail with an engine metric named __proto__", () => {
  it("keeps the metric as data and counts nothing as omitted", () => {
    const additional = JSON.parse(
      '{"__proto__": {"value": 7, "unit": "qubits", "display": "7"}, "ordinary": {"value": 1, "unit": "", "display": "1"}}',
    ) as Record<string, { value: unknown; unit: string; display: string }>;
    const record = buildRunRecord({
      result: { frontier: [{ ...buildFrontierRow(), additional }] },
    });

    const detail = toRunDetail(record);

    const sample = detail.frontierSample?.additional ?? {};
    expect(Object.hasOwn(sample, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(sample)).toBe(Object.prototype);
    expect(Object.keys(sample).sort()).toEqual(["__proto__", "ordinary"]);
    expect(detail.frontierSampleOmitted).toBe(0);
  });
});

/**
 * The curve travels with the detail so an agent that ran an estimate can
 * report the whole frontier from one reply. Bare numbers, cheapest in qubits
 * first, capped — the cap is for an engine configuration nobody has written
 * yet, and `frontierPointsOmitted` is how a reader knows it fired.
 */
describe("toRunDetail's frontier points", () => {
  function point(qubits: number, runtime: number) {
    return buildFrontierRow({
      physicalQubits: { value: qubits, unit: "qubits", display: `${qubits}` },
      runtime: { value: runtime, unit: "ns", display: `${runtime}` },
    });
  }

  it("carries every point of an ordinary frontier, fewest qubits first", () => {
    const record = buildRunRecord({
      result: { frontier: [point(300, 10), point(100, 30), point(200, 20)] },
    });

    const detail = toRunDetail(record);

    expect(detail.frontierPoints).toEqual([
      { physicalQubits: 100, runtime: 30 },
      { physicalQubits: 200, runtime: 20 },
      { physicalQubits: 300, runtime: 10 },
    ]);
    expect(detail.frontierPointsOmitted).toBe(0);
    expect(detail.frontierRowCount).toBe(3);
  });

  it("caps the curve at 32 points and counts the rest as omitted", () => {
    const rows = Array.from({ length: 40 }, (_, index) =>
      point(1_000 + index, 40 - index),
    );
    const record = buildRunRecord({ result: { frontier: rows } });

    const detail = toRunDetail(record);

    expect(detail.frontierPoints).toHaveLength(32);
    expect(detail.frontierPoints[0]).toEqual({ physicalQubits: 1_000, runtime: 40 });
    expect(detail.frontierPoints[31]).toEqual({ physicalQubits: 1_031, runtime: 9 });
    expect(detail.frontierPointsOmitted).toBe(8);
    // The uncapped count is still reported beside the capped list.
    expect(detail.frontierRowCount).toBe(40);
  });

  it("is empty for a failed estimate", () => {
    const record = buildRunRecord({
      result: {
        status: "failed",
        frontier: null,
        error: { code: "ENGINE_CRASH", message: "boom" },
      },
    });

    const detail = toRunDetail(record);

    expect(detail.frontierPoints).toEqual([]);
    expect(detail.frontierPointsOmitted).toBe(0);
  });
});

describe("toRunDetail with a stored setting named __proto__", () => {
  it("reports it like any other setting", () => {
    const record = buildRunRecord();
    const parameters = JSON.parse('{"__proto__": 3, "searchQubits": 20}') as Record<string, unknown>;
    (record.config as unknown as { parameters: unknown }).parameters = parameters;

    const detail = toRunDetail(record);

    expect(Object.hasOwn(detail.settings.parameters, "__proto__")).toBe(true);
    expect(detail.settings.parameters).toEqual(
      JSON.parse('{"__proto__": 3, "searchQubits": 20}'),
    );
  });
});
