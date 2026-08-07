import { describe, expect, it } from "vitest";

import type { GeneratedRunDraft } from "../../shared/agentTypes";
import { createInitialFormState } from "../state/formState";
import { draftToFormState } from "./draftToFormState";

function gateBasedDraft(): GeneratedRunDraft {
  return {
    name: "Editable proposal",
    application: { type: "benchmark", benchmarkId: "grovers-search" },
    architecture: {
      type: "gateBased",
      errorRate: 0.0001,
      gateTime: 50,
      measurementTime: 100,
      twoQubitGateTime: null,
    },
    magicStateFactories: ["round_based"],
    secondaryFactories: [],
    memoryOptimization: "none",
    parameters: { searchQubits: 24 },
    traceTransform: {
      tStatesPerRotation: 18,
      ccxMagicStates: false,
      slowDownFactor: 1,
      dynamicMemoryCompute: null,
      unmemory: false,
    },
    maxError: 0.25,
  };
}

describe("draftToFormState", () => {
  it("maps model-owned values into an unstamped editable FormState", () => {
    const result = draftToFormState(gateBasedDraft(), "provider/model");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.handoff.state.name).toBe("Editable proposal");
    expect(result.handoff.state.architecture.gateBased.gateTime).toBe(50);
    expect(
      result.handoff.state.application.hyperparams["grovers-search"]
        ?.searchQubits,
    ).toBe(24);
    expect(result.handoff.state).not.toHaveProperty("id");
    expect(result.handoff.state).not.toHaveProperty("createdAt");
    expect(result.handoff.provenance).toEqual({
      authoredBy: "model_assisted",
      model: "provider/model",
    });
  });

  it("blocks fields the current form cannot expose instead of dropping them", () => {
    const proposal = gateBasedDraft();
    proposal.traceTransform.unmemory = true;
    const result = draftToFormState(proposal, "provider/model");
    expect(result).toEqual({
      ok: false,
      message: expect.stringContaining("Unmemory"),
    });
  });

  it("refuses a slow-down factor the contract pins to 1", () => {
    const proposal = gateBasedDraft();
    // The cast is the point: `slowDownFactor` is the literal type 1, but this
    // value arrives as JSON from a provider and is not Ajv-checked against the
    // generation schema before it gets here. The guard defends the wire, so the
    // test has to reproduce what the wire can actually carry.
    (proposal.traceTransform as { slowDownFactor: number }).slowDownFactor = 4;
    const result = draftToFormState(proposal, "provider/model");
    expect(result).toEqual({
      ok: false,
      message: expect.stringContaining("Slow Down Factor"),
    });
  });

  /**
   * Regression: the mapping used to build each architecture sub-form and the
   * trace transform as WHOLE objects rather than spreads, so every field Team 3
   * added to FormState in v1.4.0 silently vanished from a model-assisted draft.
   * The visible symptom was a crash — validateForm reads through
   * `traceTransform.dynamicMemoryCompute`, which was undefined rather than null.
   *
   * Asserting against createInitialFormState's own keys rather than a hardcoded
   * list is deliberate: the next field added to the form is covered by this test
   * without anyone remembering to update it.
   */
  it("produces a form draft carrying every field the form requires", () => {
    const initial = createInitialFormState();
    const result = draftToFormState(gateBasedDraft(), "provider/model");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { state } = result.handoff;

    expect(Object.keys(state).sort()).toEqual(Object.keys(initial).sort());
    expect(Object.keys(state.traceTransform).sort()).toEqual(
      Object.keys(initial.traceTransform).sort(),
    );
    for (const variant of ["gateBased", "majorana", "neutralAtom"] as const) {
      expect(Object.keys(state.architecture[variant]).sort()).toEqual(
        Object.keys(initial.architecture[variant]).sort(),
      );
    }

    // The specific undefined that crashed the form: present, and null (= stage
    // off), never absent.
    expect(state.traceTransform).toHaveProperty("dynamicMemoryCompute");
    expect(state.traceTransform.dynamicMemoryCompute).toBeNull();
    expect(state.traceTransform.unmemory).toBe(false);
  });

  it("keeps the untouched architecture variants at their form defaults", () => {
    const initial = createInitialFormState();
    const result = draftToFormState(gateBasedDraft(), "provider/model");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // The draft is gate-based, so the two v1.4.0 QPU field pairs on the other
    // variants must survive untouched rather than being dropped.
    expect(result.handoff.state.architecture.majorana).toEqual(
      initial.architecture.majorana,
    );
    expect(result.handoff.state.architecture.neutralAtom).toEqual(
      initial.architecture.neutralAtom,
    );
  });
});
