import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RESULT_FIELD_KEYS, type RunConfig } from "../../shared/types.js";
import type { ExecuteResult } from "./execute.js";
import { outputToResult } from "./outputToResult.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CAPTURE_DIR = path.resolve(
  __dirname,
  "../../../../docs/week-2/team-3/qre-output-captures",
);

function loadCapture(name: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(path.join(CAPTURE_DIR, `${name}.output.json`), "utf8"),
  ) as Record<string, unknown>;
}

const config: RunConfig = {
  schemaVersion: "1.0.0",
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
  qreVersion: "fixture-version-must-not-win",
};

const verbatim = {
  entries: [
    { qubits: 829_766, runtime: 19_100_000, source: { roots: [0], nodes: [] } },
  ],
  stats: { pareto_results: 1 },
  name: null,
};

const ALL_REPORTED_PROPERTIES: Record<string, unknown> = {
  PHYSICAL_COMPUTE_QUBITS: 1,
  PHYSICAL_FACTORY_QUBITS: 2,
  PHYSICAL_MEMORY_QUBITS: 3,
  LOGICAL_COMPUTE_QUBITS: 4,
  LOGICAL_MEMORY_QUBITS: 5,
  ALGORITHM_COMPUTE_QUBITS: 6,
  ALGORITHM_MEMORY_QUBITS: 7,
  LOGICAL_CYCLE_TIME: 8,
  CODE_CYCLE_TIME: 9,
  RUNTIME_SINGLE_SHOT: 10,
  EXPECTED_SHOTS: 11,
  EVALUATION_TIME: 12,
  DISTANCE: 13,
  NUM_TS_PER_ROTATION: 14,
  BLOCK_SIZE: 15,
  FEASIBILITY: true,
  LOSS: 0.01,
  TARGET_YEAR: 2035,
  NAME: "estimate",
  ASSUMPTIONS: ["baseline"],
  BASE_SYSTEM_COST: 16,
  SHOT_COST: 17,
  COST_PER_QUBIT: 18,
  COST_PER_HOUR: 19,
  COST_PER_QUBIT_PER_HOUR: 20,
  ATOM_SPACING: 21,
  DATA_QUBIT_SPACING: 22,
  VELOCITY: 23,
  ACCELERATION: 24,
  SURFACE_CODE_ONE_QUBIT_TIME_FACTOR: 25,
  SURFACE_CODE_TWO_QUBIT_TIME_FACTOR: 26,
  MOLECULE: "H2",
};

function successRaw(rowOverrides: Record<string, unknown> = {}): ExecuteResult {
  return {
    ok: true,
    raw: {
      status: "success",
      engineApi: "qdk-qre-estimate",
      qreVersion: "1.29.1",
      verbatim,
      frontier: [
        {
          qubits: 829_766,
          runtime: 19_100_000,
          error: 0.00042,
          distance: 19,
          codeCycleTime: 350,
          logicalCycleTime: 5_200,
          factories: [{ stateType: "T", copies: 216 }],
          source: "qsharp",
          properties: {
            PHYSICAL_COMPUTE_QUBITS: 700_000,
            PHYSICAL_FACTORY_QUBITS: 129_766,
            ALGORITHM_MEMORY_QUBITS: 0,
            EVALUATION_TIME: 17,
            NUM_TS_PER_ROTATION: 20,
            FEASIBILITY: true,
            ASSUMPTIONS: "baseline",
          },
          ...rowOverrides,
        },
      ],
    },
  };
}

describe("outputToResult", () => {
  for (const [name, expectedRows] of [
    ["multi-row-gatebased-psspc", 5],
    ["single-row-gatebased-psspc", 1],
  ] as const) {
    it(`maps the committed ${name} real output without altering its verbatim blob`, () => {
      const wrapperOutput = loadCapture(name);
      const result = outputToResult(
        config,
        { ok: true, raw: wrapperOutput },
        "t0",
        "t1",
      );
      expect(result.status).toBe("succeeded");
      expect(result.frontier).toHaveLength(expectedRows);
      expect(result.raw).toEqual(wrapperOutput["verbatim"]);
      expect(result.qreVersion).toBe("1.29.1");
    });
  }

  it("maps defaults, stores only the dedicated verbatim QDK blob as raw, and trusts runtime version", () => {
    const result = outputToResult(
      config,
      successRaw(),
      "2026-07-09T18:22:03Z",
      "2026-07-09T18:22:06Z",
    );
    expect(result.status).toBe("succeeded");
    expect(result.raw).toBe(verbatim);
    expect(result.qreVersion).toBe("1.29.1");
    const row = result.frontier![0]!;
    expect(row.physicalQubits).toMatchObject({
      value: 829_766,
      unit: "qubits",
    });
    expect(row.runtime).toMatchObject({ value: 19_100_000, unit: "ns" });
    expect(row.logicalCycleTime.value).toBe(5_200);
    expect(row.codeDistance.value).toBe(19);
    expect(row.totalError.value).toBe(0.00042);
    expect(row.factories.value).toEqual([{ stateType: "T", copies: 216 }]);
  });

  it("maps all reported appendix properties to app-facing RESULT_FIELD_KEYS", () => {
    const result = outputToResult(config, successRaw(), "t0", "t1");
    expect(result.frontier![0]!.additional).toMatchObject({
      source: { value: "qsharp" },
      codeCycleTime: { value: 350, unit: "ns" },
      physicalComputeQubits: { value: 700_000, unit: "qubits" },
      physicalFactoryQubits: { value: 129_766, unit: "qubits" },
      algorithmMemoryQubits: { value: 0, unit: "qubits" },
      evaluationTime: { value: 17 },
      numTsPerRotation: { value: 20 },
      feasibility: { value: true },
      assumptions: { value: "baseline" },
    });
  });

  it("covers every one of the 31 non-default RESULT_FIELD_KEYS when reported", () => {
    const result = outputToResult(
      config,
      successRaw({ properties: ALL_REPORTED_PROPERTIES }),
      "t0",
      "t1",
    );
    const defaultKeys = new Set([
      "physicalQubits",
      "runtime",
      "logicalCycleTime",
      "factories",
      "totalError",
      "codeDistance",
    ]);
    const expected = RESULT_FIELD_KEYS.filter(
      (key) => !defaultKeys.has(key),
    ).sort();
    expect(Object.keys(result.frontier![0]!.additional ?? {}).sort()).toEqual(
      expected,
    );
  });

  it("keeps zero factories and zero appendix values", () => {
    const result = outputToResult(
      config,
      successRaw({ factories: [] }),
      "t0",
      "t1",
    );
    expect(result.frontier![0]!.factories.value).toEqual([]);
    expect(
      result.frontier![0]!.additional?.["algorithmMemoryQubits"]?.value,
    ).toBe(0);
  });

  it("fails if any required default is absent while preserving verbatim raw", () => {
    const result = outputToResult(
      config,
      successRaw({ distance: null }),
      "t0",
      "t1",
    );
    expect(result.status).toBe("failed");
    expect(result.error?.code).toBe("ESTIMATION_FAILED");
    expect(result.frontier).toBeNull();
    expect(result.raw).toBe(verbatim);
  });

  it("maps structured estimator failure diagnostics from the dedicated verbatim blob", () => {
    const diagnostics = {
      error: { type: "QSharpError", message: "bad program" },
    };
    const executeResult: ExecuteResult = {
      ok: false,
      code: "COMPILE_ERROR",
      message: "bad program; correct the source and retry.",
      raw: {
        status: "failed",
        code: "COMPILE_ERROR",
        qreVersion: "1.29.1",
        verbatim: diagnostics,
      },
    };
    const result = outputToResult(config, executeResult, "t0", "t1");
    expect(result.status).toBe("failed");
    expect(result.raw).toBe(diagnostics);
    expect(result.qreVersion).toBe("1.29.1");
  });

  it("uses raw null only when the engine produced no output", () => {
    const executeResult: ExecuteResult = {
      ok: false,
      code: "TIMEOUT",
      message: "Timed out; retry.",
      raw: null,
    };
    const result = outputToResult(config, executeResult, "t0", "t1");
    expect(result.raw).toBeNull();
    expect(result.error?.code).toBe("TIMEOUT");
  });

  it("preserves transport diagnostics unchanged when no verbatim blob exists", () => {
    const diagnostics = {
      stdout: "partial output\n",
      stderr: "engine traceback\n",
      exitCode: 3,
    };
    const executeResult: ExecuteResult = {
      ok: false,
      code: "ENGINE_CRASH",
      message: "Engine crashed; inspect raw diagnostics and retry.",
      raw: diagnostics,
    };
    const result = outputToResult(config, executeResult, "t0", "t1");
    expect(result.raw).toBe(diagnostics);
  });
});
