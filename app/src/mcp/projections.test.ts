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
