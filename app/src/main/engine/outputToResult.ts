import type {
  FieldMetric,
  FrontierRow,
  ResultFieldKey,
  RunConfig,
  RunResult,
} from "../../shared/types.js";
import type { ExecuteResult } from "./execute.js";

interface RawFrontierRow {
  qubits: number;
  runtime: number;
  error: number;
  distance: number | null;
  codeCycleTime: number | null;
  logicalCycleTime: number | null;
  factories: Array<{ stateType: string; copies: number }>;
  source?: string;
  properties: Record<string, unknown>;
}

interface PropertyMapping {
  key: ResultFieldKey;
  unit: string;
}

const PROPERTY_MAPPINGS: Record<string, PropertyMapping> = {
  PHYSICAL_COMPUTE_QUBITS: { key: "physicalComputeQubits", unit: "qubits" },
  PHYSICAL_FACTORY_QUBITS: { key: "physicalFactoryQubits", unit: "qubits" },
  PHYSICAL_MEMORY_QUBITS: { key: "physicalMemoryQubits", unit: "qubits" },
  LOGICAL_COMPUTE_QUBITS: { key: "logicalComputeQubits", unit: "qubits" },
  LOGICAL_MEMORY_QUBITS: { key: "logicalMemoryQubits", unit: "qubits" },
  ALGORITHM_COMPUTE_QUBITS: { key: "algorithmComputeQubits", unit: "qubits" },
  ALGORITHM_MEMORY_QUBITS: { key: "algorithmMemoryQubits", unit: "qubits" },
  LOGICAL_CYCLE_TIME: { key: "logicalCycleTime", unit: "ns" },
  CODE_CYCLE_TIME: { key: "codeCycleTime", unit: "ns" },
  RUNTIME_SINGLE_SHOT: { key: "runtimeSingleShot", unit: "ns" },
  EXPECTED_SHOTS: { key: "expectedShots", unit: "shots" },
  EVALUATION_TIME: { key: "evaluationTime", unit: "ns" },
  DISTANCE: { key: "codeDistance", unit: "" },
  NUM_TS_PER_ROTATION: { key: "numTsPerRotation", unit: "T states/rotation" },
  BLOCK_SIZE: { key: "blockSize", unit: "" },
  FEASIBILITY: { key: "feasibility", unit: "" },
  LOSS: { key: "loss", unit: "probability" },
  TARGET_YEAR: { key: "targetYear", unit: "year" },
  NAME: { key: "name", unit: "" },
  ASSUMPTIONS: { key: "assumptions", unit: "" },
  BASE_SYSTEM_COST: { key: "baseSystemCost", unit: "" },
  SHOT_COST: { key: "shotCost", unit: "" },
  COST_PER_QUBIT: { key: "costPerQubit", unit: "" },
  COST_PER_HOUR: { key: "costPerHour", unit: "" },
  COST_PER_QUBIT_PER_HOUR: { key: "costPerQubitPerHour", unit: "" },
  ATOM_SPACING: { key: "atomSpacing", unit: "" },
  DATA_QUBIT_SPACING: { key: "dataQubitSpacing", unit: "" },
  VELOCITY: { key: "velocity", unit: "" },
  ACCELERATION: { key: "acceleration", unit: "" },
  SURFACE_CODE_ONE_QUBIT_TIME_FACTOR: {
    key: "surfaceCodeOneQubitTimeFactor",
    unit: "",
  },
  SURFACE_CODE_TWO_QUBIT_TIME_FACTOR: {
    key: "surfaceCodeTwoQubitTimeFactor",
    unit: "",
  },
  MOLECULE: { key: "molecule", unit: "" },
};

const DEFAULT_KEYS = new Set<ResultFieldKey>([
  "physicalQubits",
  "runtime",
  "logicalCycleTime",
  "factories",
  "totalError",
  "codeDistance",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function displayValue(value: unknown): string {
  if (typeof value === "string") return value.length > 0 ? value : "(empty)";
  if (typeof value === "number")
    return Number.isFinite(value)
      ? value.toLocaleString("en-US")
      : String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  const rendered = JSON.stringify(value);
  return rendered && rendered.length > 0 ? rendered : String(value);
}

function metric(value: unknown, unit: string): FieldMetric {
  return { value, unit, display: displayValue(value) };
}

function verbatimFrom(
  wrapperOutput: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (wrapperOutput === null) return null;
  const verbatim = wrapperOutput["verbatim"];
  // Compatibility fallback retains all output instead of losing diagnostics.
  return isRecord(verbatim) ? verbatim : wrapperOutput;
}

function versionFrom(
  wrapperOutput: Record<string, unknown> | null,
  config: RunConfig,
): string {
  const version = wrapperOutput?.["qreVersion"];
  return typeof version === "string" && version.length > 0
    ? version
    : config.qreVersion;
}

function failed(
  config: RunConfig,
  code: string,
  message: string,
  wrapperOutput: Record<string, unknown> | null,
  startedAt: string,
  completedAt: string,
): RunResult {
  return {
    schemaVersion: "1.1.0",
    runId: config.id,
    status: "failed",
    error: { code, message },
    frontier: null,
    raw: verbatimFrom(wrapperOutput),
    qreVersion: versionFrom(wrapperOutput, config),
    startedAt,
    completedAt,
  };
}

function mapAdditional(
  row: RawFrontierRow,
): Record<string, FieldMetric> | undefined {
  const additional: Record<string, FieldMetric> = {};
  if (row.source !== undefined) additional["source"] = metric(row.source, "");
  if (row.codeCycleTime !== null)
    additional["codeCycleTime"] = metric(row.codeCycleTime, "ns");

  for (const [reportedKey, value] of Object.entries(row.properties)) {
    const mapping = PROPERTY_MAPPINGS[reportedKey];
    const targetKey = mapping?.key ?? reportedKey;
    if (mapping && DEFAULT_KEYS.has(mapping.key)) continue;
    additional[targetKey] = metric(value, mapping?.unit ?? "");
  }
  return Object.keys(additional).length > 0 ? additional : undefined;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function mapRow(row: RawFrontierRow): FrontierRow | null {
  if (
    !isFiniteNumber(row.qubits) ||
    !isFiniteNumber(row.runtime) ||
    !isFiniteNumber(row.error) ||
    !isFiniteNumber(row.distance) ||
    !isFiniteNumber(row.logicalCycleTime) ||
    !Array.isArray(row.factories) ||
    !isRecord(row.properties)
  ) {
    return null;
  }
  const factoriesValid = row.factories.every(
    (factory) =>
      isRecord(factory) &&
      typeof factory["stateType"] === "string" &&
      Number.isInteger(factory["copies"]) &&
      Number(factory["copies"]) >= 0,
  );
  if (!factoriesValid) return null;

  const additional = mapAdditional(row);
  return {
    physicalQubits: {
      value: row.qubits,
      unit: "qubits",
      display: row.qubits.toLocaleString("en-US"),
    },
    runtime: {
      value: row.runtime,
      unit: "ns",
      display: `${row.runtime.toLocaleString("en-US")} ns`,
    },
    logicalCycleTime: {
      value: row.logicalCycleTime,
      unit: "ns",
      display: `${row.logicalCycleTime.toLocaleString("en-US")} ns`,
    },
    factories: {
      value: row.factories,
      unit: "factories",
      display:
        row.factories.length === 0
          ? "none"
          : row.factories
              .map((factory) => `${factory.copies} × ${factory.stateType}`)
              .join(", "),
    },
    totalError: {
      value: row.error,
      unit: "probability",
      display: row.error.toExponential(2),
    },
    codeDistance: {
      value: row.distance,
      unit: "",
      display: String(row.distance),
    },
    ...(additional === undefined ? {} : { additional }),
  };
}

export function outputToResult(
  config: RunConfig,
  executeResult: ExecuteResult,
  startedAt: string,
  completedAt: string,
): RunResult {
  if (!executeResult.ok) {
    return failed(
      config,
      executeResult.code,
      executeResult.message,
      executeResult.raw,
      startedAt,
      completedAt,
    );
  }

  const wrapperOutput = executeResult.raw;
  const rawFrontier = wrapperOutput["frontier"];
  if (!Array.isArray(rawFrontier) || rawFrontier.length === 0) {
    return failed(
      config,
      "ESTIMATION_FAILED",
      "The estimator returned an empty or malformed frontier; adjust the configuration and retry.",
      wrapperOutput,
      startedAt,
      completedAt,
    );
  }

  const mappedRows: FrontierRow[] = [];
  for (const value of rawFrontier) {
    if (!isRecord(value)) {
      return failed(
        config,
        "ESTIMATION_FAILED",
        "The estimator returned a malformed frontier row; retry the run.",
        wrapperOutput,
        startedAt,
        completedAt,
      );
    }
    const mapped = mapRow(value as unknown as RawFrontierRow);
    if (mapped === null) {
      return failed(
        config,
        "ESTIMATION_FAILED",
        "The engine reported a frontier row missing or invalid required fields; adjust the configuration and retry.",
        wrapperOutput,
        startedAt,
        completedAt,
      );
    }
    mappedRows.push(mapped);
  }

  return {
    schemaVersion: "1.1.0",
    runId: config.id,
    status: "succeeded",
    error: null,
    frontier: mappedRows,
    raw: verbatimFrom(wrapperOutput)!,
    qreVersion: versionFrom(wrapperOutput, config),
    startedAt,
    completedAt,
  };
}
