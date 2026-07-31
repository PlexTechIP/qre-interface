import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { RunConfig } from "../../shared/types.js";
import { resolvePythonBin } from "./pythonBin.js";
import { QreEngine } from "./qreEngine.js";

const PYTHON_BIN = resolvePythonBin();
const PYTHON_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "python");
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

/**
 * Majorana + ThreeAux + maxError 1 — the same trio crossConfig.test.ts pins its
 * third anchor on. `operationTime` is the field that reached every layer of the
 * stack except the engine until it was mapped in build_architecture.
 */
const majorana: RunConfig = {
  ...config,
  id: "e6a4f5c7-8b9d-4e0f-1a2b-3c4d5e6f7a8b",
  name: "majorana operation time",
  architecture: { type: "majorana", errorRate: 0.00001, operationTime: 1000 },
  qecCode: "three_aux",
};

/**
 * Runtime at operationTime 1000 (QDK's default and the UI's). Pinned because it
 * is the value crossConfig.test.ts:88 already anchors — mapping `time` must not
 * move it, which is what makes the mapping a zero-migration change.
 */
const MAJORANA_RUNTIME_AT_1000 = 10_602_000;

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
      expect(result.qreVersion).toBe("1.30.0");
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

  it.runIf(QRE_AVAILABLE)(
    "scales Majorana runtime linearly with operationTime",
    async () => {
      const engine = new QreEngine(PYTHON_BIN);
      const atDefault = await engine.run(majorana);
      const atQuarter = await engine.run({
        ...majorana,
        id: "f7b5a6d8-9c0e-4f1a-2b3c-4d5e6f7a8b9c",
        architecture: { type: "majorana", errorRate: 0.00001, operationTime: 250 },
      });

      expect(atDefault.status).toBe("succeeded");
      expect(atQuarter.status).toBe("succeeded");

      const slow = atDefault.frontier![0]!;
      const fast = atQuarter.frontier![0]!;

      // Mapping `time` must be output-identical at the default, or every
      // existing fixture, capture and saved run silently changes meaning.
      expect(slow.runtime.value).toBe(MAJORANA_RUNTIME_AT_1000);

      // Quartering the operation time quarters the runtime exactly, and moves
      // nothing else. A regression that drops the mapping makes these equal.
      expect(fast.runtime.value).toBe(MAJORANA_RUNTIME_AT_1000 / 4);
      expect(slow.runtime.value / fast.runtime.value).toBe(4);
      expect(fast.physicalQubits.value).toBe(slow.physicalQubits.value);
      expect(fast.totalError.value).toBe(slow.totalError.value);
    },
    240_000,
  );

  it.runIf(QRE_AVAILABLE)(
    "pins the QDK NeutralAtom defaults the contract does not model",
    () => {
      // data_qubit_spacing and target_year are absent from the field spec, so
      // the wrapper never sets them and we inherit whatever QDK defaults to.
      // They are inert on 1.30.0 — that is a property of this version, not a
      // guarantee. Pinning them makes a future bump fail here, loudly, instead
      // of silently moving every Neutral Atom estimate.
      const probe = spawnSync(
        PYTHON_BIN,
        [
          "-c",
          [
            "import json",
            "from estimate import build_architecture",
            `arch = json.loads(${JSON.stringify(
              JSON.stringify(manualNeutralAtom.architecture),
            )})`,
            "na = build_architecture(arch)",
            "print(json.dumps({'spacing': na.data_qubit_spacing, 'year': na.target_year}))",
          ].join("\n"),
        ],
        { cwd: PYTHON_DIR, encoding: "utf8" },
      );

      expect(probe.status).toBe(0);
      const probed = JSON.parse(probe.stdout.trim()) as {
        spacing: number;
        year: number | null;
      };
      expect(probed.spacing).toBe(12.0);
      expect(probed.year).toBeNull();
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
