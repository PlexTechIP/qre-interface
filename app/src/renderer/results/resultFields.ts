import type {
  Application,
  Architecture,
  FieldMetric,
  FrontierRow,
  RunConfig,
} from "../../shared/types";
import {
  ARCHITECTURE_LABELS,
  MAGIC_STATE_FACTORY_LABELS,
  MEMORY_OPTIMIZATION_LABELS,
  QEC_LABELS,
  SECONDARY_FACTORY_LABELS,
  T_COUNT_PER_ROTATION_LABEL,
  TOTAL_FAULT_TOLERANT_EXECUTION_ERROR_LABEL,
} from "../constants/labels";
import { FORMAT_LABELS, findBenchmark } from "../constants/staticOptions";
import { editableParams } from "../../shared/benchmarkParams";
import { normalizeTraceTransform } from "../../shared/traceTransform";

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
    description: "Total number of physical qubits required for the computation.",
  },
  {
    key: "runtime",
    label: "Runtime",
    unitLabel: "time",
    description: "Total runtime of the algorithm.",
  },
  {
    key: "totalError",
    label: "Total Error",
    unitLabel: "probability",
    description:
      "Total estimated failure probability of the computation, composed across all error contributions and bounded by the max-error budget.",
  },
  {
    key: "factories",
    label: "Factories",
    unitLabel: "factories",
    description:
      "Magic-state factories used, shown as copies × factory type (e.g., 12×Round-Based Factory).",
  },
  {
    key: "codeDistance",
    label: "Code Distance",
    unitLabel: "distance",
    description: "Code distance of the error-correcting code.",
  },
  {
    key: "logicalCycleTime",
    label: "Logical Cycle Time",
    unitLabel: "time",
    description:
      "Duration of one logical operation cycle (one code cycle × the code distance).",
  },
] as const satisfies readonly ResultFieldDefinition[];
 
const ADDITIONAL_FIELD_DEFINITIONS = new Map<string, ResultFieldDefinition>([
  [
    "source",
    {
      key: "source",
      label: "Source",
      unitLabel: "",
      description: "The instruction source (ISA) that produced this result.",
    },
  ],
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
      description: "Physical qubits used for memory storage.",
    },
  ],
  [
    "logicalComputeQubits",
    {
      key: "logicalComputeQubits",
      label: "Logical Compute Qubits",
      unitLabel: "qubits",
      description:
        "Logical qubits used for computation, after compilation into a trace.",
    },
  ],
  [
    "logicalMemoryQubits",
    {
      key: "logicalMemoryQubits",
      label: "Logical Memory Qubits",
      unitLabel: "qubits",
      description:
        "Logical qubits used for memory, after compilation into a trace.",
    },
  ],
  [
    "algorithmComputeQubits",
    {
      key: "algorithmComputeQubits",
      label: "Algorithm Compute Qubits",
      unitLabel: "qubits",
      description:
        "Compute qubits reported by the algorithm itself, before compilation into a trace.",
    },
  ],
  [
    "algorithmMemoryQubits",
    {
      key: "algorithmMemoryQubits",
      label: "Algorithm Memory Qubits",
      unitLabel: "qubits",
      description:
        "Memory qubits reported by the algorithm itself, before compilation into a trace.",
    },
  ],
  [
    "codeCycleTime",
    {
      key: "codeCycleTime",
      label: "Code Cycle Time",
      unitLabel: "time",
      description: "Duration of one physical syndrome-extraction round.",
    },
  ],
  [
    "runtimeSingleShot",
    {
      key: "runtimeSingleShot",
      label: "Runtime / Shot",
      unitLabel: "time",
      description:
        "Estimated runtime for a single shot (execution) of the algorithm.",
    },
  ],
  [
    "expectedShots",
    {
      key: "expectedShots",
      label: "Expected Shots",
      unitLabel: "shots",
      description:
        "Expected number of shots (repetitions) needed for the algorithm to succeed.",
    },
  ],
  [
    "evaluationTime",
    {
      key: "evaluationTime",
      label: "Evaluation Time",
      unitLabel: "time",
      description:
        "Wall-clock time spent evaluating the input program into a resource trace (not the estimation search itself).",
    },
  ],
  [
    "numTsPerRotation",
    {
      key: "numTsPerRotation",
      // Renamed 2026-08-07 to match the configuration surface. Display only: the
      // metric key, the contract's `tStatesPerRotation` and qdk's
      // `num_ts_per_rotation` are unchanged. The unit stays "T states" — that is
      // what the number counts.
      label: T_COUNT_PER_ROTATION_LABEL,
      unitLabel: "T states",
      description: "Number of T states used to synthesize each arbitrary rotation.",
    },
  ],
  [
    "blockSize",
    {
      key: "blockSize",
      label: "Block Size",
      unitLabel: "",
      description: "Size of a repeated block of operations used in the resource model.",
    },
  ],
  [
    "feasibility",
    {
      key: "feasibility",
      label: "Feasibility",
      unitLabel: "",
      description: "Whether the configuration satisfied all estimation constraints.",
    },
  ],
  [
    "loss",
    {
      key: "loss",
      label: "Loss",
      unitLabel: "probability",
      description: "Physical qubit loss rate assumed for the hardware.",
    },
  ],
  [
    "targetYear",
    {
      key: "targetYear",
      label: "Target Year",
      unitLabel: "",
      description:
        "Target hardware generation assigned to two-qubit gates; has no effect unless a year-aware trace transform is enabled.",
    },
  ],
  [
    "name",
    {
      key: "name",
      label: "Name",
      unitLabel: "",
      description: "Name or label assigned to this result.",
    },
  ],
  [
    "assumptions",
    {
      key: "assumptions",
      label: "Assumptions",
      unitLabel: "",
      description:
        "Modeling assumptions used by the selected architecture and QEC strategy.",
    },
  ],
  [
    "atomSpacing",
    {
      key: "atomSpacing",
      label: "Atom Spacing",
      unitLabel: "µm",
      description:
        "Nominal spacing (microns) between atoms during transport or placement in storage (neutral-atom).",
    },
  ],
  [
    "dataQubitSpacing",
    {
      key: "dataQubitSpacing",
      label: "Data Qubit Spacing",
      unitLabel: "µm",
      description:
        "Nominal spacing (microns) between data qubits during transport or placement (neutral-atom).",
    },
  ],
  [
    "velocity",
    {
      key: "velocity",
      label: "Velocity",
      unitLabel: "m/s",
      description: "Maximum atom transport velocity, in m/s (neutral-atom).",
    },
  ],
  [
    "acceleration",
    {
      key: "acceleration",
      label: "Acceleration",
      unitLabel: "m/s²",
      description: "Maximum atom transport acceleration, in m/s² (neutral-atom).",
    },
  ],
  [
    "surfaceCodeOneQubitTimeFactor",
    {
      key: "surfaceCodeOneQubitTimeFactor",
      label: "Surface Code 1-Qubit Time Factor",
      unitLabel: "",
      description:
        "Multiplier applied to the depth of one-qubit gates during surface-code syndrome extraction.",
    },
  ],
  [
    "surfaceCodeTwoQubitTimeFactor",
    {
      key: "surfaceCodeTwoQubitTimeFactor",
      label: "Surface Code 2-Qubit Time Factor",
      unitLabel: "",
      description:
        "Multiplier applied to the depth of two-qubit gates during surface-code syndrome extraction.",
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
 
/*
 * Renamed from "Max Error" 2026-08-07, so the results recap and the
 * configuration form call the same number by the same name — the form had been
 * renamed on its own, leaving the app showing two names for one field.
 *
 * The label is a single exported constant in constants/labels.ts rather than a
 * literal per call site: it appears in both arms of summarizeConfig below and
 * on History, Comparison and the Markdown export, and renaming one surface and
 * not the others is exactly how they drifted. The contract field is still
 * `maxError`.
 */

export function summarizeConfig(config: RunConfig | null | undefined) {
  if (!config) {
    return [
      { label: "Application", value: "Unknown" },
      { label: "Architecture", value: "Unknown" },
      { label: "Error Rate", value: "Unknown" },
      { label: "QEC Code", value: "Unknown" },
      { label: "Magic State Factory", value: "Unknown" },
      { label: TOTAL_FAULT_TOLERANT_EXECUTION_ERROR_LABEL, value: "Unknown" },
    ];
  }

  const transform = normalizeTraceTransform(config.traceTransform);
  const items = [
    // 1. What's being estimated: the application and its primary sizing driver.
    ...applicationSummaryItems(config.application, config.parameters),
    // 2. Hardware: the profile and its headline error rate.
    { label: "Architecture", value: ARCHITECTURE_LABELS[config.architecture.type] },
    { label: "Error Rate", value: architectureErrorRate(config.architecture) },
    // 3. Error correction: the QEC pairing and the selected factory/factories.
    {
      label: "QEC Code",
      value: QEC_LABELS[config.qecCode] ?? humanizeIdentifier(config.qecCode),
    },
    {
      // A set as of v1.2.0 — every selected factory is named, so the summary
      // never implies a single choice the run did not make.
      label: config.magicStateFactories.length > 1 ? "Magic State Factories" : "Magic State Factory",
      value: config.magicStateFactories
        .map((factory) => MAGIC_STATE_FACTORY_LABELS[factory] ?? humanizeIdentifier(factory))
        .join(" + "),
    },
    // 4. Accuracy: the target error to confirm before a run.
    {
      label: TOTAL_FAULT_TOLERANT_EXECUTION_ERROR_LABEL,
      value: String(config.maxError),
    },
  ];

  // 5. Active optimizations: listed only when set away from the default, so the
  // recap stays quiet for a stock configuration and flags the exceptions.
  const memoryOptimization = config.memoryOptimization ?? "none";
  if (memoryOptimization !== "none") {
    items.push({
      label: "Memory Optimization",
      value: MEMORY_OPTIMIZATION_LABELS[memoryOptimization],
    });
  }
  if (transform.dynamicMemoryCompute) {
    items.push({ label: "Dynamic Memory Compute", value: "On" });
  }
  if (transform.unmemory) {
    items.push({ label: "Unmemory", value: "On" });
  }

  return items;
}
 
/**
 * Section 1 of the recap: the application, then the hyperparameter (or two) that
 * most drives its cost, so the biggest cost driver is always confirmable at a
 * glance. Values fall back to the benchmark default when the run did not
 * override them, matching what the engine actually used.
 */
function applicationSummaryItems(
  application: Application,
  parameters: RunConfig["parameters"],
): { label: string; value: string }[] {
  if (application.type === "uploaded") {
    const fileName =
      application.filePath.split(/[\\/]/).pop() ?? application.filePath;
    return [
      { label: "Application", value: "Saved Program" },
      { label: "Program", value: fileName },
      { label: "Language", value: FORMAT_LABELS[application.format] },
    ];
  }

  if (application.type === "manualCounts") {
    return [
      { label: "Application", value: "Manual Logical Counts" },
      { label: "Logical Qubit Count", value: String(application.numQubits) },
      { label: "T Count", value: String(application.tCount) },
    ];
  }

  const name =
    findBenchmark(application.benchmarkId)?.name ??
    humanizeIdentifier(application.benchmarkId);
  return [
    { label: "Application", value: name },
    ...benchmarkPrimaryItems(application.benchmarkId, parameters),
  ];
}

/**
 * The primary sizing hyperparameter(s) per benchmark, each chosen as the
 * dominant cost driver. Unknown ids contribute nothing beyond the name.
 */
function benchmarkPrimaryItems(
  benchmarkId: string,
  parameters: RunConfig["parameters"],
): { label: string; value: string }[] {
  const show = (key: string) => resolveParamDisplay(benchmarkId, key, parameters);
  switch (benchmarkId) {
    case "shors-factoring":
      return [{ label: "Bit Size", value: show("bitSize") }];
    case "ekera-hastad-factoring":
      return [{ label: "RSA Instance", value: show("rsaInstance") }];
    case "quantum-dynamics":
      return [
        { label: "Lattice", value: `${show("latticeN1")} × ${show("latticeN2")}` },
        { label: "Total Time", value: show("totalTime") },
      ];
    case "grovers-search":
      return [{ label: "Search Qubits", value: show("searchQubits") }];
    case "phase-estimation":
      return [{ label: "Register Size", value: show("registerSize") }];
    default:
      return [];
  }
}

/**
 * Resolve one hyperparameter to its display string: the stored value, or the
 * benchmark default when the run left it untouched; choice params render their
 * option label rather than the raw enum id.
 */
function resolveParamDisplay(
  benchmarkId: string,
  key: string,
  parameters: RunConfig["parameters"],
): string {
  const spec = editableParams(benchmarkId).find((param) => param.key === key);
  const raw = parameters?.[key] ?? spec?.default;
  if (raw === undefined || raw === null) return "—";
  if (spec?.kind === "choice") {
    return spec.options.find((option) => option.value === raw)?.label ?? String(raw);
  }
  return String(raw);
}

function architectureErrorRate(architecture: Architecture): string {
  if (architecture.type === "neutralAtom") {
    // Neutral Atom has three distinct error rates; the Rydberg error is the
    // headline figure, matching how the recap named it before the split.
    return String(architecture.rydbergError);
  }
  return String(architecture.errorRate);
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

/**
 * The "advanced details" breakdown of a config: every stored value, grouped for
 * the Configuration Summary's expandable panel. `summarizeConfig` gives the
 * seven-row recap; this is the exhaustive companion, so a value that lives on the
 * config but not in the recap (every architecture parameter, each hyperparameter,
 * the trace-transform stages, provenance) still has somewhere to be read.
 */
export interface AdvancedDetailItem {
  label: string;
  value: string;
}
export interface AdvancedDetailGroup {
  title: string;
  items: AdvancedDetailItem[];
}

const EVICTION_STRATEGY_LABELS: Record<string, string> = {
  least_recently_used: "Least Recently Used",
  least_frequently_used: "Least Frequently Used",
  first_available: "First Available",
};

const yesNo = (value: boolean): string => (value ? "Yes" : "No");
const ns = (value: number): string => `${value} ns`;

function applicationDetailItems(
  application: Application,
  parameters: RunConfig["parameters"],
): AdvancedDetailItem[] {
  if (application.type === "uploaded") {
    return [
      { label: "Type", value: "Uploaded Program" },
      { label: "File", value: application.filePath },
      { label: "Format", value: FORMAT_LABELS[application.format] },
      { label: "Add to Library", value: yesNo(application.addToLibrary) },
    ];
  }
  if (application.type === "manualCounts") {
    return [
      { label: "Type", value: "Manual Logical Counts" },
      { label: "Number of Qubits", value: String(application.numQubits) },
      { label: "T Count", value: String(application.tCount) },
      { label: "Rotation Count", value: String(application.rotationCount) },
      { label: "Rotation Depth", value: String(application.rotationDepth) },
      { label: "CCZ Count", value: String(application.cczCount) },
      { label: "CCiX Count", value: String(application.ccixCount) },
      { label: "Measurement Count", value: String(application.measurementCount) },
    ];
  }
  // Benchmark: name it, then every hyperparameter the run actually carries, in
  // the Q# argument order. Choice values resolve to their option label so the
  // panel reads the way the form does, not the raw enum id.
  const items: AdvancedDetailItem[] = [
    { label: "Type", value: "Benchmark" },
    {
      label: "Benchmark",
      value:
        findBenchmark(application.benchmarkId)?.name ??
        humanizeIdentifier(application.benchmarkId),
    },
  ];
  for (const param of editableParams(application.benchmarkId)) {
    const raw = parameters?.[param.key];
    if (raw === undefined || raw === null) continue;
    const value =
      param.kind === "choice"
        ? (param.options.find((option) => option.value === raw)?.label ?? String(raw))
        : String(raw);
    items.push({ label: param.label, value });
  }
  return items;
}

function architectureDetailItems(architecture: Architecture): AdvancedDetailItem[] {
  const type = { label: "Type", value: ARCHITECTURE_LABELS[architecture.type] };
  if (architecture.type === "gateBased") {
    return [
      type,
      { label: "Error Rate", value: String(architecture.errorRate) },
      { label: "Gate Time", value: ns(architecture.gateTime) },
      { label: "Measurement Time", value: ns(architecture.measurementTime) },
      {
        label: "Two-Qubit Gate Time",
        value:
          architecture.twoQubitGateTime == null
            ? "Engine default"
            : ns(architecture.twoQubitGateTime),
      },
    ];
  }
  if (architecture.type === "majorana") {
    return [
      type,
      { label: "Error Rate", value: String(architecture.errorRate) },
      { label: "Operation Time", value: ns(architecture.operationTime) },
      {
        label: "T Error Rate",
        value:
          architecture.tErrorRate === undefined
            ? "Derived from error rate"
            : String(architecture.tErrorRate),
      },
      {
        label: "Target Year",
        value:
          architecture.targetYear === undefined
            ? "—"
            : `${architecture.targetYear} (inert on this pipeline)`,
      },
    ];
  }
  return [
    type,
    { label: "Rydberg Time", value: ns(architecture.rydbergTime) },
    { label: "Rydberg Error", value: String(architecture.rydbergError) },
    { label: "Single-Qubit Time", value: ns(architecture.singleQubitTime) },
    { label: "Single-Qubit Error", value: String(architecture.singleQubitError) },
    { label: "Measurement Time", value: ns(architecture.measurementTime) },
    { label: "Measurement Error", value: String(architecture.measurementError) },
    { label: "Handoff Time", value: ns(architecture.handoffTime) },
    { label: "Atom Spacing", value: `${architecture.atomSpacing} µm` },
    {
      label: "Data Qubit Spacing",
      value:
        architecture.dataQubitSpacing === undefined
          ? "Engine default (12.0 µm)"
          : `${architecture.dataQubitSpacing} µm`,
    },
    { label: "Max Velocity", value: `${architecture.maxVelocity} m/s` },
    { label: "Max Acceleration", value: `${architecture.maxAcceleration} m/s²` },
    {
      label: "Surface Code 1-Qubit Time Factor",
      value: String(architecture.surfaceCodeOneQubitTimeFactor),
    },
    {
      label: "Surface Code 2-Qubit Time Factor",
      value: String(architecture.surfaceCodeTwoQubitTimeFactor),
    },
    {
      label: "Target Year",
      value:
        architecture.targetYear === undefined
          ? "—"
          : `${architecture.targetYear} (inert on this pipeline)`,
    },
  ];
}

export function advancedConfigDetails(config: RunConfig): AdvancedDetailGroup[] {
  const factories = config.magicStateFactories.map(
    (factory) => MAGIC_STATE_FACTORY_LABELS[factory] ?? humanizeIdentifier(factory),
  );
  const secondary = config.secondaryFactories ?? [];
  const transform = normalizeTraceTransform(config.traceTransform);
  const dmc = transform.dynamicMemoryCompute;

  const traceItems: AdvancedDetailItem[] = [
    { label: T_COUNT_PER_ROTATION_LABEL, value: String(transform.tStatesPerRotation) },
    { label: "CCX Magic States", value: yesNo(transform.ccxMagicStates) },
    { label: "Slow-Down Factor", value: String(transform.slowDownFactor) },
    { label: "Dynamic Memory Compute", value: dmc ? "On" : "Off" },
  ];
  if (dmc) {
    traceItems.push(
      {
        label: "Compute Capacity Percentage",
        value: String(dmc.computeCapacityPercentage),
      },
      {
        label: "Eviction Strategy",
        value: EVICTION_STRATEGY_LABELS[dmc.evictionStrategy] ?? dmc.evictionStrategy,
      },
    );
  }
  traceItems.push({ label: "Unmemory", value: yesNo(transform.unmemory ?? false) });

  return [
    {
      title: "Application",
      items: applicationDetailItems(config.application, config.parameters),
    },
    { title: "Architecture", items: architectureDetailItems(config.architecture) },
    {
      title: "Error Correction & Factories",
      items: [
        {
          label: "QEC Code",
          value: QEC_LABELS[config.qecCode] ?? humanizeIdentifier(config.qecCode),
        },
        {
          label: factories.length > 1 ? "Magic State Factories" : "Magic State Factory",
          value: factories.join(", "),
        },
        {
          label: "Secondary Factories",
          value:
            secondary.length > 0
              ? secondary
                  .map((f) => SECONDARY_FACTORY_LABELS[f] ?? humanizeIdentifier(f))
                  .join(", ")
              : "None",
        },
        {
          label: "Memory Optimization",
          value: MEMORY_OPTIMIZATION_LABELS[config.memoryOptimization ?? "none"],
        },
      ],
    },
    { title: "Trace Transform", items: traceItems },
    {
      title: "Run Metadata",
      items: [
        {
          label: TOTAL_FAULT_TOLERANT_EXECUTION_ERROR_LABEL,
          value: String(config.maxError),
        },
        { label: "Config QRE Version", value: config.qreVersion },
        { label: "Schema Version", value: config.schemaVersion },
        { label: "Run Name", value: config.name },
        { label: "Created At", value: config.createdAt },
        { label: "Run ID", value: config.id },
      ],
    },
  ];
}
