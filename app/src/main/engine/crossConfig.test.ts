import { describe, expect, it } from "vitest";
import { QreEngine } from "./qreEngine.js";
import type { RunConfig, RunResult } from "../../shared/types.js";
import { SCHEMA_VERSION } from "../../shared/types.js";
import { resolvePythonBin } from "./pythonBin.js";

const PYTHON_BIN = resolvePythonBin();

function config(id: string, overrides: Partial<RunConfig>): RunConfig {
  return {
    schemaVersion: SCHEMA_VERSION,
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
    traceTransform: { tStatesPerRotation: 20, ccxMagicStates: false, slowDownFactor: 1.0 },
    maxError: 1,
    qreVersion: "qdk-qre-v1-fixture",
    ...overrides,
  };
}

describe("cross-config sanity", () => {
  it("produces plausible differing outputs for the same benchmark across three configs", async () => {
    const engine = new QreEngine(PYTHON_BIN);
    const configs = [
      config("55555555-5555-4555-8555-555555555555", {}),
      config("66666666-6666-4666-8666-666666666666", {
        maxError: 0.01,
      }),
      config("77777777-7777-4777-8777-777777777777", {
        architecture: {
          type: "majorana",
          errorRate: 0.00001,
          operationTime: 1000,
        },
        qecCode: "three_aux",
        // A smaller lattice than the spec default, because Majorana/Three-Aux
        // genuinely has no feasible frontier point for the default 10x10 / 34-step
        // circuit even at maxError = 1 — the accumulated error exceeds 1 at every
        // distance the estimator considers. This case is about the architecture
        // producing a DIFFERENT answer, so it needs one that exists.
        parameters: {
          latticeN1: 3,
          latticeN2: 3,
          totalTime: 9.0,
          trotterStep: 0.9,
          couplingJ: 1.0,
          fieldG: 1.0,
        },
      }),
    ];
    const inputTuples = new Set(
      configs.map(
        (item) =>
          `${item.architecture.type}:${item.qecCode}:${String(item.maxError)}`,
      ),
    );
    expect(inputTuples.size).toBe(3);

    const results: RunResult[] = [];
    for (const item of configs) results.push(await engine.run(item));
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

    // Pinned qdk[qre] 1.30.0 regression anchors derived from real local runs
    // for GateBased/Surface/maxError=1, GateBased/Surface/maxError=.01, and
    // Majorana/ThreeAux/maxError=1 respectively. The first two run Quantum
    // Dynamics at its spec defaults (10x10 lattice, 34 Trotter steps); the third
    // runs the 3x3 lattice configured above.
    // If Microsoft publishes canonical tutorial numbers for this exact trio,
    // replace these package-derived anchors with those external references.
    expect(firstRows[0]!.runtime.value).toBe(43029000);
    expect(firstRows[1]!.runtime.value).toBe(62153000);
    expect(firstRows[2]!.runtime.value).toBe(24681000);
  }, 120000);
});
