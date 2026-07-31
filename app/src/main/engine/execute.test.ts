import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  execute,
  interpretProcessCompletion,
  processDiagnosticsRaw,
} from "./execute.js";
import type { QreInvocation } from "./invocation.js";
import { resolvePythonBin } from "./pythonBin.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PYTHON_BIN = resolvePythonBin();
const BENCHMARK_PROJECT = path.join(__dirname, "benchmarks", "qsharp-project");
const QRE_AVAILABLE =
  spawnSync(PYTHON_BIN, ["-c", "import qdk.qre"], { stdio: "ignore" })
    .status === 0;

function invocation(overrides: Partial<QreInvocation> = {}): QreInvocation {
  return {
    program: {
      sourcePath: BENCHMARK_PROJECT,
      format: "qsharp",
      // Small lattice: this suite exercises the subprocess boundary, not the
      // benchmark, so it wants the cheapest circuit that still estimates.
      entryExpr: "QuantumDynamics.Run(2, 2, 6.0, 0.9, 1.0, 1.0)",
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
  describe("process completion", () => {
    it("preserves complete stdout and stderr for a nonzero exit", () => {
      const result = interpretProcessCompletion(
        9,
        "partial stdout\n",
        "full diagnostic\nsecond line\n",
      );
      expect(result).toMatchObject({
        ok: false,
        code: "ENGINE_CRASH",
        raw: {
          stdout: "partial stdout\n",
          stderr: "full diagnostic\nsecond line\n",
          exitCode: 9,
        },
      });
    });

    it("preserves complete streams when stdout is not JSON", () => {
      const result = interpretProcessCompletion(
        0,
        "not-json\n",
        "parser detail\n",
      );
      expect(result).toMatchObject({
        ok: false,
        code: "ENGINE_CRASH",
        raw: {
          stdout: "not-json\n",
          stderr: "parser detail\n",
          exitCode: 0,
        },
      });
    });

    it("preserves the original streams for an unrecognized JSON status", () => {
      const stdout = '{\n  "status": "unexpected",\n  "detail": 0\n}\n';
      const result = interpretProcessCompletion(0, stdout, "warning\n");
      expect(result).toMatchObject({
        ok: false,
        code: "ENGINE_CRASH",
        raw: { stdout, stderr: "warning\n", exitCode: 0 },
      });
    });

    it("uses raw null only when the process emitted no output", () => {
      expect(interpretProcessCompletion(2, "", "")).toMatchObject({
        ok: false,
        raw: null,
      });
      expect(processDiagnosticsRaw("partial", "", null)).toEqual({
        stdout: "partial",
        stderr: "",
        exitCode: null,
      });
    });
  });

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
