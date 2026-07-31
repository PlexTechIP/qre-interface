import { describe, expect, it } from "vitest";

import type { HyperparameterValues, RunConfig } from "../../shared/types.js";
import { SCHEMA_VERSION } from "../../shared/types.js";
import { resolvePythonBin } from "./pythonBin.js";
import { QreEngine } from "./qreEngine.js";

const PYTHON_BIN = resolvePythonBin();

let seq = 0;

function config(
  benchmarkId: string,
  parameters: HyperparameterValues,
): RunConfig {
  seq += 1;
  return {
    schemaVersion: SCHEMA_VERSION,
    id: `81000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    name: `hyperparameter sensitivity: ${benchmarkId}`,
    createdAt: "2026-07-31T00:00:00Z",
    application: { type: "benchmark", benchmarkId },
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
    parameters,
    maxError: 1,
    qreVersion: "qdk-qre-v1-fixture",
  };
}

/** Physical qubits on the frontier's first row; the run must have succeeded. */
async function physicalQubits(
  benchmarkId: string,
  parameters: HyperparameterValues,
): Promise<number> {
  const result = await new QreEngine(PYTHON_BIN).run(
    config(benchmarkId, parameters),
  );
  expect(result.error).toBeNull();
  expect(result.status).toBe("succeeded");
  const first = result.frontier?.[0];
  expect(first).toBeDefined();
  return first!.physicalQubits.value;
}

/**
 * The audit finding this suite exists for: "an analyst can change a parameter by
 * orders of magnitude and receive the same estimate". Each case runs the real
 * engine twice and requires the two answers to differ.
 */
const SENSITIVITY: readonly {
  benchmarkId: string;
  param: string;
  small: HyperparameterValues;
  large: HyperparameterValues;
}[] = [
  {
    benchmarkId: "quantum-dynamics",
    param: "lattice size",
    small: { latticeN1: 2, latticeN2: 2, totalTime: 6.0, trotterStep: 0.9 },
    large: { latticeN1: 5, latticeN2: 5, totalTime: 6.0, trotterStep: 0.9 },
  },
  {
    benchmarkId: "quantum-dynamics",
    param: "Trotter step",
    small: { latticeN1: 3, latticeN2: 3, totalTime: 12.0, trotterStep: 2.0 },
    large: { latticeN1: 3, latticeN2: 3, totalTime: 12.0, trotterStep: 0.5 },
  },
  {
    benchmarkId: "grovers-search",
    param: "search qubits",
    small: { searchQubits: 3 },
    large: { searchQubits: 7 },
  },
  {
    benchmarkId: "shors-factoring",
    param: "bit size",
    small: { bitSize: 8, generator: 11 },
    large: { bitSize: 24, generator: 11 },
  },
  {
    benchmarkId: "phase-estimation",
    param: "precision",
    small: { precision: 3, registerSize: 3 },
    large: { precision: 9, registerSize: 3 },
  },
  {
    benchmarkId: "ekera-hastad-factoring",
    param: "RSA instance",
    small: { rsaInstance: "rsa-100", generator: 7 },
    large: { rsaInstance: "rsa-1024", generator: 7 },
  },
];

describe("benchmark hyperparameters change the estimate", () => {
  for (const { benchmarkId, param, small, large } of SENSITIVITY) {
    it(`${benchmarkId}: ${param}`, async () => {
      const smallQubits = await physicalQubits(benchmarkId, small);
      const largeQubits = await physicalQubits(benchmarkId, large);
      expect(largeQubits).not.toBe(smallQubits);
    }, 180_000);
  }

  it("is reproducible: the same parameters give the same estimate", async () => {
    const params = { latticeN1: 3, latticeN2: 3, totalTime: 9.0, trotterStep: 0.9 };
    const first = await physicalQubits("quantum-dynamics", params);
    const second = await physicalQubits("quantum-dynamics", params);
    expect(second).toBe(first);
  }, 120_000);

  it("fails soft with INVALID_CONFIG on an out-of-spec hyperparameter", async () => {
    const result = await new QreEngine(PYTHON_BIN).run(
      config("shors-factoring", { bitSize: 0, generator: 11 }),
    );
    expect(result.status).toBe("failed");
    expect(result.error?.code).toBe("INVALID_CONFIG");
    expect(result.frontier).toBeNull();
  }, 30_000);
});
