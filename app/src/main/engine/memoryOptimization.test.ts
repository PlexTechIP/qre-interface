import { describe, expect, it } from "vitest";

import {
  SCHEMA_VERSION,
  type FrontierRow,
  type MemoryOptimizationId,
  type RunConfig,
} from "../../shared/types.js";
import { configToInvocation } from "./configToInvocation.js";
import { resolvePythonBin } from "./pythonBin.js";
import { QreEngine } from "./qreEngine.js";

const PYTHON_BIN = resolvePythonBin();

let seq = 0;

function config(memoryOptimization?: MemoryOptimizationId): RunConfig {
  seq += 1;
  const base: RunConfig = {
    schemaVersion: SCHEMA_VERSION,
    id: `83000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    name: "memory optimization",
    createdAt: "2026-07-31T00:00:00Z",
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
    parameters: {
      latticeN1: 3,
      latticeN2: 3,
      totalTime: 9.0,
      trotterStep: 0.9,
      couplingJ: 1.0,
      fieldG: 1.0,
    },
    maxError: 1,
    qreVersion: "qdk-qre-v1-fixture",
  };
  if (memoryOptimization !== undefined) base.memoryOptimization = memoryOptimization;
  return base;
}

/**
 * Memory Optimization is recorded on the config but cannot influence an estimate
 * in this build, and the UI says so. These tests hold that claim to account.
 *
 * The yoked codes are ISATransforms that PROVIDE a MEMORY instruction. MEMORY
 * demand comes only from READ_FROM_MEMORY / WRITE_TO_MEMORY trace gates, which
 * are emitted by the DynamicMemoryCompute trace transform or by LogicalCounts
 * keys the contract does not carry (numComputeQubits, readFromMemoryCount,
 * writeToMemoryCount).
 *
 * ⚠️ TWO THINGS HAVE CHANGED SINCE THIS WAS WRITTEN, and both matter before
 * anyone reads the assertions below as evidence about the yoked codes:
 *
 *  1. DynamicMemoryCompute IS in our pipeline as of contract v1.4.0, as an
 *     optional stage 0. The demand this file says nothing supplies now exists.
 *  2. More importantly, `memoryOptimization` has never reached the engine at
 *     all — see the first test. So "identical estimates" below is NOT evidence
 *     that the yoked codes do nothing; it is evidence that they were never sent.
 *
 * Week-5 Team 3 (§G) wires the field through and then measures for real. Until
 * that lands, do not cite this file as showing Memory Optimization is inert.
 */
/**
 * The frontier with `evaluationTime` dropped. That field is how long the
 * estimator itself took — wall-clock instrumentation, not a resource estimate —
 * so it varies run to run and is never evidence of a configuration change.
 */
function resources(result: { frontier: FrontierRow[] | null }): unknown {
  return result.frontier?.map((row) => {
    const additional = { ...row.additional };
    delete additional["evaluationTime"];
    return { ...row, additional };
  });
}

describe("Memory Optimization does not reach the estimator", () => {
  it("is absent from the engine invocation", () => {
    const result = configToInvocation(config("yoked_2d"), 30_000);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.keys(result.invocation)).not.toContain("memoryOptimization");
    }
  });

  it("produces an identical estimate whether set or not", async () => {
    const engine = new QreEngine(PYTHON_BIN);
    const plain = await engine.run(config());
    const yoked = await engine.run(config("yoked_2d"));

    expect(plain.status).toBe("succeeded");
    expect(yoked.status).toBe("succeeded");
    expect(resources(yoked)).toEqual(resources(plain));
  }, 120_000);

  it("gives 1D and 2D yoked the same estimate as each other", async () => {
    const engine = new QreEngine(PYTHON_BIN);
    const oneD = await engine.run(config("yoked_1d"));
    const twoD = await engine.run(config("yoked_2d"));

    expect(resources(oneD)).toEqual(resources(twoD));
  }, 120_000);
});
