import type { FieldMetric, FrontierRow, RunConfig } from "../../shared/types";
import {
  ARCHITECTURE_LABELS,
  MAGIC_STATE_FACTORY_LABELS,
  QEC_LABELS,
} from "../constants/labels";
import { FORMAT_LABELS, findBenchmark } from "../constants/staticOptions";

export interface ResultFieldDefinition {
  key: string;
  label: string;
  unitLabel: string;
  description: string;
}

export interface DisplayField extends ResultFieldDefinition {
  metric: FieldMetric;
}

export const DEFAULT_FIELD_DEFINITIONS = [
  {
    key: "physicalQubits",
    label: "Physical Qubits",
    unitLabel: "qubits",
    description: "Total physical qubits required by this frontier point.",
  },
  {
    key: "runtime",
    label: "Runtime",
    unitLabel: "time",
    description: "Total wall-clock algorithm runtime for this estimate.",
  },
  {
    key: "totalError",
    label: "Total Error",
    unitLabel: "probability",
    description: "Estimated logical error probability for the computation.",
  },
  {
    key: "factories",
    label: "Factories",
    unitLabel: "factories",
    description: "Magic-state factory copies used at this frontier point.",
  },
  {
    key: "codeDistance",
    label: "Code Distance",
    unitLabel: "distance",
    description: "Error-correcting code distance used by this estimate.",
  },
  {
    key: "logicalCycleTime",
    label: "Logical Cycle Time",
    unitLabel: "time",
    description: "Duration of one logical clock cycle after error correction.",
  },
] as const satisfies readonly ResultFieldDefinition[];

const ADDITIONAL_FIELD_DEFINITIONS = new Map<string, ResultFieldDefinition>([
  [
    "physicalComputeQubits",
    {
      key: "physicalComputeQubits",
      label: "Phys. Compute Qubits",
      unitLabel: "qubits",
      description: "Physical qubits used for computation.",
    },
  ],
  [
    "physicalFactoryQubits",
    {
      key: "physicalFactoryQubits",
      label: "Phys. Factory Qubits",
      unitLabel: "qubits",
      description: "Physical qubits used by magic-state factories.",
    },
  ],
  [
    "physicalMemoryQubits",
    {
      key: "physicalMemoryQubits",
      label: "Phys. Memory Qubits",
      unitLabel: "qubits",
      description: "Physical qubits used for memory.",
    },
  ],
  [
    "runtimeSingleShot",
    {
      key: "runtimeSingleShot",
      label: "Runtime / Shot",
      unitLabel: "time",
      description: "Runtime for a single shot of the algorithm.",
    },
  ],
  [
    "expectedShots",
    {
      key: "expectedShots",
      label: "Expected Shots",
      unitLabel: "shots",
      description: "Expected number of repetitions.",
    },
  ],
  [
    "numTsPerRotation",
    {
      key: "numTsPerRotation",
      label: "T States / Rotation",
      unitLabel: "T states",
      description: "T states used to synthesize each arbitrary rotation.",
    },
  ],
  [
    "source",
    {
      key: "source",
      label: "Source",
      unitLabel: "",
      description: "Instruction set or source that produced this result.",
    },
  ],
  [
    "feasibility",
    {
      key: "feasibility",
      label: "Feasibility",
      unitLabel: "",
      description: "Whether the configuration is feasible.",
    },
  ],
]);

export function getDefaultMetric(row: FrontierRow, key: string): FieldMetric {
  switch (key) {
    case "physicalQubits":
      return row.physicalQubits;
    case "runtime":
      return row.runtime;
    case "totalError":
      return row.totalError;
    case "factories":
      return row.factories;
    case "codeDistance":
      return row.codeDistance;
    case "logicalCycleTime":
      return row.logicalCycleTime;
    default:
      throw new Error(`Unknown default result field: ${key}`);
  }
}

/**
 * @param hiddenKeys Additional-field keys to exclude, e.g. from field-filter state. The six
 * default fields are never hidden. Omit to show every reported field (unfiltered).
 */
export function getDisplayFields(row: FrontierRow, hiddenKeys: ReadonlySet<string> = new Set()): DisplayField[] {
  const defaultFields = DEFAULT_FIELD_DEFINITIONS.map((definition) => ({
    ...definition,
    metric: getDefaultMetric(row, definition.key),
  }));

  const additionalFields = Object.entries(row.additional ?? {})
    .filter(([key]) => !hiddenKeys.has(key))
    .map(([key, metric]) => ({
      ...getFieldDefinition(key, metric.unit),
      metric,
    }));

  return [...defaultFields, ...additionalFields];
}

/** The union of additional (non-default) field definitions reported across any row in the frontier. */
export function getAdditionalFieldDefinitions(rows: readonly FrontierRow[]): ResultFieldDefinition[] {
  const seen = new Map<string, ResultFieldDefinition>();

  for (const row of rows) {
    for (const [key, metric] of Object.entries(row.additional ?? {})) {
      if (!seen.has(key)) {
        seen.set(key, getFieldDefinition(key, metric.unit));
      }
    }
  }

  return [...seen.values()];
}

export function getFieldDefinition(key: string, unit: string): ResultFieldDefinition {
  return (
    ADDITIONAL_FIELD_DEFINITIONS.get(key) ?? {
      key,
      label: humanizeKey(key),
      unitLabel: unit,
      description: "Additional QRE-provided result field.",
    }
  );
}

export function summarizeConfig(config: RunConfig | null | undefined, qreVersion: string) {
  if (!config) {
    return [
      { label: "Application", value: "Unknown" },
      { label: "Architecture", value: "Unknown" },
      { label: "QEC Code", value: "Unknown" },
      { label: "Factory", value: "Unknown" },
      { label: "Trace Transform", value: "Unknown" },
      { label: "Max Error", value: "Unknown" },
      { label: "QRE Version", value: qreVersion },
    ];
  }

  return [
    { label: "Application", value: summarizeApplication(config.application) },
    { label: "Architecture", value: summarizeArchitecture(config.architecture) },
    {
      label: "QEC Code",
      value: QEC_LABELS[config.qecCode] ?? humanizeIdentifier(config.qecCode),
    },
    {
      label: "Factory",
      value:
        MAGIC_STATE_FACTORY_LABELS[config.magicStateFactory] ??
        humanizeIdentifier(config.magicStateFactory),
    },
    { label: "Trace Transform", value: summarizeTransform(config.traceTransform) },
    { label: "Max Error", value: String(config.maxError) },
    { label: "QRE Version", value: qreVersion },
  ];
}

function summarizeApplication(application: RunConfig["application"]): string {
  if (application.type === "uploaded") {
    const fileName =
      application.filePath.split(/[\\/]/).pop() ?? application.filePath;
    return `${fileName} (${FORMAT_LABELS[application.format]})`;
  }

  if (application.type === "manualCounts") {
    return `Manual Logical Counts (${application.numQubits} qubits, ${application.tCount} T)`;
  }

  return (
    findBenchmark(application.benchmarkId)?.name ??
    humanizeIdentifier(application.benchmarkId)
  );
}

function summarizeArchitecture(architecture: RunConfig["architecture"]): string {
  return `${ARCHITECTURE_LABELS[architecture.type]}, error ${architecture.errorRate}`;
}

function summarizeTransform(transform: RunConfig["traceTransform"]): string {
  if (transform.type === "latticeSurgery") {
    return "Lattice Surgery";
  }

  return `PSSPC, ${transform.tStatesPerRotation} T/rotation`;
}

function humanizeIdentifier(value: string): string {
  return value
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function humanizeKey(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
