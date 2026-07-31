import { describe, it, expect } from "vitest";
import { configToInvocation } from "./configToInvocation.js";
import type { RunConfig } from "../../shared/types.js";
import { SCHEMA_VERSION } from "../../shared/types.js";
import {
  buildBenchmarkConfig,
  buildFailingConfig,
  buildLargeConfig,
  buildSparseConfig,
} from "../../shared/testing/index.js";

function baseGateBasedConfig(overrides: Partial<RunConfig> = {}): RunConfig {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: "acaf1c0e-a716-41bc-9774-598cacee033f",
    name: "test",
    createdAt: "2026-07-09T18:22:00Z",
    application: { type: "benchmark", benchmarkId: "quantum-dynamics" },
    architecture: {
      type: "gateBased",
      errorRate: 0.0001,
      gateTime: 50,
      measurementTime: 100,
      twoQubitGateTime: null,
    },
    qecCode: "surface_code",
    magicStateFactory: "round_based",
    traceTransform: { tStatesPerRotation: 20, ccxMagicStates: false, slowDownFactor: 1.0 },
    maxError: 1,
    qreVersion: "qdk-qre-v1-fixture",
    ...overrides,
  };
}

describe("configToInvocation", () => {
  for (const [label, config] of [
    ["benchmark", buildBenchmarkConfig()],
    ["large", buildLargeConfig()],
    ["sparse", buildSparseConfig()],
    ["failing", buildFailingConfig()],
  ] as const) {
    it(`translates the ${label} config`, () => {
      const result = configToInvocation(config, 30_000);
      expect(result.ok).toBe(true);
    });
  }

  it("translates a valid GateBased/PSSPC config into an invocation", () => {
    const result = configToInvocation(baseGateBasedConfig(), 30000);
    expect(result.ok).toBe(true);
    if (result.ok && result.invocation.program.format === "qsharp") {
      expect(result.invocation.program.entryExpr).toBe(
        "QuantumDynamics.Run(10, 10, 30.0, 0.9, 1.0, 1.0)",
      );
      expect(result.invocation.program.format).toBe("qsharp");
      expect(result.invocation.architecture).toEqual({
        type: "gateBased",
        errorRate: 0.0001,
        gateTime: 50,
        measurementTime: 100,
        twoQubitGateTime: null,
      });
      expect(result.invocation.qecCode).toBe("surface_code");
      expect(result.invocation.timeoutMs).toBe(30000);
    }
  });

  it("rejects an unknown benchmark id with INVALID_CONFIG", () => {
    const result = configToInvocation(
      baseGateBasedConfig({
        application: { type: "benchmark", benchmarkId: "not-a-real-id" },
      }),
      30000,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_CONFIG");
  });

  it("rejects a GateBased/three_aux mismatch with INVALID_CONFIG", () => {
    const result = configToInvocation(
      baseGateBasedConfig({ qecCode: "three_aux" }),
      30000,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_CONFIG");
  });

  it("rejects litinski19 with errorRate above 1e-3 with INVALID_CONFIG", () => {
    const result = configToInvocation(
      baseGateBasedConfig({
        architecture: {
          type: "gateBased",
          errorRate: 0.005,
          gateTime: 50,
          measurementTime: 100,
          twoQubitGateTime: null,
        },
        magicStateFactory: "litinski19",
      }),
      30000,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_CONFIG");
  });

  it("accepts litinski19 with errorRate exactly 1e-3", () => {
    const result = configToInvocation(
      baseGateBasedConfig({
        architecture: {
          type: "gateBased",
          errorRate: 0.001,
          gateTime: 50,
          measurementTime: 100,
          twoQubitGateTime: null,
        },
        magicStateFactory: "litinski19",
      }),
      30000,
    );
    expect(result.ok).toBe(true);
  });

  it("rejects majorana with litinski19 with INVALID_CONFIG", () => {
    const result = configToInvocation(
      baseGateBasedConfig({
        architecture: {
          type: "majorana",
          errorRate: 0.00001,
          operationTime: 1000,
        },
        qecCode: "three_aux",
        magicStateFactory: "litinski19",
      }),
      30000,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_CONFIG");
  });

  it("accepts a valid Majorana/three_aux config", () => {
    const result = configToInvocation(
      baseGateBasedConfig({
        application: { type: "benchmark", benchmarkId: "phase-estimation" },
        architecture: {
          type: "majorana",
          errorRate: 0.00001,
          operationTime: 1000,
        },
        qecCode: "three_aux",
        magicStateFactory: "round_based",
        traceTransform: { tStatesPerRotation: 5, ccxMagicStates: false, slowDownFactor: 1.0 },
      }),
      30000,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.invocation.qecCode).toBe("three_aux");
  });

  it("does NOT reject an in-range-but-unsatisfiable maxError (passes through)", () => {
    const result = configToInvocation(
      baseGateBasedConfig({ maxError: 1e-12 }),
      30000,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.invocation.maxError).toBe(1e-12);
  });

  it("rejects PSSPC tStatesPerRotation out of [5,20] with INVALID_CONFIG", () => {
    const result = configToInvocation(
      baseGateBasedConfig({
        traceTransform: { tStatesPerRotation: 21, ccxMagicStates: false, slowDownFactor: 1.0 },
      }),
      30000,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_CONFIG");
  });
});

describe("configToInvocation — Manual Logical Counts", () => {
  const manualCounts = {
    numQubits: 100,
    tCount: 20000,
    rotationCount: 500,
    rotationDepth: 50,
    cczCount: 0,
    ccixCount: 0,
    measurementCount: 10,
  } as const;

  it("translates a valid manualCounts config into a logicalCounts program", () => {
    const result = configToInvocation(
      baseGateBasedConfig({ application: { type: "manualCounts", ...manualCounts } }),
      30000,
    );
    expect(result.ok).toBe(true);
    if (result.ok && result.invocation.program.format === "logicalCounts") {
      expect(result.invocation.program.logicalCounts).toEqual(manualCounts);
    } else {
      throw new Error("expected a logicalCounts program");
    }
  });

  it("rejects a negative count with INVALID_CONFIG", () => {
    const result = configToInvocation(
      baseGateBasedConfig({
        application: { type: "manualCounts", ...manualCounts, tCount: -1 },
      }),
      30000,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_CONFIG");
  });

  it("rejects a non-integer count with INVALID_CONFIG", () => {
    const result = configToInvocation(
      baseGateBasedConfig({
        application: { type: "manualCounts", ...manualCounts, numQubits: 1.5 },
      }),
      30000,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_CONFIG");
  });

  it("rejects rotationDepth greater than rotationCount", () => {
    const result = configToInvocation(
      baseGateBasedConfig({
        application: {
          type: "manualCounts",
          ...manualCounts,
          rotationCount: 10,
          rotationDepth: 11,
        },
      }),
      30000,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_CONFIG");
  });
});

/** The entry expression a benchmark config translates to, or "" if it failed. */
function entryExprFor(config: RunConfig): string {
  const result = configToInvocation(config, 30_000);
  if (!result.ok) return "";
  const { program } = result.invocation;
  return program.format === "logicalCounts" ? "" : program.entryExpr;
}

describe("benchmark hyperparameters reach the entry expression", () => {
  it("passes the recorded values as arguments to the entry operation", () => {
    expect(
      entryExprFor(
        baseGateBasedConfig({
          application: { type: "benchmark", benchmarkId: "quantum-dynamics" },
          parameters: {
            latticeN1: 4,
            latticeN2: 6,
            totalTime: 12.0,
            trotterStep: 0.5,
            couplingJ: 1.0,
            fieldG: 1.0,
          },
        }),
      ),
    ).toBe("QuantumDynamics.Run(4, 6, 12.0, 0.5, 1.0, 1.0)");
  });

  it("uses the spec defaults when the config records no parameters", () => {
    expect(
      entryExprFor(
        baseGateBasedConfig({
          application: { type: "benchmark", benchmarkId: "quantum-dynamics" },
        }),
      ),
    ).toBe("QuantumDynamics.Run(10, 10, 30.0, 0.9, 1.0, 1.0)");
  });

  it("gives two different parameter sets two different entry expressions", () => {
    const small = entryExprFor(
      baseGateBasedConfig({
        application: { type: "benchmark", benchmarkId: "grovers-search" },
        parameters: { searchQubits: 3 },
      }),
    );
    const large = entryExprFor(
      baseGateBasedConfig({
        application: { type: "benchmark", benchmarkId: "grovers-search" },
        parameters: { searchQubits: 9 },
      }),
    );
    expect(small).toBe("GroversSearch.Run(3)");
    expect(large).toBe("GroversSearch.Run(9)");
  });

  it("rejects an out-of-spec hyperparameter with INVALID_CONFIG", () => {
    const result = configToInvocation(
      baseGateBasedConfig({
        application: { type: "benchmark", benchmarkId: "shors-factoring" },
        parameters: { bitSize: 0 },
      }),
      30_000,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_CONFIG");
      expect(result.error.message).toContain("Bit Size");
    }
  });

  it("refuses to interpolate an unrecognised choice value into Q# source", () => {
    const result = configToInvocation(
      baseGateBasedConfig({
        application: {
          type: "benchmark",
          benchmarkId: "ekera-hastad-factoring",
        },
        parameters: { rsaInstance: "rsa-100); Message(\"pwned\"); (" },
      }),
      30_000,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_CONFIG");
  });

  it("ignores hyperparameters recorded against a non-benchmark application", () => {
    const result = configToInvocation(
      baseGateBasedConfig({
        application: {
          type: "manualCounts",
          numQubits: 100,
          tCount: 20000,
          rotationCount: 500,
          rotationDepth: 50,
          cczCount: 0,
          ccixCount: 0,
          measurementCount: 10,
        },
        parameters: { bitSize: 31 },
      }),
      30_000,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.invocation.program.format).toBe("logicalCounts");
  });
});
