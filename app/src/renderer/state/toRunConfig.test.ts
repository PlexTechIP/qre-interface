/**
 * Unit tests for the FormState -> RunConfig serializer.
 *
 * DoD requires these cases: defaults, each input changed, both architecture
 * variants, both transform variants, the upload variant, and invalid states
 * never serializing. Every non-null output is additionally asserted to validate
 * against the committed JSON Schema (the same artifact the MockEngine uses), so
 * these tests prove contract-conformance, not just shape.
 */

import { describe, expect, it } from "vitest";

import { createInitialFormState, type FormState } from "./formState";
import { schemaValidationStamp, toRunConfig, type RunStamp } from "./toRunConfig";
import type { RunProvenance } from "../../shared/types";
import { validateRunConfigSchema } from "./schemaValidation";

const STAMP = schemaValidationStamp();

/** Serialize with a fixed placeholder stamp (id/createdAt don't affect validity). */
function serialize(state: FormState) {
  return toRunConfig(state, STAMP);
}

/** A defaults draft with the two required GateBased times filled — the minimal valid run. */
function validGateBasedDraft(): FormState {
  const s = createInitialFormState();
  s.architecture.gateBased.gateTime = 50;
  s.architecture.gateBased.measurementTime = 100;
  return s;
}

function expectSchemaValid(state: FormState) {
  const config = serialize(state);
  expect(config).not.toBeNull();
  const result = validateRunConfigSchema(config!);
  expect(result.errors).toBe("");
  expect(result.valid).toBe(true);
  return config!;
}

describe("toRunConfig — defaults path", () => {
  it("does NOT serialize a fresh draft (gate/measurement times undefaulted)", () => {
    expect(serialize(createInitialFormState())).toBeNull();
  });

  it("serializes to a schema-valid RunConfig once the two required times are entered", () => {
    const config = expectSchemaValid(validGateBasedDraft());
    // Deliberately a literal, not SCHEMA_VERSION: this assertion exists to fail
    // on a contract bump so someone acknowledges it, rather than tracking the
    // constant silently. Updated for v1.4.0 (additive: optional trace stages,
    // four optional QPU parameters, optional provenance).
    expect(config.schemaVersion).toBe("1.4.0");
    expect(config.application).toEqual({
      type: "benchmark",
      benchmarkId: "shors-factoring",
    });
    expect(config.architecture).toEqual({
      type: "gateBased",
      errorRate: 0.0001,
      gateTime: 50,
      measurementTime: 100,
      twoQubitGateTime: null,
    });
    expect(config.qecCode).toBe("surface_code");
    expect(config.magicStateFactories).toEqual(["round_based"]);
    expect(config.maxError).toBe(1.0);
  });

  it("stamps the provided id/createdAt", () => {
    const config = serialize(validGateBasedDraft());
    expect(config?.id).toBe(STAMP.id);
    expect(config?.createdAt).toBe(STAMP.createdAt);
  });
});

describe("toRunConfig — name generation", () => {
  it("auto-generates a deterministic name when blank", () => {
    const config = serialize(validGateBasedDraft());
    expect(config?.name).toBe(
      "Shor's Factoring · Superconducting · Surface Code · PSSPC 20 T/rot",
    );
  });

  it("uses a trimmed user-provided name when present", () => {
    const s = validGateBasedDraft();
    s.name = "  My custom run  ";
    expect(serialize(s)?.name).toBe("My custom run");
  });
});

describe("toRunConfig — each input changed", () => {
  it("carries the selected benchmark id", () => {
    const s = validGateBasedDraft();
    s.application.benchmarkId = "grovers-search";
    const config = expectSchemaValid(s);
    expect(config.application).toEqual({
      type: "benchmark",
      benchmarkId: "grovers-search",
    });
  });

  it("carries an optional twoQubitGateTime when set", () => {
    const s = validGateBasedDraft();
    s.architecture.gateBased.twoQubitGateTime = 42;
    expect(expectSchemaValid(s).architecture).toMatchObject({
      twoQubitGateTime: 42,
    });
  });

  it("carries a changed maxError (1.0 boundary is valid)", () => {
    const s = validGateBasedDraft();
    s.maxError = 0.001;
    expect(expectSchemaValid(s).maxError).toBe(0.001);
  });

  it("serializes maxError exactly 1.0", () => {
    const s = validGateBasedDraft();
    s.maxError = 1.0;
    expect(expectSchemaValid(s).maxError).toBe(1.0);
  });

  it("carries both pipeline stages' knobs", () => {
    const s = validGateBasedDraft();
    s.traceTransform.tStatesPerRotation = 12;
    s.traceTransform.ccxMagicStates = true;
    expect(expectSchemaValid(s).traceTransform).toEqual({
      tStatesPerRotation: 12,
      ccxMagicStates: true,
      slowDownFactor: 1.0,
    });
  });
});

describe("toRunConfig — architecture variants", () => {
  it("serializes the GateBased variant", () => {
    expect(expectSchemaValid(validGateBasedDraft()).architecture.type).toBe(
      "gateBased",
    );
  });

  it("serializes the Majorana variant with derived Three-Aux QEC", () => {
    const s = createInitialFormState();
    s.architecture.type = "majorana";
    const config = expectSchemaValid(s);
    expect(config.architecture).toEqual({
      type: "majorana",
      errorRate: 0.00001,
      operationTime: 1000,
    });
    expect(config.qecCode).toBe("three_aux");
  });
});

describe("toRunConfig — Majorana cases", () => {
  /** A Majorana draft (operationTime is defaulted, unlike GateBased's times). */
  function majoranaDraft(): FormState {
    const s = createInitialFormState();
    s.architecture.type = "majorana";
    return s;
  }

  // The three error rates the contract allows for Majorana hardware.
  const MAJORANA_ERROR_RATES = [0.0001, 0.00001, 0.000001] as const;
  for (const errorRate of MAJORANA_ERROR_RATES) {
    it(`serializes a schema-valid config at errorRate ${errorRate}`, () => {
      const s = majoranaDraft();
      s.architecture.majorana.errorRate = errorRate;
      const config = expectSchemaValid(s);
      expect(config.architecture).toEqual({
        type: "majorana",
        errorRate,
        operationTime: 1000,
      });
    });
  }

  it("carries a changed operationTime", () => {
    const s = majoranaDraft();
    s.architecture.majorana.operationTime = 250;
    expect(expectSchemaValid(s).architecture).toMatchObject({
      operationTime: 250,
    });
  });

  it("never carries a GateBased-only field (no twoQubitGateTime key)", () => {
    const config = expectSchemaValid(majoranaDraft());
    expect(config.architecture).not.toHaveProperty("twoQubitGateTime");
  });

  it("derives Three-Aux QEC regardless of factory selection", () => {
    const s = majoranaDraft();
    s.magicStateFactories = ["litinski19"]; // not allowed on Majorana
    const config = expectSchemaValid(s);
    expect(config.qecCode).toBe("three_aux");
    expect(config.magicStateFactories).toEqual(["round_based"]);
  });

  it("auto-names a Majorana run with its derived architecture + QEC", () => {
    expect(serialize(majoranaDraft())?.name).toBe(
      "Shor's Factoring · Majorana · Three-Aux · PSSPC 20 T/rot",
    );
  });

  it("serializes Majorana with the full trace pipeline", () => {
    const config = expectSchemaValid(majoranaDraft());
    expect(config.architecture.type).toBe("majorana");
    expect(config.traceTransform).toEqual({
      tStatesPerRotation: 20,
      ccxMagicStates: false,
      slowDownFactor: 1.0,
    });
  });

  it("returns null when operationTime is missing", () => {
    const s = majoranaDraft();
    s.architecture.majorana.operationTime = null;
    expect(serialize(s)).toBeNull();
  });

  it("serializes an out-of-range Majorana errorRate but the schema rejects it", () => {
    const s = majoranaDraft();
    // Structurally complete but not one of the allowed 1e-4/1e-5/1e-6 rates.
    (s.architecture.majorana as { errorRate: number }).errorRate = 0.5;
    const config = serialize(s);
    expect(config).not.toBeNull();
    expect(validateRunConfigSchema(config!).valid).toBe(false);
  });
});

describe("toRunConfig - the trace transform is one pipeline", () => {
  it("always serializes both stages' parameters", () => {
    // There is no variant to choose. qdk runs PSSPC then Lattice Surgery on
    // every estimate, so every config carries both stages' settings.
    expect(expectSchemaValid(validGateBasedDraft()).traceTransform).toEqual({
      tStatesPerRotation: 20,
      ccxMagicStates: false,
      slowDownFactor: 1.0,
    });
  });

  it("keeps the Lattice Surgery slowdown pinned at the contract's 1.0", () => {
    const s = validGateBasedDraft();
    s.traceTransform.tStatesPerRotation = 5;
    expect(expectSchemaValid(s).traceTransform.slowDownFactor).toBe(1.0);
  });
});

describe("toRunConfig — upload variant", () => {
  it("serializes the uploaded application variant", () => {
    const s = validGateBasedDraft();
    s.application.type = "uploaded";
    s.application.upload = {
      filePath: "/programs/shor.qs",
      format: "qsharp",
      addToLibrary: true,
    };
    expect(expectSchemaValid(s).application).toEqual({
      type: "uploaded",
      filePath: "/programs/shor.qs",
      format: "qsharp",
      addToLibrary: true,
    });
  });
});

describe("toRunConfig — Litinski19 factory coupling", () => {
  it("keeps Litinski19 for qualifying GateBased runs (errorRate <= 1e-3)", () => {
    const s = validGateBasedDraft();
    s.architecture.gateBased.errorRate = 0.0001;
    s.magicStateFactories = ["litinski19"];
    expect(expectSchemaValid(s).magicStateFactories).toEqual(["litinski19"]);
  });

  it("falls back to Round-Based when Litinski19 isn't allowed (Majorana)", () => {
    const s = createInitialFormState();
    s.architecture.type = "majorana";
    s.magicStateFactories = ["litinski19"];
    expect(expectSchemaValid(s).magicStateFactories).toEqual(["round_based"]);
  });
});

/** A defaults draft switched to Manual Logical Counts with all seven fields filled. */
function validManualCountsDraft(): FormState {
  const s = validGateBasedDraft();
  s.application.type = "manualCounts";
  s.application.manualCounts = {
    numQubits: 100,
    tCount: 20000,
    rotationCount: 500,
    rotationDepth: 50,
    cczCount: 0,
    ccixCount: 0,
    measurementCount: 10,
  };
  return s;
}

describe("toRunConfig — Manual Logical Counts", () => {
  it("serializes all seven counts into a schema-valid manualCounts application", () => {
    const config = expectSchemaValid(validManualCountsDraft());
    expect(config.application).toEqual({
      type: "manualCounts",
      numQubits: 100,
      tCount: 20000,
      rotationCount: 500,
      rotationDepth: 50,
      cczCount: 0,
      ccixCount: 0,
      measurementCount: 10,
    });
  });

  it("auto-names a blank-name manual-counts run", () => {
    const s = validManualCountsDraft();
    s.name = "";
    expect(serialize(s)!.name).toContain("Manual Logical Counts");
  });

  it("returns null when any count is unset", () => {
    const s = validManualCountsDraft();
    s.application.manualCounts.tCount = null;
    expect(serialize(s)).toBeNull();
  });
});

describe("toRunConfig — invalid states never serialize", () => {
  it("returns null when the benchmark id is empty", () => {
    const s = validGateBasedDraft();
    s.application.benchmarkId = "";
    expect(serialize(s)).toBeNull();
  });

  it("returns null when an upload has no file chosen", () => {
    const s = validGateBasedDraft();
    s.application.type = "uploaded";
    s.application.upload.filePath = "";
    expect(serialize(s)).toBeNull();
  });

  it("returns null when gate time is missing", () => {
    const s = validGateBasedDraft();
    s.architecture.gateBased.gateTime = null;
    expect(serialize(s)).toBeNull();
  });

  it("returns null when measurement time is missing", () => {
    const s = validGateBasedDraft();
    s.architecture.gateBased.measurementTime = null;
    expect(serialize(s)).toBeNull();
  });

  it("returns null when maxError is unset", () => {
    const s = validGateBasedDraft();
    s.maxError = null;
    expect(serialize(s)).toBeNull();
  });

  it("serializes an out-of-range value but the schema rejects it", () => {
    const s = validGateBasedDraft();
    s.architecture.gateBased.errorRate = 0.5; // structurally complete, out of (0, 0.01)
    const config = serialize(s);
    expect(config).not.toBeNull();
    expect(validateRunConfigSchema(config!).valid).toBe(false);
  });
});

/**
 * `RunProvenance.authoredBy` has recorded model-assisted runs since v1.4.0, but
 * provenance is not on screen in Run History, the comparison table, or an
 * exported report. The name is, everywhere.
 */
describe("toRunConfig — marking a model-authored run", () => {
  const stampWith = (provenance?: RunProvenance): RunStamp => {
    const stamp: RunStamp = { id: "run-1", createdAt: "2026-01-01T00:00:00.000Z" };
    if (provenance !== undefined) stamp.provenance = provenance;
    return stamp;
  };

  it("tags a name the model chose", () => {
    const state = { ...validGateBasedDraft(), name: "Grover search" };

    const config = toRunConfig(state, stampWith({ authoredBy: "model_assisted" }));

    expect(config?.name).toBe("(agent) Grover search");
  });

  /**
   * The half a handoff-time prefix would have missed: the model proposes a
   * draft with a null name, so the form is blank and `generateName` derives one
   * at Run-click. Those runs would have looked like a human's.
   */
  it("tags a name the app derived", () => {
    const state = { ...validGateBasedDraft(), name: "" };

    const config = toRunConfig(state, stampWith({ authoredBy: "model_assisted" }));

    expect(config?.name.startsWith("(agent) ")).toBe(true);
    expect(config?.name.length).toBeGreaterThan("(agent) ".length);
  });

  it("leaves a configuration the analyst authored alone", () => {
    const state = { ...validGateBasedDraft(), name: "Grover search" };

    expect(toRunConfig(state, stampWith())?.name).toBe("Grover search");
    expect(toRunConfig(state, stampWith({ authoredBy: "human" }))?.name).toBe(
      "Grover search",
    );
  });

  /** A Rerun stamps provenance again over a name that already carries it. */
  it("does not stack the marker across a rerun", () => {
    const state = { ...validGateBasedDraft(), name: "(agent) Grover search" };

    const config = toRunConfig(state, stampWith({ authoredBy: "model_assisted" }));

    expect(config?.name).toBe("(agent) Grover search");
  });
});
