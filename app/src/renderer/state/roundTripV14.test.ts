/**
 * Rerun round-trip for the v1.4.0 fields: RunConfig -> FormState -> RunConfig.
 *
 * Rerun rehydrates a saved record into the editable form, and the form then
 * re-serializes it. Anything the form model cannot represent is lost silently in
 * that hop — a stage that vanishes, or worse, one that appears at its defaults
 * where the record had none. Both produce a DIFFERENT estimate from the run the
 * analyst asked to repeat, with no error anywhere.
 */
import { describe, expect, it } from "vitest";

import { SCHEMA_VERSION, type RunConfig } from "../../shared/types";
import { createInitialFormState, formStateFromRunConfig } from "./formState";
import { isConfigValid } from "./validation";
import { schemaValidationStamp, toRunConfig } from "./toRunConfig";
import { validateRunConfigSchema } from "./schemaValidation";

const STAMP = schemaValidationStamp();

function baseConfig(): RunConfig {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: "83000000-0000-4000-8000-000000000001",
    name: "round trip",
    createdAt: "2026-08-06T00:00:00Z",
    application: { type: "benchmark", benchmarkId: "quantum-dynamics" },
    architecture: {
      type: "gateBased",
      errorRate: 0.0001,
      gateTime: 50,
      measurementTime: 100,
      twoQubitGateTime: null,
    },
    qecCode: "surface_code",
    magicStateFactories: ["round_based"],
    traceTransform: {
      tStatesPerRotation: 20,
      ccxMagicStates: false,
      slowDownFactor: 1.0,
    },
    maxError: 1,
    qreVersion: "qdk-qre-v1-fixture",
  };
}

/** Rerun: rehydrate then re-serialize, the way the Rerun button does. */
function roundTrip(config: RunConfig): RunConfig {
  const form = formStateFromRunConfig(config);
  const out = toRunConfig(form, STAMP);
  expect(out).not.toBeNull();
  return out!;
}

describe("Rerun preserves the v1.4.0 pipeline stages", () => {
  it("keeps Dynamic Memory Compute with its own parameters, not defaults", () => {
    const config = baseConfig();
    config.traceTransform = {
      ...config.traceTransform,
      dynamicMemoryCompute: {
        computeCapacityPercentage: 0.25,
        evictionStrategy: "least_frequently_used",
      },
    };

    expect(roundTrip(config).traceTransform.dynamicMemoryCompute).toEqual({
      computeCapacityPercentage: 0.25,
      evictionStrategy: "least_frequently_used",
    });
  });

  it("keeps Unmemory when it was on alongside stage 0", () => {
    const config = baseConfig();
    config.traceTransform = {
      ...config.traceTransform,
      dynamicMemoryCompute: {
        computeCapacityPercentage: 0.5,
        evictionStrategy: "least_recently_used",
      },
      unmemory: true,
    };

    expect(roundTrip(config).traceTransform.unmemory).toBe(true);
  });

  it("does NOT invent a stage a two-stage record never had", () => {
    // The failure mode that matters most: a rerun of a pre-v1.4.0 record must
    // stay a two-stage pipeline, or it silently estimates something else.
    const out = roundTrip(baseConfig());

    expect(Object.keys(out.traceTransform)).not.toContain("dynamicMemoryCompute");
    expect(Object.keys(out.traceTransform)).not.toContain("unmemory");
  });
});

describe("Rerun preserves the v1.4.0 architecture fields", () => {
  it("keeps Majorana tErrorRate and targetYear", () => {
    const config = baseConfig();
    config.architecture = {
      type: "majorana",
      errorRate: 0.00001,
      operationTime: 1000,
      tErrorRate: 0.02,
      targetYear: 2033,
    };
    config.qecCode = "three_aux";

    const arch = roundTrip(config).architecture;
    expect(arch).toMatchObject({ tErrorRate: 0.02, targetYear: 2033 });
  });

  it("omits Majorana optionals that were absent, rather than defaulting them", () => {
    const config = baseConfig();
    config.architecture = {
      type: "majorana",
      errorRate: 0.00001,
      operationTime: 1000,
    };
    config.qecCode = "three_aux";

    const arch = roundTrip(config).architecture;
    expect(Object.keys(arch)).not.toContain("tErrorRate");
    expect(Object.keys(arch)).not.toContain("targetYear");
  });

  it("keeps Neutral Atom dataQubitSpacing and targetYear", () => {
    const config = baseConfig();
    config.architecture = {
      type: "neutralAtom",
      rydbergTime: 500,
      rydbergError: 0.001,
      singleQubitTime: 1000,
      singleQubitError: 0.0001,
      measurementTime: 10000,
      measurementError: 0.0001,
      handoffTime: 0,
      atomSpacing: 3.0,
      dataQubitSpacing: 30.0,
      maxVelocity: 0.25,
      maxAcceleration: 5000.0,
      surfaceCodeOneQubitTimeFactor: 1,
      surfaceCodeTwoQubitTimeFactor: 1,
      targetYear: 2040,
    };
    config.qecCode = "low_move_surface_code";

    const arch = roundTrip(config).architecture;
    expect(arch).toMatchObject({ dataQubitSpacing: 30.0, targetYear: 2040 });
  });
});

describe("Rerun preserves the workload itself", () => {
  /**
   * The defect this covers was found by running the app: rerunning a 3x3 /
   * T=9 Ising Model record re-ran it at the 10x10 / T=30 defaults and reported
   * 52,801 physical qubits where the original said 256.
   *
   * `parameters` are the arguments of the benchmark's Q# entry operation, so
   * dropping them changes the circuit, not a label — and nothing on screen said
   * so. A rerun that silently estimates something else is the worst shape of
   * bug this surface can have.
   */
  it("keeps the saved benchmark parameters instead of reverting to defaults", () => {
    const config = baseConfig();
    config.parameters = {
      latticeN1: 3,
      latticeN2: 3,
      totalTime: 9.0,
      trotterStep: 0.9,
      couplingJ: 1.0,
      fieldG: 1.0,
    };

    expect(roundTrip(config).parameters).toMatchObject({
      latticeN1: 3,
      latticeN2: 3,
      totalTime: 9.0,
    });
  });

  it("fills a parameter the saved record predates from the benchmark defaults", () => {
    const config = baseConfig();
    // An older record that never carried fieldG still has to produce a complete
    // argument list — a hole would change the entry expression's arity.
    config.parameters = { latticeN1: 3, latticeN2: 3, totalTime: 9.0 };

    const out = roundTrip(config).parameters;
    expect(out).toMatchObject({ latticeN1: 3, totalTime: 9.0 });
    expect(out).toHaveProperty("fieldG");
  });
});

describe("Everything the form can produce is schema-valid", () => {
  it("validates a config with stage 0 enabled", () => {
    const state = createInitialFormState();
    state.traceTransform = {
      ...state.traceTransform,
      dynamicMemoryCompute: {
        computeCapacityPercentage: 0.5,
        evictionStrategy: "least_recently_used",
      },
      unmemory: true,
    };
    state.architecture.gateBased.gateTime = 50;
    state.architecture.gateBased.measurementTime = 100;

    const config = toRunConfig(state, STAMP);
    expect(config).not.toBeNull();
    expect(validateRunConfigSchema(config!).valid).toBe(true);
    expect(isConfigValid(state)).toBe(true);
  });

  it("blocks Run when stage 0 is enabled with no capacity entered", () => {
    const state = createInitialFormState();
    state.traceTransform = {
      ...state.traceTransform,
      dynamicMemoryCompute: {
        computeCapacityPercentage: null,
        evictionStrategy: "least_recently_used",
      },
    };
    state.architecture.gateBased.gateTime = 50;
    state.architecture.gateBased.measurementTime = 100;

    // Serialization gates rather than dropping the stage — running a shorter
    // pipeline than the form displays would be the silent-wrong-answer case.
    expect(toRunConfig(state, STAMP)).toBeNull();
    expect(isConfigValid(state)).toBe(false);
  });

  it("blocks Run on a fractional integer-only time", () => {
    const state = createInitialFormState();
    state.architecture.gateBased.gateTime = 50.5;
    state.architecture.gateBased.measurementTime = 100;

    expect(isConfigValid(state)).toBe(false);
  });
});
