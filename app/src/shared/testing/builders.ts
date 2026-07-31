/**
 * Test-support data builders. Replaces the deleted JSON fixtures (MockEngine's
 * result fixtures, MOCK_RUN_RECORDS, and the renderer FIXTURE_SCENARIOS) with
 * typed, programmatic constructors. This module is TEST-ONLY — it lives in
 * shared/ so renderer (jsdom), main (node), and shared tests can all import it,
 * and it imports only `../types`, so it is never pulled into a production bundle.
 *
 * Two fidelity contracts matter:
 *  - RESULT_SCENARIOS reproduce the four result/config fixtures VALUE-FOR-VALUE
 *    (the Results/RawExplorer tests assert exact numbers + verbatim `raw`).
 *  - SAMPLE_RUN_RECORDS reproduce the 7-record corpus (ids, names, filterable
 *    fields, launch-time ordering) the store/history tests pin.
 */
 
import {
  SCHEMA_VERSION,
  makeRunRecord,
  type FactoryMetric,
  type FrontierRow,
  type NumericMetric,
  type ResultsPhase,
  type RunConfig,
  type RunResult,
  type RunRecord,
} from "../types";
 
// ---------------------------------------------------------------------------
// Metric helpers
// ---------------------------------------------------------------------------
 
function metric(value: number, unit: string, display?: string): NumericMetric {
  return { value, unit, display: display ?? String(value) };
}
 
function factoriesOf(copies: number): FactoryMetric {
  return {
    value: [{ stateType: "T", copies }],
    unit: "factories",
    display: `${copies} x T`,
  };
}
 
// ---------------------------------------------------------------------------
// Atomic builders
// ---------------------------------------------------------------------------
 
/** A structurally complete, schema-valid succeeded frontier row (6 default metrics). */
export function buildFrontierRow(overrides: Partial<FrontierRow> = {}): FrontierRow {
  return {
    physicalQubits: metric(1_000_000, "qubits", "1,000,000"),
    runtime: metric(10_000_000, "ns", "10.0 ms"),
    logicalCycleTime: metric(5000, "ns", "5.0 us"),
    factories: factoriesOf(200),
    totalError: metric(0.0005, "probability", "5.0e-4"),
    codeDistance: metric(19, "", "19"),
    additional: {
      physicalFactoryQubits: metric(500_000, "qubits", "500,000"),
    },
    ...overrides,
  };
}
 
/** A default quantum-dynamics gateBased config; override any field. */
export function buildRunConfig(overrides: Partial<RunConfig> = {}): RunConfig {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: "acaf1c0e-a716-41bc-9774-598cacee033f",
    name: "Quantum Dynamics - GateBased 1e-4 - Surface - PSSPC",
    createdAt: "2026-07-16T09:00:00Z",
    application: { type: "benchmark", benchmarkId: "quantum-dynamics" },
    architecture: {
      type: "gateBased",
      errorRate: 0.0001,
      gateTime: 50,
      measurementTime: 100,
      twoQubitGateTime: null,
    },
    qecCode: "surface_code",
    magicStateFactories: ["round_based"],
    traceTransform: { tStatesPerRotation: 20, ccxMagicStates: false, slowDownFactor: 1.0 },
    maxError: 1,
    qreVersion: "qdk-qre-1.29.1",
    ...overrides,
  };
}
 
/** A default succeeded result (one complete row); override to vary. */
export function buildRunResult(overrides: Partial<RunResult> = {}): RunResult {
  return {
    schemaVersion: SCHEMA_VERSION,
    runId: "acaf1c0e-a716-41bc-9774-598cacee033f",
    status: "succeeded",
    error: null,
    frontier: [buildFrontierRow()],
    raw: { status: "success", engineApi: "qdk-qre-estimation-table" },
    qreVersion: "qdk-qre-1.29.1",
    startedAt: "2026-07-16T09:00:03Z",
    completedAt: "2026-07-16T09:00:06Z",
    ...overrides,
  };
}
 
/** Assemble a record; `result.runId` is forced to `config.id` so it always validates. */
export function buildRunRecord(
  opts: {
    config?: Partial<RunConfig>;
    result?: Partial<RunResult>;
    savedAt?: string;
  } = {},
): RunRecord {
  const config = buildRunConfig(opts.config);
  const result = buildRunResult({ ...opts.result, runId: config.id });
  return makeRunRecord(config, result, opts.savedAt ?? "2026-07-16T09:00:07Z");
}
 
// ---------------------------------------------------------------------------
// Named result/config scenarios — reproduced VALUE-FOR-VALUE from the deleted
// fixtures (runresult.success/success-large/success-sparse/failed and
// runconfig.benchmark/large/sparse/failing). A fidelity gate asserts equality
// against the originals before those fixtures are deleted.
// ---------------------------------------------------------------------------
 
const SUCCESS_RESULT: RunResult = {
  schemaVersion: SCHEMA_VERSION,
  runId: "acaf1c0e-a716-41bc-9774-598cacee033f",
  status: "succeeded",
  error: null,
  frontier: [
    {
      physicalQubits: { value: 829766, unit: "qubits", display: "829,766" },
      runtime: { value: 19100000, unit: "ns", display: "19.1 ms" },
      logicalCycleTime: { value: 5200, unit: "ns", display: "5.2 us" },
      factories: { value: [{ stateType: "T", copies: 216 }], unit: "factories", display: "216 x T" },
      totalError: { value: 0.00042, unit: "probability", display: "4.2e-4" },
      codeDistance: { value: 19, unit: "", display: "19" },
      additional: {
        physicalFactoryQubits: { value: 610920, unit: "qubits", display: "610,920" },
        runtimeSingleShot: { value: 19100000, unit: "ns", display: "19.1 ms" },
        expectedShots: { value: 1, unit: "shots", display: "1" },
        numTsPerRotation: { value: 20, unit: "T states", display: "20" },
        source: { value: "qsharp", unit: "", display: "Q#" },
        feasibility: { value: "feasible", unit: "", display: "Feasible" },
      },
    },
    {
      physicalQubits: { value: 1048200, unit: "qubits", display: "1,048,200" },
      runtime: { value: 14300000, unit: "ns", display: "14.3 ms" },
      logicalCycleTime: { value: 4800, unit: "ns", display: "4.8 us" },
      factories: { value: [{ stateType: "T", copies: 288 }], unit: "factories", display: "288 x T" },
      totalError: { value: 0.00061, unit: "probability", display: "6.1e-4" },
      codeDistance: { value: 17, unit: "", display: "17" },
      additional: {
        physicalFactoryQubits: { value: 823680, unit: "qubits", display: "823,680" },
        runtimeSingleShot: { value: 14300000, unit: "ns", display: "14.3 ms" },
        expectedShots: { value: 1, unit: "shots", display: "1" },
        numTsPerRotation: { value: 20, unit: "T states", display: "20" },
      },
    },
    {
      physicalQubits: { value: 652440, unit: "qubits", display: "652,440" },
      runtime: { value: 31800000, unit: "ns", display: "31.8 ms" },
      logicalCycleTime: { value: 6800, unit: "ns", display: "6.8 us" },
      factories: { value: [{ stateType: "T", copies: 144 }], unit: "factories", display: "144 x T" },
      totalError: { value: 0.00031, unit: "probability", display: "3.1e-4" },
      codeDistance: { value: 21, unit: "", display: "21" },
      additional: {
        physicalFactoryQubits: { value: 403200, unit: "qubits", display: "403,200" },
        runtimeSingleShot: { value: 31800000, unit: "ns", display: "31.8 ms" },
        expectedShots: { value: 1, unit: "shots", display: "1" },
        numTsPerRotation: { value: 20, unit: "T states", display: "20" },
      },
    },
  ],
  raw: {
    status: "success",
    engineApi: "qdk-qre-estimation-table",
    application: "quantum-dynamics",
    configuration: {
      architecture: "GateBased",
      qecCode: "surface_code",
      magicStateFactories: ["round_based"],
      traceTransform: "psspc",
      maxError: 1,
    },
    frontier: [
      {
        qubits: 829766,
        runtime: 19100000,
        error: 0.00042,
        factories: [{ stateType: "T", copies: 216 }],
        LOGICAL_CYCLE_TIME: 5200,
        DISTANCE: 19,
        PHYSICAL_FACTORY_QUBITS: 610920,
        RUNTIME_SINGLE_SHOT: 19100000,
        EXPECTED_SHOTS: 1,
        NUM_TS_PER_ROTATION: 20,
        source: "qsharp",
        FEASIBILITY: "feasible",
      },
      {
        qubits: 1048200,
        runtime: 14300000,
        error: 0.00061,
        factories: [{ stateType: "T", copies: 288 }],
        LOGICAL_CYCLE_TIME: 4800,
        DISTANCE: 17,
        PHYSICAL_FACTORY_QUBITS: 823680,
        RUNTIME_SINGLE_SHOT: 14300000,
        EXPECTED_SHOTS: 1,
        NUM_TS_PER_ROTATION: 20,
      },
      {
        qubits: 652440,
        runtime: 31800000,
        error: 0.00031,
        factories: [{ stateType: "T", copies: 144 }],
        LOGICAL_CYCLE_TIME: 6800,
        DISTANCE: 21,
        PHYSICAL_FACTORY_QUBITS: 403200,
        RUNTIME_SINGLE_SHOT: 31800000,
        EXPECTED_SHOTS: 1,
        NUM_TS_PER_ROTATION: 20,
      },
    ],
  },
  qreVersion: "qdk-qre-v1-fixture",
  startedAt: "2026-07-09T18:22:03Z",
  completedAt: "2026-07-09T18:22:06Z",
};
 
const LARGE_RESULT: RunResult = {
  schemaVersion: SCHEMA_VERSION,
  runId: "1c4b86d6-8a26-4fa0-98a9-271b09e9abfe",
  status: "succeeded",
  error: null,
  frontier: [
    {
      physicalQubits: { value: 55797618, unit: "qubits", display: "55,797,618" },
      runtime: { value: 243004934779200000, unit: "ns", display: "7.7 yr" },
      logicalCycleTime: { value: 19800000, unit: "ns", display: "19.8 ms" },
      factories: { value: [{ stateType: "T", copies: 12 }], unit: "factories", display: "12 x T" },
      totalError: { value: 3.000000000000005e-19, unit: "probability", display: "3.00e-19" },
      codeDistance: { value: 33, unit: "", display: "33" },
      additional: {
        physicalComputeQubits: { value: 55497618, unit: "qubits", display: "55,497,618" },
        physicalFactoryQubits: { value: 300000, unit: "qubits", display: "300,000" },
        runtimeSingleShot: { value: 243004934779200000, unit: "ns", display: "7.7 yr" },
        expectedShots: { value: 1, unit: "shots", display: "1" },
        numTsPerRotation: { value: 13, unit: "T states", display: "13" },
        source: { value: "qsharp", unit: "", display: "Q#" },
      },
    },
    {
      physicalQubits: { value: 70422000, unit: "qubits", display: "70,422,000" },
      runtime: { value: 171800000000000000, unit: "ns", display: "5.4 yr" },
      logicalCycleTime: { value: 15800000, unit: "ns", display: "15.8 ms" },
      factories: { value: [{ stateType: "T", copies: 18 }], unit: "factories", display: "18 x T" },
      totalError: { value: 5.2e-19, unit: "probability", display: "5.2e-19" },
      codeDistance: { value: 31, unit: "", display: "31" },
      additional: {
        physicalComputeQubits: { value: 69732000, unit: "qubits", display: "69,732,000" },
        physicalFactoryQubits: { value: 690000, unit: "qubits", display: "690,000" },
        runtimeSingleShot: { value: 171800000000000000, unit: "ns", display: "5.4 yr" },
        expectedShots: { value: 1, unit: "shots", display: "1" },
      },
    },
  ],
  raw: {
    status: "success",
    engineApi: "qdk-qre-estimation-table",
    application: "shors-factoring",
    configuration: {
      architecture: "GateBased",
      qecCode: "surface_code",
      magicStateFactories: ["litinski19"],
      traceTransform: "latticeSurgery",
      maxError: 0.001,
    },
    frontier: [
      {
        qubits: 55797618,
        runtime: 243004934779200000,
        error: 3.000000000000005e-19,
        factories: [{ stateType: "T", copies: 12 }],
        PHYSICAL_COMPUTE_QUBITS: 55497618,
        PHYSICAL_FACTORY_QUBITS: 300000,
        LOGICAL_CYCLE_TIME: 19800000,
        RUNTIME_SINGLE_SHOT: 243004934779200000,
        EXPECTED_SHOTS: 1,
        DISTANCE: 33,
        NUM_TS_PER_ROTATION: 13,
        source: "qsharp",
      },
      {
        qubits: 70422000,
        runtime: 171800000000000000,
        error: 5.2e-19,
        factories: [{ stateType: "T", copies: 18 }],
        PHYSICAL_COMPUTE_QUBITS: 69732000,
        PHYSICAL_FACTORY_QUBITS: 690000,
        LOGICAL_CYCLE_TIME: 15800000,
        RUNTIME_SINGLE_SHOT: 171800000000000000,
        EXPECTED_SHOTS: 1,
        DISTANCE: 31,
      },
    ],
  },
  qreVersion: "qdk-qre-v1-fixture",
  startedAt: "2026-07-09T18:30:04Z",
  completedAt: "2026-07-09T18:30:07Z",
};
 
const SPARSE_RESULT: RunResult = {
  schemaVersion: SCHEMA_VERSION,
  runId: "5116295f-0220-442f-b06e-abe22e8acd29",
  status: "succeeded",
  error: null,
  frontier: [
    {
      physicalQubits: { value: 126400, unit: "qubits", display: "126,400" },
      runtime: { value: 880000, unit: "ns", display: "880 us" },
      logicalCycleTime: { value: 1000, unit: "ns", display: "1.0 us" },
      factories: { value: [], unit: "factories", display: "none" },
      totalError: { value: 0.00012, unit: "probability", display: "1.2e-4" },
      codeDistance: { value: 9, unit: "", display: "9" },
      additional: {
        physicalFactoryQubits: { value: 0, unit: "qubits", display: "0" },
        runtimeSingleShot: { value: 880000, unit: "ns", display: "880 us" },
        expectedShots: { value: 1, unit: "shots", display: "1" },
        numTsPerRotation: { value: 20, unit: "T states", display: "20" },
        source: { value: "qsharp", unit: "", display: "Q#" },
        feasibility: { value: "feasible", unit: "", display: "Feasible" },
      },
    },
  ],
  raw: {
    status: "success",
    engineApi: "qdk-qre-estimation-table",
    application: "phase-estimation",
    configuration: {
      architecture: "Majorana",
      qecCode: "three_aux",
      magicStateFactories: ["round_based"],
      traceTransform: "psspc",
      maxError: 1,
    },
    frontier: [
      {
        qubits: 126400,
        runtime: 880000,
        error: 0.00012,
        factories: [],
        PHYSICAL_FACTORY_QUBITS: 0,
        LOGICAL_CYCLE_TIME: 1000,
        RUNTIME_SINGLE_SHOT: 880000,
        EXPECTED_SHOTS: 1,
        DISTANCE: 9,
        NUM_TS_PER_ROTATION: 20,
        source: "qsharp",
        FEASIBILITY: "feasible",
      },
    ],
  },
  qreVersion: "qdk-qre-v1-fixture",
  startedAt: "2026-07-09T18:35:02Z",
  completedAt: "2026-07-09T18:35:03Z",
};
 
const FAILED_RESULT: RunResult = {
  schemaVersion: SCHEMA_VERSION,
  runId: "bead9c0e-c3ff-4d33-bb13-5f1c0a01b385",
  status: "failed",
  error: {
    code: "ESTIMATION_FAILED",
    message:
      "The estimator could not find a feasible frontier point within maxError = 1e-12 for this GateBased configuration. Try a larger max error cap, lower hardware error rate, or a faster architecture.",
  },
  frontier: null,
  raw: {
    status: "failed",
    engineApi: "qdk-qre-estimation-table",
    code: "Qre.Estimation.NoFeasibleFrontierPoint",
    message:
      "No feasible Pareto frontier point satisfied maxError = 1e-12 under the supplied architecture and transform settings.",
    configuration: {
      architecture: "GateBased",
      qecCode: "surface_code",
      magicStateFactories: ["round_based"],
      traceTransform: "psspc",
      maxError: 1e-12,
    },
  },
  qreVersion: "qdk-qre-v1-fixture",
  startedAt: "2026-07-09T18:40:02Z",
  completedAt: "2026-07-09T18:40:03Z",
};
 
const BENCHMARK_CONFIG: RunConfig = {
  schemaVersion: SCHEMA_VERSION,
  id: "acaf1c0e-a716-41bc-9774-598cacee033f",
  name: "Quantum Dynamics - GateBased 1e-4 - Surface - PSSPC",
  createdAt: "2026-07-09T18:22:00Z",
  application: { type: "benchmark", benchmarkId: "quantum-dynamics" },
  architecture: { type: "gateBased", errorRate: 0.0001, gateTime: 50, measurementTime: 100, twoQubitGateTime: null },
  qecCode: "surface_code",
  magicStateFactories: ["round_based"],
  traceTransform: { tStatesPerRotation: 20, ccxMagicStates: false, slowDownFactor: 1.0 },
  maxError: 1,
  qreVersion: "qdk-qre-v1-fixture",
};
 
const LARGE_CONFIG: RunConfig = {
  schemaVersion: SCHEMA_VERSION,
  id: "1c4b86d6-8a26-4fa0-98a9-271b09e9abfe",
  name: "Shor's Factoring - GateBased 1e-4 - Litinski19 - Lattice Surgery",
  createdAt: "2026-07-09T18:30:00Z",
  application: { type: "benchmark", benchmarkId: "shors-factoring" },
  architecture: { type: "gateBased", errorRate: 0.0001, gateTime: 100000, measurementTime: 100000, twoQubitGateTime: 100000 },
  qecCode: "surface_code",
  magicStateFactories: ["litinski19"],
  traceTransform: { tStatesPerRotation: 20, ccxMagicStates: false, slowDownFactor: 1.0 },
  maxError: 0.001,
  qreVersion: "qdk-qre-v1-fixture",
};
 
const SPARSE_CONFIG: RunConfig = {
  schemaVersion: SCHEMA_VERSION,
  id: "5116295f-0220-442f-b06e-abe22e8acd29",
  name: "Phase Estimation - Majorana 1e-5 - Three-Aux - PSSPC",
  createdAt: "2026-07-09T18:35:00Z",
  application: { type: "benchmark", benchmarkId: "phase-estimation" },
  architecture: { type: "majorana", errorRate: 0.00001, operationTime: 1000 },
  qecCode: "three_aux",
  magicStateFactories: ["round_based"],
  traceTransform: { tStatesPerRotation: 20, ccxMagicStates: false, slowDownFactor: 1.0 },
  maxError: 1,
  qreVersion: "qdk-qre-v1-fixture",
};
 
const FAILING_CONFIG: RunConfig = {
  schemaVersion: SCHEMA_VERSION,
  id: "bead9c0e-c3ff-4d33-bb13-5f1c0a01b385",
  name: "Quantum Dynamics - GateBased 1e-4 - Unsatisfiable Max Error",
  createdAt: "2026-07-09T18:40:00Z",
  application: { type: "benchmark", benchmarkId: "quantum-dynamics" },
  architecture: { type: "gateBased", errorRate: 0.0001, gateTime: 100000, measurementTime: 100000, twoQubitGateTime: null },
  qecCode: "surface_code",
  magicStateFactories: ["round_based"],
  traceTransform: { tStatesPerRotation: 20, ccxMagicStates: false, slowDownFactor: 1.0 },
  maxError: 1e-12,
  qreVersion: "qdk-qre-v1-fixture",
};
 
export const buildSuccessResult = (): RunResult => structuredClone(SUCCESS_RESULT);
export const buildLargeResult = (): RunResult => structuredClone(LARGE_RESULT);
export const buildSparseResult = (): RunResult => structuredClone(SPARSE_RESULT);
export const buildFailedResult = (): RunResult => structuredClone(FAILED_RESULT);
 
export const buildBenchmarkConfig = (): RunConfig => structuredClone(BENCHMARK_CONFIG);
export const buildLargeConfig = (): RunConfig => structuredClone(LARGE_CONFIG);
export const buildSparseConfig = (): RunConfig => structuredClone(SPARSE_CONFIG);
export const buildFailingConfig = (): RunConfig => structuredClone(FAILING_CONFIG);
 
// ---------------------------------------------------------------------------
// RESULT_SCENARIOS — a FIXTURE_SCENARIOS-shaped list for the Results surface tests.
// ---------------------------------------------------------------------------
 
export type ResultScenarioId = "idle" | "running" | "success" | "large" | "sparse" | "failed";
 
export interface ResultScenario {
  id: ResultScenarioId;
  label: string;
  phase: ResultsPhase;
  result: RunResult | null;
  config: RunConfig | null;
}
 
export const RESULT_SCENARIOS: readonly ResultScenario[] = [
  { id: "idle", label: "Empty / no run", phase: "idle", result: null, config: null },
  { id: "running", label: "Running", phase: "running", result: null, config: BENCHMARK_CONFIG },
  { id: "success", label: "Success / multi-row frontier", phase: "done", result: SUCCESS_RESULT, config: BENCHMARK_CONFIG },
  { id: "large", label: "Formatting stress", phase: "done", result: LARGE_RESULT, config: LARGE_CONFIG },
  { id: "sparse", label: "Sparse / one-row frontier", phase: "done", result: SPARSE_RESULT, config: SPARSE_CONFIG },
  { id: "failed", label: "Failed", phase: "done", result: FAILED_RESULT, config: FAILING_CONFIG },
];
 
// ---------------------------------------------------------------------------
// SAMPLE_RUN_RECORDS — the fixed 7-record corpus (drop-in for MOCK_RUN_RECORDS).
// createdAt descending order is R7 > R6 > R4 > R2 > R1 > R5 > R3 so the store's
// newest-first ordering resolves to [R7,R6,R4,R2,R1,R5,R3].
// ---------------------------------------------------------------------------
 
const ID = {
  R1: "11111111-1111-4111-8111-111111111111",
  R2: "22222222-2222-4222-8222-222222222222",
  R3: "33333333-3333-4333-8333-333333333333",
  R4: "44444444-4444-4444-8444-444444444444",
  R5: "55555555-5555-4555-8555-555555555555",
  R6: "66666666-6666-4666-8666-666666666666",
  R7: "77777777-7777-4777-8777-777777777777",
} as const;
 
/** A succeeded result for the corpus, one standard row, keyed to `runId`. */
function corpusSuccess(runId: string, qreVersion: string): RunResult {
  return buildRunResult({ runId, qreVersion });
}
 
/** The sparse corpus row: legitimate zeros, no factories. */
function corpusSparse(runId: string, qreVersion: string): RunResult {
  return buildRunResult({
    runId,
    qreVersion,
    frontier: [
      buildFrontierRow({
        physicalQubits: metric(12000, "qubits", "12,000"),
        runtime: metric(0, "ns", "0 ns"),
        logicalCycleTime: metric(1000, "ns", "1.0 us"),
        factories: { value: [], unit: "factories", display: "none" },
        totalError: metric(0, "probability", "0"),
        codeDistance: metric(9, "", "9"),
        additional: { physicalFactoryQubits: metric(0, "qubits", "0") },
      }),
    ],
  });
}
 
/** A failed corpus result with verbatim engine diagnostics in `raw`. */
function corpusFailed(runId: string, qreVersion: string): RunResult {
  return buildRunResult({
    runId,
    qreVersion,
    status: "failed",
    error: {
      code: "ESTIMATION_FAILED",
      message:
        "The estimator could not find a feasible frontier point within the requested error budget.",
    },
    frontier: null,
    raw: {
      status: "failed",
      engineApi: "qdk-qre-estimation-table",
      code: "Qre.Estimation.NoFeasibleFrontierPoint",
      message: "No feasible Pareto frontier point satisfied the supplied error budget.",
    },
  });
}
 
export const SAMPLE_RUN_RECORDS: readonly RunRecord[] = [
  buildRunRecord({
    config: {
      id: ID.R1,
      name: "Quantum Dynamics - GateBased 1e-4 - Surface - PSSPC",
      createdAt: "2026-07-16T09:00:00Z",
      application: { type: "benchmark", benchmarkId: "quantum-dynamics" },
    },
    result: corpusSuccess(ID.R1, "qdk-qre-1.29.1"),
    savedAt: "2026-07-16T09:00:05Z",
  }),
  buildRunRecord({
    config: {
      id: ID.R2,
      name: "Shor's Factoring - Litinski19",
      createdAt: "2026-07-16T10:30:00Z",
      application: { type: "benchmark", benchmarkId: "shors-factoring" },
      magicStateFactories: ["litinski19"],
    },
    result: corpusSuccess(ID.R2, "qdk-qre-1.29.1"),
    savedAt: "2026-07-16T10:30:05Z",
  }),
  buildRunRecord({
    config: {
      id: ID.R3,
      name: "Grover's Search - Lattice Surgery (sparse)",
      createdAt: "2026-07-15T14:00:00Z",
      application: { type: "benchmark", benchmarkId: "grovers-search" },
      architecture: { type: "gateBased", errorRate: 0.0005, gateTime: 50, measurementTime: 100, twoQubitGateTime: null },
      traceTransform: { tStatesPerRotation: 20, ccxMagicStates: false, slowDownFactor: 1.0 },
    },
    result: corpusSparse(ID.R3, "qdk-qre-1.28.0"),
    savedAt: "2026-07-15T14:00:05Z",
  }),
  buildRunRecord({
    config: {
      id: ID.R4,
      name: "Phase Estimation - Majorana Three-Aux",
      createdAt: "2026-07-16T11:15:00Z",
      application: { type: "benchmark", benchmarkId: "phase-estimation" },
      architecture: { type: "majorana", errorRate: 0.00001, operationTime: 1000 },
      qecCode: "three_aux",
    },
    result: corpusSuccess(ID.R4, "qdk-qre-1.29.1"),
    savedAt: "2026-07-16T11:15:05Z",
  }),
  buildRunRecord({
    config: {
      id: ID.R5,
      name: "Ekera-Hastad - infeasible budget",
      createdAt: "2026-07-16T08:00:00Z",
      application: { type: "benchmark", benchmarkId: "ekera-hastad-factoring" },
      architecture: { type: "gateBased", errorRate: 0.001, gateTime: 50, measurementTime: 100, twoQubitGateTime: null },
      maxError: 1e-12,
    },
    result: corpusFailed(ID.R5, "qdk-qre-1.29.1"),
    savedAt: "2026-07-16T08:00:05Z",
  }),
  buildRunRecord({
    config: {
      id: ID.R6,
      name: "Shor's Factoring - GateBased Round-Based",
      createdAt: "2026-07-16T14:00:00Z",
      application: { type: "benchmark", benchmarkId: "shors-factoring" },
    },
    result: corpusSuccess(ID.R6, "qdk-qre-1.29.1"),
    savedAt: "2026-07-16T14:00:05Z",
  }),
  buildRunRecord({
    config: {
      id: ID.R7,
      name: "Shor's Factoring - Majorana Three-Aux",
      createdAt: "2026-07-16T14:30:00Z",
      application: { type: "benchmark", benchmarkId: "shors-factoring" },
      architecture: { type: "majorana", errorRate: 0.00001, operationTime: 1000 },
      qecCode: "three_aux",
    },
    result: corpusSuccess(ID.R7, "qdk-qre-1.29.1"),
    savedAt: "2026-07-16T14:30:05Z",
  }),
];