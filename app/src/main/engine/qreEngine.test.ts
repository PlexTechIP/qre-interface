import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import type { RunConfig } from "../../shared/types.js";
import { resolvePythonBin } from "./pythonBin.js";
import { QreEngine } from "./qreEngine.js";

const PYTHON_BIN = resolvePythonBin();
const QRE_AVAILABLE =
  spawnSync(PYTHON_BIN, ["-c", "import qdk.qre"], { stdio: "ignore" })
    .status === 0;

const config: RunConfig = {
  schemaVersion: "1.1.0",
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
  traceTransform: {
    type: "psspc",
    tStatesPerRotation: 20,
    ccxMagicStates: false,
  },
  maxError: 1,
  qreVersion: "qdk-qre-v1-fixture",
};

describe("QreEngine", () => {
  it.runIf(QRE_AVAILABLE)(
    "runs a real benchmark end to end with verbatim raw and appendix fields",
    async () => {
      const result = await new QreEngine(PYTHON_BIN).run(config);
      expect(result.status).toBe("succeeded");
      expect(result.runId).toBe(config.id);
      expect(result.frontier!.length).toBeGreaterThan(0);
      expect(result.frontier![0]!.additional?.["source"]?.value).toBe("qsharp");
      expect(result.raw).toMatchObject({
        entries: expect.any(Array),
        stats: expect.any(Object),
      });
      expect(result.qreVersion).toBe("1.29.1");
    },
    60_000,
  );

  it("resolves with INVALID_CONFIG for a bad benchmark id", async () => {
    const badConfig: RunConfig = {
      ...config,
      application: { type: "benchmark", benchmarkId: "does-not-exist" },
    };
    const result = await new QreEngine(PYTHON_BIN).run(badConfig);
    expect(result.status).toBe("failed");
    expect(result.error?.code).toBe("INVALID_CONFIG");
    expect(result.raw).toBeNull();
  });
});
