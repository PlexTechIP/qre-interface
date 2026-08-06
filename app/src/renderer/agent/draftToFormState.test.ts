import { describe, expect, it } from "vitest";

import type { GeneratedRunDraft } from "../../shared/agentTypes";
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
});
