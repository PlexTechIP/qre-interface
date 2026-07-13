import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execute } from "./execute.js";
import type { QreInvocation } from "./invocation.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PYTHON_BIN =
  process.env["QRE_PYTHON_BIN"] ??
  path.join(
    __dirname,
    "python",
    ".venv",
    process.platform === "win32" ? "Scripts/python.exe" : "bin/python3",
  );
const BENCHMARK_PROJECT = path.join(__dirname, "benchmarks", "qsharp-project");
const QRE_AVAILABLE =
  spawnSync(PYTHON_BIN, ["-c", "import qdk.qre"], { stdio: "ignore" })
    .status === 0;

function invocation(overrides: Partial<QreInvocation> = {}): QreInvocation {
  return {
    program: {
      sourcePath: BENCHMARK_PROJECT,
      format: "qsharp",
      entryExpr: "QuantumDynamics.Run()",
    },
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
    timeoutMs: 30_000,
    ...overrides,
  };
}

describe("execute", () => {
  describe.runIf(QRE_AVAILABLE)("with qdk.qre installed", () => {
    it("runs a real estimate and returns wrapper output including verbatim QDK data", async () => {
      const result = await execute(invocation(), PYTHON_BIN);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.raw["status"]).toBe("success");
        expect(Array.isArray(result.raw["frontier"])).toBe(true);
        expect(result.raw["verbatim"]).toMatchObject({
          entries: expect.any(Array),
          stats: expect.any(Object),
        });
      }
    }, 60_000);

    it("preserves a real estimator failure and its verbatim diagnostics", async () => {
      const result = await execute(
        invocation({
          architecture: {
            type: "gateBased",
            errorRate: 0.0001,
            gateTime: 100_000,
            measurementTime: 100_000,
            twoQubitGateTime: null,
          },
          maxError: 1e-12,
        }),
        PYTHON_BIN,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("ESTIMATION_FAILED");
        expect(result.raw?.["verbatim"]).toBeDefined();
      }
    }, 60_000);

    it("times out and returns TIMEOUT with raw null", async () => {
      const result = await execute(invocation({ timeoutMs: 1 }), PYTHON_BIN);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("TIMEOUT");
        expect(result.raw).toBeNull();
      }
    }, 15_000);
  });

  it("reports ENGINE_CRASH when the interpreter binary does not exist", async () => {
    const result = await execute(
      invocation(),
      path.join(__dirname, "does-not-exist", "python"),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("ENGINE_CRASH");
      expect(result.raw).toBeNull();
    }
  }, 15_000);
});
