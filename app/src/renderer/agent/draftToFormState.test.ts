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
    const result = draftToFormState(gateBasedDraft(), "provider/model", "c-1");
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

    const result = draftToFormState(proposal, "provider/model", "c-1");
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

    const result = draftToFormState(proposal, "provider/model", "c-1");
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

    const result = draftToFormState(proposal, "provider/model", "c-1");
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

    const result = draftToFormState(proposal, "provider/model", "c-1");
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
    const result = draftToFormState(gateBasedDraft(), "provider/model", "c-1");

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
    const result = draftToFormState(gateBasedDraft(), "provider/model", "c-1");
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
    const result = draftToFormState(gateBasedDraft(), "provider/model", "c-1");
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
        expect(draftToFormState(proposal, "provider/model", "c-1")).toEqual({
          ok: false,
          message: expect.stringContaining("Memory Optimization"),
        });
      });
    }

    it('accepts the "none" every well-behaved draft sends', () => {
      const result = draftToFormState(gateBasedDraft(), "provider/model", "c-1");
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
      const result = draftToFormState(proposal, "provider/model", "c-1");
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
      const result = draftToFormState(proposal, "provider/model", "c-1");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.handoff.state.magicStateFactories).toEqual(["round_based"]);
    });

    it("carries a proposed secondary factory through to the form", () => {
      const proposal = gateBasedDraft();
      proposal.secondaryFactories = ["gsj24_ccx"];
      const result = draftToFormState(proposal, "provider/model", "c-1");
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
      const result = draftToFormState(proposal, "provider/model", "c-1");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.handoff.state.secondaryFactories).toEqual([]);
    });
  });
});

/**
 * The review step is only honest if the analyst can see WHICH of the form's
 * ~40 fields the model chose. A proposal arrives as a fully-populated form, so
 * without this the analyst is asked to approve a screen of numbers with no way
 * to tell a model's decision from a default it never mentioned.
 *
 * The mapping reports what it wrote; it does not diff the result against the
 * defaults. That distinction is the whole point — a diff calls the model's
 * deliberate 20 T-states-per-rotation "a default", because 20 IS the default.
 */
describe("draftToFormState reports what the model actually chose", () => {
  const proposalOf = (draft: GeneratedRunDraft) => {
    const result = draftToFormState(draft, "provider/model", "c-1");
    if (!result.ok) throw new Error(result.message);
    return result.handoff.proposed;
  };

  const labelled = (draft: GeneratedRunDraft) =>
    Object.fromEntries(proposalOf(draft).map((field) => [field.label, field.value]));

  it("lists each value it carried into the form, with the control's own label", () => {
    expect(labelled(gateBasedDraft())).toMatchObject({
      "Run name": "Editable proposal",
      "Application Type": "Benchmark",
      Benchmark: "Grover's Search",
      "Search Qubits": "24",
      Architecture: "Superconducting",
      "Error rate": "0.0001",
      "Gate time": "50",
      "Measurement time": "100",
      "Magic State Factory": "Round-Based",
      "T Count Per Rotation": "18",
      "CCX Magic States": "Off",
      "Total Fault Tolerant Execution Error": "0.25",
    });
  });

  it("reports a chosen value even when it equals the form's default", () => {
    const draft = gateBasedDraft();
    draft.traceTransform.tStatesPerRotation = 20; // the form's default
    draft.maxError = 1; // the form's default

    // A diff would drop both and tell the analyst the model said nothing about
    // the error budget. It picked one, and it happens to be the default.
    expect(labelled(draft)).toMatchObject({
      "T Count Per Rotation": "20",
      "Total Fault Tolerant Execution Error": "1",
    });
  });

  it("omits the fields the model declined to choose", () => {
    const draft = gateBasedDraft();
    draft.name = null;
    // `twoQubitGateTime` is already null on the base draft — required-and-
    // nullable is how the generation schema spells "the model may decline".
    draft.magicStateFactories = [];
    draft.secondaryFactories = [];

    const labels = proposalOf(draft).map((field) => field.label);

    // A null in a required-nullable field is the schema's "no opinion", and an
    // empty factory set is replaced by the form's round_based default — neither
    // is a choice, so neither may be presented as one.
    expect(labels).not.toContain("Run name");
    expect(labels).not.toContain("Two-qubit gate time");
    expect(labels).not.toContain("Magic State Factory");
  });

  it("points every entry at a control the analyst can jump to", () => {
    for (const field of proposalOf(gateBasedDraft())) {
      expect(field.anchors.length).toBeGreaterThan(0);
    }
  });

  it("describes the other architecture's fields when the model picks it", () => {
    const draft = gateBasedDraft();
    draft.architecture = { type: "majorana", errorRate: 0.000001, operationTime: 800 };

    expect(labelled(draft)).toMatchObject({
      Architecture: "Majorana",
      "Error rate": "0.000001",
      "Operation time": "800",
    });
  });

  /**
   * The widest variant: twelve architecture fields, every one of them
   * generated. If a generated field is ever mapped into the form without being
   * reported, the analyst is back to approving a value nobody told them about.
   */
  it("leaves none of a Neutral Atom proposal's twelve fields unreported", () => {
    const draft = gateBasedDraft();
    draft.architecture = {
      type: "neutralAtom",
      rydbergTime: 400,
      rydbergError: 0.002,
      singleQubitTime: 900,
      singleQubitError: 0.0002,
      measurementTime: 9000,
      measurementError: 0.0003,
      handoffTime: 5,
      atomSpacing: 3.5,
      maxVelocity: 0.3,
      maxAcceleration: 4000,
      surfaceCodeOneQubitTimeFactor: 2,
      surfaceCodeTwoQubitTimeFactor: 3,
    };

    expect(labelled(draft)).toMatchObject({
      Architecture: "Neutral Atom",
      "Rydberg time": "400",
      "Rydberg error": "0.002",
      "Single-qubit time": "900",
      "Single-qubit error": "0.0002",
      "Measurement time": "9000",
      "Measurement error": "0.0003",
      "Handoff time": "5",
      "Atom spacing": "3.5",
      "Max velocity": "0.3",
      "Max acceleration": "4000",
      "Surface code 1-qubit time factor": "2",
      "Surface code 2-qubit time factor": "3",
    });
  });

  it("describes manual logical counts rather than a benchmark", () => {
    const draft = gateBasedDraft();
    draft.application = {
      type: "manualCounts",
      numQubits: 12,
      tCount: 30,
      rotationCount: 4,
      rotationDepth: 2,
      cczCount: 1,
      ccixCount: 0,
      measurementCount: 7,
    };

    expect(labelled(draft)).toMatchObject({
      "Application Type": "Manual Logical Counts",
      "Number of qubits": "12",
      "T count": "30",
      "Measurement count": "7",
    });
    expect(proposalOf(draft).map((field) => field.label)).not.toContain("Benchmark");
  });
});
