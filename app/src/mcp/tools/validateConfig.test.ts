// @vitest-environment node

/**
 * `qre_validate_config` tells an agent whether a draft would run, so the only
 * thing that makes it worth having is agreeing with the app. It therefore walks
 * the same seam the Run button walks — committed generation schema, the one
 * draft adapter, `normalizeFormState`, `validateForm`, `toRunConfig`,
 * `validateRunConfigSchema` — and states no rule of its own.
 */

import { describe, expect, it } from "vitest";

import {
  handleValidateConfig,
  type ValidateConfigOutput,
} from "./validateConfig.js";
import { generatedDraftFromFormState } from "../../renderer/state/generatedDraft.js";
import { formStateFromRunConfig } from "../../renderer/state/formState.js";
import { buildRunConfig } from "../../shared/testing/builders.js";
import type { GeneratedRunDraft } from "../../shared/agentTypes.js";

function asData(
  result: Awaited<ReturnType<typeof handleValidateConfig>>,
): ValidateConfigOutput {
  expect(result.isError).toBeFalsy();
  return result.structuredContent as unknown as ValidateConfigOutput;
}

/** A draft the app itself would produce, for the given config. */
function draftFor(config: Parameters<typeof formStateFromRunConfig>[0]): GeneratedRunDraft {
  return generatedDraftFromFormState(formStateFromRunConfig(config));
}

const BENCHMARK_DRAFT = (): GeneratedRunDraft =>
  draftFor(
    buildRunConfig({
      name: "Shor",
      application: { type: "benchmark", benchmarkId: "shors-factoring" },
    }),
  );

const MANUAL_COUNTS_DRAFT = (): GeneratedRunDraft =>
  draftFor(
    buildRunConfig({
      name: "Manual",
      application: {
        type: "manualCounts",
        numQubits: 50,
        tCount: 100,
        rotationCount: 200,
        rotationDepth: 50,
        cczCount: 10,
        ccixCount: 5,
        measurementCount: 50,
      },
    }),
  );

describe("qre_validate_config", () => {
  it("accepts a draft the app would run", async () => {
    const data = asData(
      await handleValidateConfig({ draft: BENCHMARK_DRAFT() }),
    );

    expect(data.errors).toEqual([]);
    expect(data.valid).toBe(true);
  });

  it("accepts a manual-counts draft", async () => {
    // The case that used to fail: the contract's `parameters` has a `none`
    // variant for runs with no benchmark parameters, and a draft that omitted
    // the sentinel matched no variant at all.
    const data = asData(
      await handleValidateConfig({ draft: MANUAL_COUNTS_DRAFT() }),
    );

    expect(data.errors).toEqual([]);
    expect(data.valid).toBe(true);
  });

  it("agrees with qre_draft_from_run about every run the app can draft", async () => {
    // The whole point of the tool. If these two disagree, an agent is told its
    // own draft is invalid.
    for (const config of [
      buildRunConfig({
        application: { type: "benchmark", benchmarkId: "grovers-search" },
      }),
      buildRunConfig({
        application: { type: "benchmark", benchmarkId: "quantum-dynamics" },
        architecture: { type: "majorana", errorRate: 0.00001, operationTime: 1000 },
        qecCode: "three_aux",
      }),
      buildRunConfig({
        application: {
          type: "manualCounts",
          numQubits: 10,
          tCount: 20,
          rotationCount: 0,
          rotationDepth: 0,
          cczCount: 0,
          ccixCount: 0,
          measurementCount: 5,
        },
      }),
    ]) {
      const data = asData(
        await handleValidateConfig({ draft: draftFor(config) }),
      );

      expect(data.valid, JSON.stringify(data.errors)).toBe(true);
    }
  });

  it("reports a structurally impossible draft rather than throwing", async () => {
    const draft = {
      ...BENCHMARK_DRAFT(),
      architecture: { type: "gateBased", errorRate: "not a number" },
    } as unknown as GeneratedRunDraft;

    const data = asData(await handleValidateConfig({ draft }));

    expect(data.valid).toBe(false);
    expect(data.errors[0]?.source).toBe("structure");
  });

  it("names the field a schema error is about", async () => {
    // Ajv reports JSON Pointer instance paths; parsing its rendered text with
    // a `data.field` regex matched nothing, so every schema error came back
    // labelled "schema" — on the one error source whose whole value is saying
    // which field is wrong.
    const draft = { ...BENCHMARK_DRAFT(), maxError: 5 } as GeneratedRunDraft;

    const data = asData(await handleValidateConfig({ draft }));

    expect(data.valid).toBe(false);
    expect(data.errors.map((error) => error.field)).toContain("maxError");
  });

  it("rejects a factory the architecture forbids", async () => {
    const draft = {
      ...BENCHMARK_DRAFT(),
      architecture: { type: "majorana", errorRate: 0.00001, operationTime: 1000 },
      secondaryFactories: ["magic_up_to_clifford"],
    } as unknown as GeneratedRunDraft;

    const data = asData(await handleValidateConfig({ draft }));

    expect(data.valid).toBe(false);
    expect(data.errors.map((error) => error.field)).toContain(
      "secondaryFactories",
    );
  });

  it("writes nothing, whatever it is given", async () => {
    // No run store is configured at all: a tool that persisted anything would
    // have to reach for one, and would fail loudly here.
    const saved = process.env.QRE_DB_PATH;
    delete process.env.QRE_DB_PATH;
    try {
      const data = asData(
        await handleValidateConfig({ draft: BENCHMARK_DRAFT() }),
      );

      expect(data.valid).toBe(true);
    } finally {
      if (saved !== undefined) process.env.QRE_DB_PATH = saved;
    }
  });
});
