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
    traceTransform: { tStatesPerRotation: 18, ccxMagicStates: false },
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

  /**
   * Unmemory, Dynamic Memory Compute and the pinned slow-down factor used to be
   * proposable and then refused here. They were removed from the generation
   * schema entirely, which is stronger — the model can no longer spend a draft
   * on them — so those refusal tests moved to the drift test, which asserts the
   * schema cannot express them. Memory Optimization is the one that remains: it
   * is still generated, pinned to "none", and guarded here.
   */
  it("blocks a yoked memory optimization instead of applying it invisibly", () => {
    const proposal = gateBasedDraft();
    // The cast defends the wire: the model's reply is not re-validated against
    // the generation schema on the way in, so the pinned enum is not a
    // guarantee at this boundary.
    (proposal as { memoryOptimization: string }).memoryOptimization = "yoked_2d";

    const result = draftToFormState(proposal, "provider/model");
    expect(result).toEqual({
      ok: false,
      message: expect.stringContaining("Memory Optimization"),
    });
  });

  /**
   * `parameters` is now one variant per benchmark rather than every key with
   * the irrelevant ones nulled, so the consumer can be handed a variant that
   * does not match the benchmark the model chose.
   */
  it("takes only the selected benchmark's parameters from the proposal", () => {
    const proposal = gateBasedDraft();
    proposal.parameters = { searchQubits: 42 };

    const result = draftToFormState(proposal, "provider/model");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.handoff.state.application.hyperparams["grovers-search"]?.searchQubits,
    ).toBe(42);
  });

  it("falls back to form defaults when the variant is for another benchmark", () => {
    const initial = createInitialFormState();
    const proposal = gateBasedDraft();
    // Shor's variant against a Grover application: nothing to take, and
    // taking the wrong values would be far worse than taking none.
    proposal.parameters = { bitSize: 2048, generator: 7 };

    const result = draftToFormState(proposal, "provider/model");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.handoff.state.application.hyperparams["grovers-search"]).toEqual(
      initial.application.hyperparams["grovers-search"],
    );
  });

  it("ignores the no-parameters variant's marker rather than storing it", () => {
    const initial = createInitialFormState();
    const proposal = gateBasedDraft();
    proposal.parameters = { none: true };

    const result = draftToFormState(proposal, "provider/model");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const params = result.handoff.state.application.hyperparams["grovers-search"];
    expect(params).toEqual(initial.application.hyperparams["grovers-search"]);
    expect(params).not.toHaveProperty("none");
  });

  it("leaves the pipeline stages the draft no longer carries at form defaults", () => {
    // Dynamic Memory Compute, Unmemory and the slow-down factor are no longer
    // proposable, so a draft must land with exactly what the analyst would see
    // having never touched the pipeline.
    const initial = createInitialFormState();
    const result = draftToFormState(gateBasedDraft(), "provider/model");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { traceTransform } = result.handoff.state;
    expect(traceTransform.dynamicMemoryCompute).toBe(
      initial.traceTransform.dynamicMemoryCompute,
    );
    expect(traceTransform.unmemory).toBe(initial.traceTransform.unmemory);
    expect(traceTransform.slowDownFactor).toBe(initial.traceTransform.slowDownFactor);
    // …while the two that ARE proposable still come from the draft.
    expect(traceTransform.tStatesPerRotation).toBe(18);
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

  /**
   * The refusal list is only half the guarantee. These cover the other half —
   * the fields that reach the form UNGUARDED — because every defect this
   * mapping has shipped so far has been in something copied straight through
   * rather than in something explicitly refused.
   */
  describe("fields carried straight into the form", () => {
    /**
     * Memory Optimization is in the lowered schema's enum, but its control is
     * DISABLED. Applying a proposed yoked code would leave the analyst looking
     * at a field they cannot change — a review step that is present but
     * powerless — and week 5 wired the value through to `build_isa_query`, so
     * it is no longer inert on the way to the engine either.
     */
    for (const optimization of ["yoked_1d", "yoked_2d"] as const) {
      it(`refuses ${optimization}, which the form cannot unset`, () => {
        const proposal = gateBasedDraft();
        proposal.memoryOptimization = optimization;
        expect(draftToFormState(proposal, "provider/model")).toEqual({
          ok: false,
          message: expect.stringContaining("Memory Optimization"),
        });
      });
    }

    it('accepts the "none" every well-behaved draft sends', () => {
      const result = draftToFormState(gateBasedDraft(), "provider/model");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.handoff.state.memoryOptimization).toBe("none");
    });

    /**
     * The generation schema declares no `minItems` (bounds are prose in the
     * strict-output subset), so an empty set is schema-valid model output. It
     * must not survive into the form: the checkbox group would render with
     * nothing checked while `toRunConfig` silently substituted round_based,
     * saving a factory the analyst was never shown.
     */
    it("normalizes an empty factory set rather than showing none selected", () => {
      const proposal = gateBasedDraft();
      proposal.magicStateFactories = [];
      const result = draftToFormState(proposal, "provider/model");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.handoff.state.magicStateFactories).toEqual(["round_based"]);
    });

    it("normalizes a factory set this architecture disallows", () => {
      const proposal = gateBasedDraft();
      // Litinski19 needs Error Rate <= 1e-3; this draft raises it past that.
      proposal.architecture = {
        type: "gateBased",
        errorRate: 0.005,
        gateTime: 50,
        measurementTime: 100,
        twoQubitGateTime: null,
      };
      proposal.magicStateFactories = ["litinski19"];
      const result = draftToFormState(proposal, "provider/model");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.handoff.state.magicStateFactories).toEqual(["round_based"]);
    });

    it("carries a proposed secondary factory through to the form", () => {
      const proposal = gateBasedDraft();
      proposal.secondaryFactories = ["gsj24_ccx"];
      const result = draftToFormState(proposal, "provider/model");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.handoff.state.secondaryFactories).toEqual(["gsj24_ccx"]);
    });

    it("drops a secondary factory Majorana forbids instead of proposing it", () => {
      const proposal = gateBasedDraft();
      proposal.architecture = {
        type: "majorana",
        errorRate: 0.00001,
        operationTime: 1000,
      };
      proposal.secondaryFactories = ["magic_up_to_clifford"];
      const result = draftToFormState(proposal, "provider/model");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.handoff.state.secondaryFactories).toEqual([]);
    });
  });
});
