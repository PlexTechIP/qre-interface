// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { createInitialFormState, type FormState } from "../state/formState";
import { formContextFromState } from "./formContext";

const fresh = (): FormState => createInitialFormState();

const fieldsOf = (state: FormState): string[] =>
  formContextFromState(state).map((entry) => entry.field);

const valueOf = (state: FormState, field: string): string | undefined =>
  formContextFromState(state).find((entry) => entry.field === field)?.value;

describe("formContextFromState", () => {
  /**
   * The load-bearing case. Sending an untouched form would tell the model every
   * default was a deliberate choice — which is the one instruction that stops
   * it proposing anything at all.
   */
  it("says nothing about a form nobody has touched", () => {
    expect(formContextFromState(fresh())).toEqual([]);
  });

  it("reports a name the analyst typed", () => {
    const state = { ...fresh(), name: "  Shor at scale  " };

    expect(valueOf(state, "name")).toBe("Shor at scale");
  });

  it("ignores a name that is only whitespace", () => {
    expect(fieldsOf({ ...fresh(), name: "   " })).toEqual([]);
  });

  /** Addressed by schema path, so no translation is needed at either end. */
  it("names fields the way the generation contract does", () => {
    const state = fresh();
    state.architecture.gateBased.gateTime = 80;
    state.maxError = 0.01;

    expect(fieldsOf(state)).toEqual(
      expect.arrayContaining(["architecture.gateTime", "maxError"]),
    );
  });

  it("reports a changed architecture and the values set under it", () => {
    const state = fresh();
    state.architecture.type = "majorana";
    state.architecture.majorana.errorRate = 1e-6;

    expect(valueOf(state, "architecture.type")).toBe("majorana");
    expect(valueOf(state, "architecture.errorRate")).toBe("0.000001");
  });

  /**
   * A null control is unset, not chosen. Reporting it would ask the model to
   * preserve an emptiness the analyst never expressed — and there is no way to
   * express one in the draft it would send back.
   */
  it("does not report a control that is simply empty", () => {
    const state = fresh();
    state.architecture.gateBased.gateTime = null;
    state.maxError = null;

    expect(fieldsOf(state)).not.toContain("architecture.gateTime");
    expect(fieldsOf(state)).not.toContain("maxError");
  });

  it("reports a benchmark chosen away from the default", () => {
    const state = fresh();
    // Not `shors-factoring` — that is the default, so choosing it is not a
    // choice the model needs to be told about.
    state.application.benchmarkId = "grovers-search";

    expect(valueOf(state, "application.benchmarkId")).toBe("grovers-search");
  });

  it("reports manual counts as the analyst entered them", () => {
    const state = fresh();
    state.application.type = "manualCounts";
    state.application.manualCounts.numQubits = 120;

    expect(valueOf(state, "application.type")).toBe("manualCounts");
    expect(valueOf(state, "application.numQubits")).toBe("120");
  });

  /**
   * Uploaded and saved programs are outside the generation contract on purpose,
   * so describing one here would tell the model about a configuration it has no
   * way to propose back.
   */
  it("says nothing about an application shape a draft cannot express", () => {
    const state = fresh();
    state.application.type = "uploaded";
    state.application.upload.filePath = "/tmp/program.qs";

    expect(formContextFromState(state)).toEqual([]);
  });

  it("reports factory and pipeline choices", () => {
    const state = fresh();
    state.secondaryFactories = ["gsj24_ccx"];
    state.memoryOptimization = "yoked_2d";
    state.traceTransform.tStatesPerRotation = 12;
    state.traceTransform.ccxMagicStates = true;

    expect(fieldsOf(state)).toEqual(
      expect.arrayContaining([
        "secondaryFactories",
        "memoryOptimization",
        "traceTransform.tStatesPerRotation",
        "traceTransform.ccxMagicStates",
      ]),
    );
  });

  /** Multi-selects are sets; the order they were clicked in is not a decision. */
  it("does not report a reordered multi-select as a change", () => {
    const state = fresh();
    state.magicStateFactories = [...state.magicStateFactories].reverse();

    expect(fieldsOf(state)).not.toContain("magicStateFactories");
  });

  /** Empty already IS the default for secondaries, so it is not a decision. */
  it("stays silent about a multi-select left at its default", () => {
    const state = { ...fresh(), secondaryFactories: [] as FormState["secondaryFactories"] };

    expect(fieldsOf(state)).not.toContain("secondaryFactories");
  });

  /** Clearing a default-populated multi-select IS a decision, and is reported. */
  it("reports a multi-select the analyst emptied", () => {
    const state = { ...fresh(), magicStateFactories: [] as FormState["magicStateFactories"] };

    expect(valueOf(state, "magicStateFactories")).toBe("");
  });

  it("is a value, never a UI object", () => {
    const state = fresh();
    state.architecture.gateBased.gateTime = 80;

    for (const entry of formContextFromState(state)) {
      expect(typeof entry.field).toBe("string");
      expect(typeof entry.value).toBe("string");
      expect(entry.value).not.toContain("[object");
    }
  });
});
