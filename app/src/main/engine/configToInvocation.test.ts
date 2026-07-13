import { describe, it, expect } from "vitest";
import { configToInvocation } from "./configToInvocation.js";
import type { RunConfig } from "../../shared/types.js";

function baseGateBasedConfig(overrides: Partial<RunConfig> = {}): RunConfig {
  return {
    schemaVersion: "1.0.0",
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
    traceTransform: { type: "psspc", tStatesPerRotation: 20, ccxMagicStates: false },
    maxError: 1,
    qreVersion: "qdk-qre-v1-fixture",
    ...overrides,
  };
}

describe("configToInvocation", () => {
  it("translates a valid GateBased/PSSPC config into an invocation", () => {
    const result = configToInvocation(baseGateBasedConfig(), 30000);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.invocation.program.entryExpr).toBe("QuantumDynamics.Main()");
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
      baseGateBasedConfig({ application: { type: "benchmark", benchmarkId: "not-a-real-id" } }),
      30000,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_CONFIG");
  });

  it("rejects a GateBased/three_aux mismatch with INVALID_CONFIG", () => {
    const result = configToInvocation(baseGateBasedConfig({ qecCode: "three_aux" }), 30000);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_CONFIG");
  });

  it("rejects litinski19 with errorRate above 1e-3 with INVALID_CONFIG", () => {
    const result = configToInvocation(
      baseGateBasedConfig({
        architecture: { type: "gateBased", errorRate: 0.005, gateTime: 50, measurementTime: 100, twoQubitGateTime: null },
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
        architecture: { type: "gateBased", errorRate: 0.001, gateTime: 50, measurementTime: 100, twoQubitGateTime: null },
        magicStateFactory: "litinski19",
      }),
      30000,
    );
    expect(result.ok).toBe(true);
  });

  it("rejects majorana with litinski19 with INVALID_CONFIG", () => {
    const result = configToInvocation(
      baseGateBasedConfig({
        architecture: { type: "majorana", errorRate: 0.00001, operationTime: 1000 },
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
        architecture: { type: "majorana", errorRate: 0.00001, operationTime: 1000 },
        qecCode: "three_aux",
        magicStateFactory: "round_based",
        traceTransform: { type: "psspc", tStatesPerRotation: 5, ccxMagicStates: false },
      }),
      30000,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.invocation.qecCode).toBe("three_aux");
  });

  it("does NOT reject an in-range-but-unsatisfiable maxError (passes through)", () => {
    const result = configToInvocation(baseGateBasedConfig({ maxError: 1e-12 }), 30000);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.invocation.maxError).toBe(1e-12);
  });

  it("rejects PSSPC tStatesPerRotation out of [5,20] with INVALID_CONFIG", () => {
    const result = configToInvocation(
      baseGateBasedConfig({ traceTransform: { type: "psspc", tStatesPerRotation: 21, ccxMagicStates: false } }),
      30000,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_CONFIG");
  });
});
