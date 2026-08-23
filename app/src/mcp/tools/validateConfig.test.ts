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

/**
 * The two ways this tool used to answer a question it had not been asked.
 *
 * Both were found by driving hand-built drafts through a real client rather
 * than drafts the app itself had produced — the app's own drafts are already
 * self-consistent, so they never exercise a repair.
 */
describe("a draft the pipeline would quietly change", () => {
  it("does not call an empty factory set valid", async () => {
    // normalizeFormState falls back to ["round_based"] rather than leaving the
    // set empty. That is right for the chat path and wrong here: the answer
    // would be about a run the caller did not describe.
    const draft = { ...BENCHMARK_DRAFT(), magicStateFactories: [] };

    const result = asData(await handleValidateConfig({ draft }));

    expect(result.valid).toBe(false);
    const item = result.errors.find((e) => e.field === "magicStateFactories");
    expect(item?.source).toBe("coupling");
    // And says what it would have run as, not merely that something changed.
    expect(item?.message).toContain("round_based");
  });

  it("does not call another benchmark's parameters valid", async () => {
    // The generation schema's `parameters` is an anyOf over per-benchmark
    // variants, so quantum-dynamics values are structurally fine — they are
    // just not this benchmark's, and the adapter replaces them with Shor's
    // DEFAULTS. Answering `valid: true` there describes a different run.
    const draft = {
      ...BENCHMARK_DRAFT(),
      parameters: {
        latticeN1: 4,
        latticeN2: 4,
        totalTime: 1,
        trotterStep: 0.1,
        couplingJ: 1,
        fieldG: 1,
      },
    } as unknown as GeneratedRunDraft;

    const result = asData(await handleValidateConfig({ draft }));

    expect(result.valid).toBe(false);
    const item = result.errors.find((e) => e.field === "parameters");
    expect(item?.source).toBe("coupling");
    expect(item?.message).toContain("bitSize");
  });

  it("still accepts a draft the pipeline does not change", async () => {
    // The round trip has to be stable, or every valid draft reports a repair.
    const result = asData(await handleValidateConfig({ draft: BENCHMARK_DRAFT() }));

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

describe("a benchmark parameter the form rejects", () => {
  it("says which parameter and why", async () => {
    // FieldErrors carries a string per field EXCEPT hyperparams, which is a
    // HyperparamError[]. A uniform String(message) rendered every one of these
    // as the literal text "[object Object]".
    const draft = {
      ...BENCHMARK_DRAFT(),
      parameters: { bitSize: 99999, generator: 11 },
    } as unknown as GeneratedRunDraft;

    const result = asData(await handleValidateConfig({ draft }));

    expect(result.valid).toBe(false);
    for (const error of result.errors) {
      expect(error.message).not.toContain("[object Object]");
    }
    const item = result.errors.find((e) => e.source === "form");
    expect(item?.message).toMatch(/8192/);
    // Keyed by the parameter itself, so the item names the field to change.
    expect(item?.field).toBe("bitSize");
  });
});

describe("a spelling the contract calls equivalent", () => {
  it("does not report a blank name as a substitution", async () => {
    // The generation schema documents `name` as "Use null to let the app
    // generate one", and RunConfig as "auto-derived when the user leaves it
    // blank". The adapter's `state.name || null` is therefore spelling, not a
    // repair — but the round trip compares written forms, and reported it as
    // one: an empty name was answered `valid: false` with "The run would use
    // null instead of \"\"" for a draft the app runs happily.
    const result = asData(
      await handleValidateConfig({ draft: { ...BENCHMARK_DRAFT(), name: "" } }),
    );

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("still accepts an explicitly null name", async () => {
    const result = asData(
      await handleValidateConfig({ draft: { ...BENCHMARK_DRAFT(), name: null } }),
    );

    expect(result.valid).toBe(true);
  });

  it("still reports a name the pipeline actually changed", async () => {
    // The fold is one equivalence, not a licence to ignore the field.
    const draft = BENCHMARK_DRAFT();
    const result = asData(
      await handleValidateConfig({ draft: { ...draft, magicStateFactories: [] } }),
    );

    expect(result.valid).toBe(false);
  });
});
