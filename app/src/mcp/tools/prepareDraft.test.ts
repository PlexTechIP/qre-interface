// @vitest-environment node

/**
 * The shared walk, tested for what the RUN tool needs from it.
 *
 * `validateConfig.test.ts` is the behavioural pin on what the walk decides;
 * this file is about the extra things `qre_run_estimate` reads — which stage
 * refused, and the `runConfig` it would execute — because those are invisible
 * through the validate tool's `{ valid, errors }`.
 */

import { describe, expect, it } from "vitest";

import { prepareDraft, unexplainedChanges } from "./prepareDraft.js";
import { generatedDraftFromFormState } from "../../renderer/state/generatedDraft.js";
import { formStateFromRunConfig } from "../../renderer/state/formState.js";
import { buildRunConfig } from "../../shared/testing/builders.js";
import type { GeneratedRunDraft } from "../../shared/agentTypes.js";

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

const MAJORANA_DRAFT = (): GeneratedRunDraft =>
  draftFor(
    buildRunConfig({
      name: "Majorana",
      application: { type: "benchmark", benchmarkId: "shors-factoring" },
      architecture: { type: "majorana", errorRate: 1e-5, operationTime: 1000 },
      qecCode: "three_aux",
      magicStateFactories: ["round_based"],
    }),
  );

describe("prepareDraft", () => {
  it("accepts a draft the app would run", () => {
    const prepared = prepareDraft(BENCHMARK_DRAFT());

    expect(prepared.ok).toBe(true);
    expect(prepared.errors).toEqual([]);
    if (!prepared.ok) throw new Error("expected ok");
    expect(prepared.runConfig.application).toEqual({
      type: "benchmark",
      benchmarkId: "shors-factoring",
    });
  });

  it("treats a blank name as the spelling the contract calls equivalent", () => {
    const prepared = prepareDraft({ ...BENCHMARK_DRAFT(), name: "" });

    expect(prepared.ok).toBe(true);
  });

  it("stops at the coupling stage, reporting only coupling items", () => {
    // A forbidden factory is a refusal, not a validation: the stages after it
    // would describe a configuration nobody asked for.
    const prepared = prepareDraft({
      ...MAJORANA_DRAFT(),
      magicStateFactories: ["litinski19"],
    });

    expect(prepared.ok).toBe(false);
    if (prepared.ok) throw new Error("expected a refusal");
    expect(prepared.stage).toBe("coupling");
    expect(prepared.errors.every((error) => error.source === "coupling")).toBe(true);
    expect(prepared.errors[0]?.message).toContain("litinski19");
  });

  it("names the size stage for a draft too large to be worth reading", () => {
    const prepared = prepareDraft({
      ...BENCHMARK_DRAFT(),
      padding: "x".repeat(40 * 1024),
    });

    expect(prepared.ok).toBe(false);
    if (prepared.ok) throw new Error("expected a refusal");
    expect(prepared.stage).toBe("size");
  });

  it("names the structure stage for something that is not a draft", () => {
    const prepared = prepareDraft({ hello: "world" });

    expect(prepared.ok).toBe(false);
    if (prepared.ok) throw new Error("expected a refusal");
    expect(prepared.stage).toBe("structure");
  });

  it("names the form stage for a hyperparameter out of range", () => {
    const draft = BENCHMARK_DRAFT();
    const prepared = prepareDraft({
      ...draft,
      parameters: { ...draft.parameters, bitSize: 999_999 },
    });

    expect(prepared.ok).toBe(false);
    if (prepared.ok) throw new Error("expected a refusal");
    expect(prepared.stage).toBe("form");
  });

  it("puts the caller's provenance on the config it would run, and nothing when none", () => {
    const withProvenance = prepareDraft(BENCHMARK_DRAFT(), {
      provenance: { authoredBy: "model_assisted" },
    });
    if (!withProvenance.ok) throw new Error("expected ok");
    expect(withProvenance.runConfig.provenance).toEqual({
      authoredBy: "model_assisted",
    });

    const without = prepareDraft(BENCHMARK_DRAFT());
    if (!without.ok) throw new Error("expected ok");
    expect(without.runConfig.provenance).toBeUndefined();
  });
});

describe("the round-trip backstop", () => {
  /**
   * Driven directly rather than through a draft, because no draft reaches it:
   * every substitution today's adapters make is already named by a check above
   * it, which is what the module comment says and what a fixture here would
   * quietly stop testing the first time that changed.
   */
  it("reports what the run would use instead, for a field nothing named", () => {
    const draft = BENCHMARK_DRAFT();
    const state = formStateFromRunConfig(buildRunConfig({ name: "Shor" }));

    const changed = unexplainedChanges(
      { ...draft, maxError: 0.5 },
      state,
      new Set<string>(),
    );

    const item = changed.find((error) => error.field === "maxError");
    expect(item?.source).toBe("coupling");
    expect(item?.message).toMatch(/would use .* instead of/);
  });

  it("says nothing about a field a named check already explained", () => {
    const draft = BENCHMARK_DRAFT();
    const state = formStateFromRunConfig(buildRunConfig({ name: "Shor" }));

    const changed = unexplainedChanges(
      { ...draft, maxError: 0.5 },
      state,
      new Set(["maxError"]),
    );

    expect(changed.find((error) => error.field === "maxError")).toBeUndefined();
  });
});
