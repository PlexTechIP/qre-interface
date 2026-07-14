import { describe, expect, it } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { QreEngine } from "./qreEngine.js";
import type { RunConfig } from "../../shared/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PYTHON_BIN = path.join(__dirname, "python", ".venv", "bin", "python3");

function config(id: string, overrides: Partial<RunConfig>): RunConfig {
  return {
    schemaVersion: "1.0.0",
    id,
    name: "cross-config quantum dynamics",
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
    ...overrides,
  };
}

describe("cross-config sanity", () => {
  it("produces plausible differing outputs for the same benchmark across three configs", async () => {
    const engine = new QreEngine(PYTHON_BIN);
    const baseline = await engine.run(
      config("55555555-5555-4555-8555-555555555555", {}),
    );
    const latticeSurgery = await engine.run(
      config("66666666-6666-4666-8666-666666666666", {
        traceTransform: { type: "latticeSurgery", slowDownFactor: 1.0 },
      }),
    );
    const majorana = await engine.run(
      config("77777777-7777-4777-8777-777777777777", {
        architecture: {
          type: "majorana",
          errorRate: 0.00001,
          operationTime: 1000,
        },
        qecCode: "three_aux",
      }),
    );

    const results = [baseline, latticeSurgery, majorana];
    for (const result of results) {
      expect(result.status).toBe("succeeded");
      expect(result.frontier?.length).toBeGreaterThan(0);
      expect(result.frontier![0]!.physicalQubits.value).toBeGreaterThan(0);
      expect(result.frontier![0]!.runtime.value).toBeGreaterThan(0);
      expect(result.frontier![0]!.codeDistance.value).toBeGreaterThan(0);
    }

    const firstRows = results.map((result) => result.frontier![0]!);
    const signatures = new Set(
      firstRows.map((row) =>
        [
          row.physicalQubits.value,
          row.runtime.value,
          row.totalError.value,
          row.codeDistance.value,
        ].join(":"),
      ),
    );
    expect(signatures.size).toBe(3);

    // Pinned qdk[qre] 1.29.1 regression anchors for the same benchmark/configs.
    // If Microsoft publishes canonical tutorial numbers for this exact trio,
    // replace these package-derived anchors with those external references.
    expect(firstRows[0]!.runtime.value).toBe(585900);
    expect(firstRows[1]!.runtime.value).toBe(320250);
    expect(firstRows[2]!.runtime.value).toBe(10602000);
  }, 120000);
});
