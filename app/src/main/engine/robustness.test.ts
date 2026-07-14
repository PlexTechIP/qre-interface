import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { QreEngine } from "./qreEngine.js";
import type { RunConfig } from "../../shared/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PYTHON_BIN = path.join(__dirname, "python", ".venv", "bin", "python3");

function config(id: string, benchmarkId: string): RunConfig {
  return {
    schemaVersion: "1.0.0",
    id,
    name: "robustness test",
    createdAt: "2026-07-09T18:22:00Z",
    application: { type: "benchmark", benchmarkId },
    architecture: { type: "gateBased", errorRate: 0.0001, gateTime: 50, measurementTime: 100, twoQubitGateTime: null },
    qecCode: "surface_code",
    magicStateFactory: "round_based",
    traceTransform: { type: "psspc", tStatesPerRotation: 20, ccxMagicStates: false },
    maxError: 1,
    qreVersion: "qdk-qre-v1-fixture",
  };
}

describe("robustness", () => {
  it("runs two configs sequentially without interference", async () => {
    const engine = new QreEngine(PYTHON_BIN);
    const r1 = await engine.run(config("11111111-1111-4111-8111-111111111111", "quantum-dynamics"));
    const r2 = await engine.run(config("22222222-2222-4222-8222-222222222222", "grovers-search"));
    expect(r1.runId).toBe("11111111-1111-4111-8111-111111111111");
    expect(r2.runId).toBe("22222222-2222-4222-8222-222222222222");
    expect(r1.status).toBe("succeeded");
    expect(r2.status).toBe("succeeded");
  }, 90000);

  it("runs two configs concurrently without interference", async () => {
    const engine = new QreEngine(PYTHON_BIN);
    const [r1, r2] = await Promise.all([
      engine.run(config("33333333-3333-4333-8333-333333333333", "phase-estimation")),
      engine.run(config("44444444-4444-4444-8444-444444444444", "quantum-dynamics")),
    ]);
    expect(r1.runId).toBe("33333333-3333-4333-8333-333333333333");
    expect(r2.runId).toBe("44444444-4444-4444-8444-444444444444");
    expect(r1.status).toBe("succeeded");
    expect(r2.status).toBe("succeeded");
  }, 90000);
});
