// @vitest-environment node

/**
 * The settings a run detail reports.
 *
 * These exist because "why did this run fail?" had no answer. Every failure in a
 * real history carried the same message — `the estimator found no feasible
 * Pareto frontier point; relax maxError or adjust the model` — which names the
 * field to relax, while nothing in the surface could say what that field had
 * been set to. The only other tool carrying configuration is
 * `qre_draft_from_run`, and it refuses exactly the runs whose settings a draft
 * cannot express, so the most unusual configurations were the least reportable.
 *
 * The subtler test below is the nesting one. The first version of this
 * projection collapsed any nested object to `null`, which for
 * `dynamicMemoryCompute` is not an omission but a reversal: `null` there means
 * the stage is OFF. It reported "off" for a run that was refused a draft
 * *because* that stage was on.
 */

import { describe, expect, it } from "vitest";

import { toRunDetail } from "./projections.js";
import { buildRunRecord } from "../shared/testing/builders.js";
import type { RunRecord } from "../shared/types.js";

const settingsOf = (overrides: Partial<RunRecord["config"]> = {}) =>
  toRunDetail(buildRunRecord({ config: overrides })).settings;

describe("the settings on a run detail", () => {
  it("reports the error budget the run asked for", () => {
    expect(settingsOf({ maxError: 1e-8 }).maxError).toBe(1e-8);
  });

  it("distinguishes a stage that is off from one that is on", () => {
    const off = settingsOf({
      traceTransform: { tStatesPerRotation: 20, ccxMagicStates: false, slowDownFactor: 1 },
    });
    const on = settingsOf({
      traceTransform: {
        tStatesPerRotation: 20,
        ccxMagicStates: false,
        slowDownFactor: 1,
        dynamicMemoryCompute: {
          computeCapacityPercentage: 0.5,
          evictionStrategy: "least_recently_used",
        },
      },
    });

    // Off: absent or null, and nothing claiming a capacity.
    expect(off.traceTransform["dynamicMemoryCompute.computeCapacityPercentage"]).toBeUndefined();
    // On: the settings are carried, not collapsed into the value that means off.
    expect(on.traceTransform["dynamicMemoryCompute.computeCapacityPercentage"]).toBe(0.5);
    expect(on.traceTransform["dynamicMemoryCompute.evictionStrategy"]).toBe(
      "least_recently_used",
    );
  });

  it("carries the architecture's own fields without repeating its type", () => {
    const settings = settingsOf({
      architecture: { type: "majorana", errorRate: 1e-5, operationTime: 1000 },
    });

    expect(settings.architecture).toEqual({ errorRate: 1e-5, operationTime: 1000 });
    // The discriminator is already reported at the top of the detail.
    expect(settings.architecture.type).toBeUndefined();
  });

  it("defaults an absent memoryOptimization to none rather than empty", () => {
    // RunConfig documents omitted as equivalent to "none"; an empty string
    // would make an agent guess.
    expect(settingsOf().memoryOptimization).toBe("none");
  });

  it("reports no factories as an empty list, not a missing field", () => {
    expect(settingsOf().secondaryFactories).toEqual([]);
  });

  it("never carries an uploaded program's file path", () => {
    const detail = toRunDetail(
      buildRunRecord({
        config: {
          application: {
            type: "uploaded",
            filePath: "/Users/analyst/secret/shor.qs",
            format: "qsharp",
            addToLibrary: false,
          },
        },
      }),
    );

    const everything = JSON.stringify(detail);
    expect(everything).not.toContain("/Users/analyst");
    expect(everything).not.toContain("shor.qs");
  });

  it("bounds a value the engine or a future contract controls the length of", () => {
    const settings = settingsOf({
      qecCode: "q".repeat(500) as never,
      parameters: { latticeN1: "p".repeat(500) } as never,
    });

    expect([...settings.qecCode].length).toBeLessThanOrEqual(100);
    expect([...String(settings.parameters.latticeN1)].length).toBeLessThanOrEqual(100);
  });

  it("stays bounded against a pathologically deep or wide group", () => {
    const wide: Record<string, unknown> = {};
    for (let i = 0; i < 500; i++) wide[`field${i}`] = i;
    let deep: unknown = "bottom";
    for (let i = 0; i < 40; i++) deep = { down: deep };

    const settings = settingsOf({
      parameters: { ...wide, nested: deep } as never,
    });

    expect(Object.keys(settings.parameters).length).toBeLessThanOrEqual(32);
    for (const key of Object.keys(settings.parameters)) {
      expect([...key].length).toBeLessThanOrEqual(100);
    }
  });
});
