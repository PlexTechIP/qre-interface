import { describe, expect, it } from "vitest";
import type { RunConfig } from "../../shared/types.js";
import { SCHEMA_VERSION } from "../../shared/types.js";
import { BENCHMARK_REGISTRY } from "./benchmarkRegistry.js";
import { resolvePythonBin } from "./pythonBin.js";
import { QreEngine } from "./qreEngine.js";

const PYTHON_BIN = resolvePythonBin();
const IDS = Object.keys(BENCHMARK_REGISTRY);

function config(benchmarkId: string, index: number): RunConfig {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: `80000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    name: `benchmark smoke: ${benchmarkId}`,
    createdAt: "2026-07-15T23:00:00Z",
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
    maxError: 1,
    qreVersion: "qdk-qre-v1-fixture",
  };
}

describe("all frozen benchmarks", () => {
  for (const [index, benchmarkId] of IDS.entries()) {
    it(`runs ${benchmarkId} through the real engine`, async () => {
      const result = await new QreEngine(PYTHON_BIN).run(
        config(benchmarkId, index),
      );
      expect(result.status).toBe("succeeded");
      expect(result.error).toBeNull();
      expect(result.frontier?.length).toBeGreaterThan(0);
      expect(result.raw).not.toBeNull();
      expect(result.qreVersion).toBe("1.30.0");
    }, 60_000);
  }
});
