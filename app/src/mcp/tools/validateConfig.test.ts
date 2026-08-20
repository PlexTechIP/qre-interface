// @vitest-environment node
import { describe, expect, it } from "vitest";
import { handleValidateConfig } from "./validateConfig.js";
import type { ValidateConfigOutput } from "./validateConfig.js";
import type { GeneratedRunDraft } from "../../shared/agentTypes.js";

function asData(result: Awaited<ReturnType<typeof handleValidateConfig>>): ValidateConfigOutput {
  expect(result.isError).toBeFalsy();
  return result.structuredContent as unknown as ValidateConfigOutput;
}

describe("qre_validate_config tool", () => {
  // Test 1: Valid complete quantum-dynamics benchmark draft
  it("accepts a valid quantum-dynamics benchmark draft", async () => {
    const draft: GeneratedRunDraft = {
      name: "Valid Quantum Dynamics",
      application: {
        type: "benchmark",
        benchmarkId: "quantum-dynamics",
      },
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
      traceTransform: {
        tStatesPerRotation: 10,
        ccxMagicStates: false,
      },
      maxError: 0.5,
      parameters: {
        latticeN1: 10,
        latticeN2: 10,
        totalTime: 30.0,
        trotterStep: 0.9,
        couplingJ: 1.0,
        fieldG: 1.0,
      },
    };

    const result = asData(await handleValidateConfig({ draft }));
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  // Test 2: Majorana + disallowed litinski19 factory
  it("rejects majorana with disallowed litinski19 factory", async () => {
    const draft: GeneratedRunDraft = {
      name: "Majorana Litinski",
      application: {
        type: "benchmark",
        benchmarkId: "shors-factoring",
      },
      architecture: {
        type: "majorana",
        errorRate: 0.0001,
        operationTime: 1000,
      },
      magicStateFactories: ["litinski19"],
      secondaryFactories: [],
      memoryOptimization: "none",
      traceTransform: {
        tStatesPerRotation: 10,
        ccxMagicStates: false,
      },
      maxError: 0.5,
      parameters: {
        bitSize: 31,
        generator: 11,
      },
    };

    const result = asData(await handleValidateConfig({ draft }));
    expect(result.valid).toBe(false);
    const couplingErrors = result.errors.filter((e) => e.source === "coupling");
    expect(couplingErrors.some((e) => e.message.includes("litinski19"))).toBe(true);
  });


  // Test 4: Empty magic state factories
  it("rejects empty magic state factories", async () => {
    const draft: GeneratedRunDraft = {
      name: "No factories",
      application: {
        type: "benchmark",
        benchmarkId: "phase-estimation",
      },
      architecture: {
        type: "gateBased",
        errorRate: 0.0001,
        gateTime: 50,
        measurementTime: 100,
        twoQubitGateTime: null,
      },
      magicStateFactories: [],
      secondaryFactories: [],
      memoryOptimization: "none",
      traceTransform: {
        tStatesPerRotation: 10,
        ccxMagicStates: false,
      },
      maxError: 0.5,
      parameters: {
        precision: 5,
        registerSize: 10,
      },
    };

    const result = asData(await handleValidateConfig({ draft }));
    expect(result.valid).toBe(false);
    const formErrors = result.errors.filter((e) => e.source === "form" && e.field === "magicStateFactories");
    expect(formErrors.length).toBeGreaterThan(0);
  });


  // Test 6: Majorana + magic_up_to_clifford secondary factory disallowed
  it("rejects majorana with magic_up_to_clifford", async () => {
    const draft: GeneratedRunDraft = {
      name: "Majorana with magic_up_to_clifford",
      application: {
        type: "benchmark",
        benchmarkId: "ekera-hastad-factoring",
      },
      architecture: {
        type: "majorana",
        errorRate: 0.00001,
        operationTime: 1000,
      },
      magicStateFactories: ["round_based"],
      secondaryFactories: ["magic_up_to_clifford"],
      memoryOptimization: "none",
      traceTransform: {
        tStatesPerRotation: 10,
        ccxMagicStates: false,
      },
      maxError: 0.5,
      parameters: {
        rsaInstance: "rsa-100",
        generator: 7,
      },
    };

    const result = asData(await handleValidateConfig({ draft }));
    expect(result.valid).toBe(false);
    const couplingErrors = result.errors.filter((e) => e.source === "coupling" && e.field === "secondaryFactories");
    expect(couplingErrors.length).toBeGreaterThan(0);
  });


  // Schema-legal (errorRate < 0.01) but coupling-invalid above the 1e-3 litinski19
  // threshold — catches a reorder back to normalize-before-check, which would
  // silently swap this factory to round_based instead of reporting it.
  it("rejects gate-based with litinski19 above the error-rate threshold", async () => {
    const draft: GeneratedRunDraft = {
      name: "High error rate Litinski",
      application: {
        type: "benchmark",
        benchmarkId: "grovers-search",
      },
      architecture: {
        type: "gateBased",
        errorRate: 0.005,
        gateTime: 50,
        measurementTime: 100,
        twoQubitGateTime: null,
      },
      magicStateFactories: ["litinski19"],
      secondaryFactories: [],
      memoryOptimization: "none",
      traceTransform: {
        tStatesPerRotation: 10,
        ccxMagicStates: false,
      },
      maxError: 0.5,
      parameters: {
        searchQubits: 10,
      },
    };

    const result = asData(await handleValidateConfig({ draft }));
    expect(result.valid).toBe(false);
    const couplingErrors = result.errors.filter((e) => e.source === "coupling");
    expect(couplingErrors.some((e) => e.message.includes("litinski19"))).toBe(true);
  });

  // Caught at the structural gate today (the schema locks memoryOptimization to
  // "none"), not by checkCouplingViolations's D2 check — asserts the guarantee
  // holds regardless of which layer catches it.
  it("rejects a non-none memoryOptimization", async () => {
    const draft: GeneratedRunDraft = {
      name: "Bad memory optimization",
      application: {
        type: "benchmark",
        benchmarkId: "quantum-dynamics",
      },
      architecture: {
        type: "gateBased",
        errorRate: 0.0001,
        gateTime: 50,
        measurementTime: 100,
        twoQubitGateTime: null,
      },
      magicStateFactories: ["round_based"],
      secondaryFactories: [],
      memoryOptimization: "yoked_1d",
      traceTransform: {
        tStatesPerRotation: 10,
        ccxMagicStates: false,
      },
      maxError: 0.5,
      parameters: {
        latticeN1: 10,
        latticeN2: 10,
        totalTime: 30.0,
        trotterStep: 0.9,
        couplingJ: 1.0,
        fieldG: 1.0,
      },
    };

    const result = asData(await handleValidateConfig({ draft }));
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  // Test 9: nothing is persisted — this tool never touches the database, so a valid
  // draft must validate correctly even with QRE_DB_PATH completely unset.
  it("validates correctly with no database configured", async () => {
    const originalDbPath = process.env.QRE_DB_PATH;
    delete process.env.QRE_DB_PATH;

    try {
      const draft: GeneratedRunDraft = {
        name: "No DB needed",
        application: {
          type: "benchmark",
          benchmarkId: "quantum-dynamics",
        },
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
        traceTransform: {
          tStatesPerRotation: 10,
          ccxMagicStates: false,
        },
        maxError: 0.5,
        parameters: {
          latticeN1: 10,
          latticeN2: 10,
          totalTime: 30.0,
          trotterStep: 0.9,
          couplingJ: 1.0,
          fieldG: 1.0,
        },
      };

      const result = asData(await handleValidateConfig({ draft }));
      expect(result.valid).toBe(true);
    } finally {
      if (originalDbPath !== undefined) {
        process.env.QRE_DB_PATH = originalDbPath;
      }
    }
  });

  // Test 8: Input with extra fields is rejected at structure level
  it("rejects input with unexpected extra fields", async () => {
    const invalidDraft = {
      name: "With extra field",
      application: {
        type: "benchmark",
        benchmarkId: "grovers-search",
      },
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
      traceTransform: {
        tStatesPerRotation: 10,
        ccxMagicStates: false,
      },
      maxError: 0.5,
      parameters: {
        searchQubits: 10,
      },
      id: "should-not-be-here",
    } as unknown as GeneratedRunDraft;

    const result = asData(await handleValidateConfig({ draft: invalidDraft }));
    expect(result.valid).toBe(false);
    const structErrors = result.errors.filter((e) => e.source === "structure");
    expect(structErrors.length).toBeGreaterThan(0);
  });
});
