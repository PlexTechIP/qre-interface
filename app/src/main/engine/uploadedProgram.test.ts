import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { QreEngine } from "./qreEngine.js";
import type { RunConfig } from "../../shared/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PYTHON_BIN = path.join(__dirname, "python", ".venv", "bin", "python3");

function uploadConfig(filePath: string): RunConfig {
  return {
    schemaVersion: "1.0.0",
    id: "b1a2c3d4-0000-4000-8000-000000000001",
    name: "upload test",
    createdAt: "2026-07-09T18:22:00Z",
    application: { type: "uploaded", filePath, format: "openqasm", addToLibrary: false },
    architecture: { type: "gateBased", errorRate: 0.0001, gateTime: 50, measurementTime: 100, twoQubitGateTime: null },
    qecCode: "surface_code",
    magicStateFactory: "round_based",
    traceTransform: { type: "psspc", tStatesPerRotation: 20, ccxMagicStates: false },
    maxError: 1,
    qreVersion: "qdk-qre-v1-fixture",
  };
}

describe("uploaded program end to end", () => {
  it("estimates a valid uploaded OpenQASM program", async () => {
    const engine = new QreEngine(PYTHON_BIN);
    const result = await engine.run(uploadConfig(path.join(__dirname, "uploads", "sample-bell.qasm")));
    expect(result.status).toBe("succeeded");
    expect(result.frontier!.length).toBeGreaterThan(0);
  }, 60000);

  it("fails soft with COMPILE_ERROR for a garbled uploaded program", async () => {
    const engine = new QreEngine(PYTHON_BIN);
    const result = await engine.run(uploadConfig(path.join(__dirname, "uploads", "bad-sample.qasm")));
    expect(result.status).toBe("failed");
    expect(["COMPILE_ERROR", "ESTIMATION_FAILED"]).toContain(result.error?.code);
  }, 60000);
});
