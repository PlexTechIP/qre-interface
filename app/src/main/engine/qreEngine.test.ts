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

/**
 * Manual Logical Counts on Neutral Atom + Low-Move Surface Code. The two v1.1.0
 * headline features in one config, driven all the way through estimate.py.
 *
 * The v11 suites prove these values validate and serialize; only a real run
 * proves they estimate. Both week-4 P0 defects — the `LogicalCounts` import and
 * the `one_qubit_time` kwargs — were invisible to schema tests and would have
 * been caught here.
 */
const manualNeutralAtom: RunConfig = {
  schemaVersion: "1.1.0",
  id: "b3f1c2d4-5e6a-4b7c-8d9e-0f1a2b3c4d5e",
  name: "manual counts on neutral atom",
  createdAt: "2026-07-30T00:00:00Z",
  application: {
    type: "manualCounts",
    numQubits: 100,
    tCount: 20_000,
    rotationCount: 0,
    rotationDepth: 0,
    cczCount: 0,
    ccixCount: 0,
    measurementCount: 0,
  },
  architecture: {
    type: "neutralAtom",
    rydbergTime: 500,
    rydbergError: 0.001,
    singleQubitTime: 1000,
    singleQubitError: 0.0001,
    measurementTime: 10_000,
    measurementError: 0.0001,
    handoffTime: 0,
    atomSpacing: 3.0,
    maxVelocity: 0.25,
    maxAcceleration: 5000.0,
    surfaceCodeOneQubitTimeFactor: 1,
    surfaceCodeTwoQubitTimeFactor: 1,
  },
  qecCode: "low_move_surface_code",
  magicStateFactory: "round_based",
  traceTransform: {
    type: "psspc",
    tStatesPerRotation: 20,
    ccxMagicStates: false,
  },
  maxError: 0.01,
  qreVersion: "qdk-qre-v1-fixture",
};

/**
 * Physical-qubit counts confirmed on the pinned qdk 1.29.1.
 *
 * These are deliberately exact. They are the 1.30.0 canary: if the version bump
 * lands and these move, that is a real behaviour change to investigate and sign
 * off — not a flaky test to relax. Re-baseline only with a stated reason.
 */
const NEUTRAL_ATOM_ANCHORS = {
  small: 108_090, // numQubits 100, tCount 20,000
  large: 627_598, // numQubits 400, tCount 900,000
  gsj24: 103_733, // GSJ24 primary + both secondary factories
} as const;

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

  it.runIf(QRE_AVAILABLE)(
    "estimates Manual Logical Counts on Neutral Atom end to end",
    async () => {
      const result = await new QreEngine(PYTHON_BIN).run(manualNeutralAtom);
      expect(result.status).toBe("succeeded");
      expect(result.runId).toBe(manualNeutralAtom.id);
      expect(result.frontier!.length).toBeGreaterThan(0);
      expect(result.frontier![0]!.physicalQubits.value).toBeGreaterThan(0);
      expect(result.frontier![0]!.physicalQubits.value).toBe(
        NEUTRAL_ATOM_ANCHORS.small,
      );
    },
    120_000,
  );

  it.runIf(QRE_AVAILABLE)(
    "scales physical qubits with the manual counts it is given",
    async () => {
      const engine = new QreEngine(PYTHON_BIN);
      const small = await engine.run(manualNeutralAtom);
      const large = await engine.run({
        ...manualNeutralAtom,
        id: "c4e2d3a5-6f7b-4c8d-9e0f-1a2b3c4d5e6f",
        application: {
          type: "manualCounts",
          numQubits: 400,
          tCount: 900_000,
          rotationCount: 0,
          rotationDepth: 0,
          cczCount: 0,
          ccixCount: 0,
          measurementCount: 0,
        },
      });

      expect(small.status).toBe("succeeded");
      expect(large.status).toBe("succeeded");

      // A constant answer would still pass the smoke test above; this is what
      // proves the counts actually reach the estimator.
      expect(large.frontier![0]!.physicalQubits.value).toBeGreaterThan(
        small.frontier![0]!.physicalQubits.value,
      );
      expect(small.frontier![0]!.physicalQubits.value).toBe(
        NEUTRAL_ATOM_ANCHORS.small,
      );
      expect(large.frontier![0]!.physicalQubits.value).toBe(
        NEUTRAL_ATOM_ANCHORS.large,
      );
    },
    240_000,
  );

  it.runIf(QRE_AVAILABLE)(
    "reaches the engine with GSJ24 plus both secondary factories",
    async () => {
      const engine = new QreEngine(PYTHON_BIN);
      const roundBased = await engine.run(manualNeutralAtom);
      const gsj24 = await engine.run({
        ...manualNeutralAtom,
        id: "d5f3e4b6-7a8c-4d9e-0f1a-2b3c4d5e6f7a",
        magicStateFactory: "gsj24",
        secondaryFactories: ["magic_up_to_clifford", "gsj24_ccx"],
        // gsj24_ccx is yoked to this flag — turning either on turns the other on.
        traceTransform: {
          type: "psspc",
          tStatesPerRotation: 20,
          ccxMagicStates: true,
        },
      });

      expect(gsj24.status).toBe("succeeded");
      expect(gsj24.frontier![0]!.physicalQubits.value).not.toBe(
        roundBased.frontier![0]!.physicalQubits.value,
      );
      expect(gsj24.frontier![0]!.physicalQubits.value).toBe(
        NEUTRAL_ATOM_ANCHORS.gsj24,
      );
    },
    240_000,
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
