/**
 * Configuration Summary derivation for the DRAFT surface.
 *
 * The results page derives its recap from an immutable RunConfig (see
 * results/resultFields.ts); this is the same shape and ordering derived from the
 * editable FormState instead. The difference that forces a parallel module: a
 * draft is routinely incomplete — required numbers are `null` until entered — so
 * every value here degrades to "—" rather than assuming a finished config. The
 * two surfaces share the label maps and the `.config-grid`/`.advanced-details`
 * markup, so they read identically once a draft is complete.
 */

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
import type { HyperparamValues } from "../constants/hyperparameters";
import { editableParams } from "../../shared/benchmarkParams";
import {
  deriveQecCode,
  type ApplicationForm,
  type ArchitectureForm,
  type FormState,
  type TraceTransformForm,
} from "../state/formState";

export interface SummaryItem {
  label: string;
  value: string;
}
export interface AdvancedDetailGroup {
  title: string;
  items: SummaryItem[];
}

/** The em dash a not-yet-entered value renders as, everywhere in the summary. */
const DASH = "—";
const num = (value: number | null): string => (value === null ? DASH : String(value));
const ns = (value: number | null): string => (value === null ? DASH : `${value} ns`);
const yesNo = (value: boolean): string => (value ? "Yes" : "No");

const EVICTION_STRATEGY_LABELS: Record<string, string> = {
  least_recently_used: "Least Recently Used",
  least_frequently_used: "Least Frequently Used",
  first_available: "First Available",
};

/**
 * Resolve one hyperparameter to its display string: the entered value, or the
 * benchmark default when the field is untouched (matching what the run would
 * send); choice params render their option label, not the raw enum id.
 */
function resolveParamDisplay(
  benchmarkId: string,
  key: string,
  values: HyperparamValues | undefined,
): string {
  const spec = editableParams(benchmarkId).find((param) => param.key === key);
  const raw = values?.[key] ?? spec?.default;
  if (raw === undefined || raw === null) return DASH;
  if (spec?.kind === "choice") {
    return spec.options.find((option) => option.value === raw)?.label ?? String(raw);
  }
  return String(raw);
}

/**
 * The primary sizing hyperparameter(s) per benchmark — the dominant cost driver,
 * always shown beside the application name. Unknown ids contribute nothing.
 */
function benchmarkPrimaryItems(app: ApplicationForm): SummaryItem[] {
  const values = app.hyperparams[app.benchmarkId];
  const show = (key: string) => resolveParamDisplay(app.benchmarkId, key, values);
  switch (app.benchmarkId) {
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

/** Section 1 of the recap: the application and its biggest cost driver. */
function applicationSummaryItems(app: ApplicationForm): SummaryItem[] {
  if (app.type === "benchmark") {
    const name = findBenchmark(app.benchmarkId)?.name ?? (app.benchmarkId || DASH);
    return [{ label: "Application", value: name }, ...benchmarkPrimaryItems(app)];
  }
  if (app.type === "saved") {
    const chosen = app.savedPrograms.find((program) => program.id === app.selectedSavedId);
    if (!chosen) {
      return [
        { label: "Application", value: "Saved Program" },
        { label: "Program", value: "None chosen" },
      ];
    }
    return [
      { label: "Application", value: "Saved Program" },
      { label: "Program", value: chosen.name },
      { label: "Language", value: FORMAT_LABELS[chosen.format] },
    ];
  }
  if (app.type === "manualCounts") {
    return [
      { label: "Application", value: "Manual Logical Counts" },
      { label: "Logical Qubit Count", value: num(app.manualCounts.numQubits) },
      { label: "T Count", value: num(app.manualCounts.tCount) },
    ];
  }
  const file = app.upload.filePath.split(/[\\/]/).pop() || "No file chosen";
  return [
    { label: "Application", value: "Uploaded Program" },
    { label: "Program", value: file },
    { label: "Language", value: FORMAT_LABELS[app.upload.format] },
  ];
}

/** The headline error rate for the active architecture. */
function architectureErrorRate(arch: ArchitectureForm): string {
  if (arch.type === "gateBased") return num(arch.gateBased.errorRate);
  if (arch.type === "majorana") return num(arch.majorana.errorRate);
  // Neutral Atom has three error rates; the Rydberg error is the headline one,
  // matching how the results recap names it.
  return num(arch.neutralAtom.rydbergError);
}

/**
 * The flat, curated recap — the same ordered field set the results page shows,
 * so a completed draft and its saved run read identically.
 */
export function summarizeFormState(state: FormState): SummaryItem[] {
  const items: SummaryItem[] = [
    // 1. What's being estimated and its primary sizing driver.
    ...applicationSummaryItems(state.application),
    // 2. Hardware and its headline error rate.
    { label: "Architecture", value: ARCHITECTURE_LABELS[state.architecture.type] },
    { label: "Error Rate", value: architectureErrorRate(state.architecture) },
    // 3. Error correction: the derived QEC pairing and the selected factories.
    { label: "QEC Code", value: QEC_LABELS[deriveQecCode(state.architecture)] },
    {
      label:
        state.magicStateFactories.length > 1
          ? "Magic State Factories"
          : "Magic State Factory",
      value: state.magicStateFactories
        .map((factory) => MAGIC_STATE_FACTORY_LABELS[factory])
        .join(" + "),
    },
    // 4. Accuracy: the target error to confirm before a run.
    { label: TOTAL_FAULT_TOLERANT_EXECUTION_ERROR_LABEL, value: num(state.maxError) },
  ];

  // 5. Active optimizations: shown only when set away from the default, so the
  // recap stays quiet for a stock draft and flags only the exceptions.
  if (state.memoryOptimization !== "none") {
    items.push({
      label: "Memory Optimization",
      value: MEMORY_OPTIMIZATION_LABELS[state.memoryOptimization],
    });
  }
  if (state.traceTransform.dynamicMemoryCompute !== null) {
    items.push({ label: "Dynamic Memory Compute", value: "On" });
  }
  if (state.traceTransform.unmemory) {
    items.push({ label: "Unmemory", value: "On" });
  }

  return items;
}

function applicationDetailItems(app: ApplicationForm): SummaryItem[] {
  if (app.type === "benchmark") {
    const values = app.hyperparams[app.benchmarkId];
    const items: SummaryItem[] = [
      { label: "Type", value: "Benchmark" },
      {
        label: "Benchmark",
        value: findBenchmark(app.benchmarkId)?.name ?? (app.benchmarkId || DASH),
      },
    ];
    for (const param of editableParams(app.benchmarkId)) {
      items.push({
        label: param.label,
        value: resolveParamDisplay(app.benchmarkId, param.key, values),
      });
    }
    return items;
  }
  if (app.type === "saved") {
    const chosen = app.savedPrograms.find((program) => program.id === app.selectedSavedId);
    if (!chosen) {
      return [
        { label: "Type", value: "Saved Program" },
        { label: "Program", value: "None chosen" },
      ];
    }
    return [
      { label: "Type", value: "Saved Program" },
      { label: "Program", value: chosen.name },
      { label: "File", value: chosen.filePath },
      { label: "Format", value: FORMAT_LABELS[chosen.format] },
    ];
  }
  if (app.type === "manualCounts") {
    const m = app.manualCounts;
    return [
      { label: "Type", value: "Manual Logical Counts" },
      { label: "Number of Qubits", value: num(m.numQubits) },
      { label: "T Count", value: num(m.tCount) },
      { label: "Rotation Count", value: num(m.rotationCount) },
      { label: "Rotation Depth", value: num(m.rotationDepth) },
      { label: "CCZ Count", value: num(m.cczCount) },
      { label: "CCiX Count", value: num(m.ccixCount) },
      { label: "Measurement Count", value: num(m.measurementCount) },
    ];
  }
  return [
    { label: "Type", value: "Uploaded Program" },
    { label: "File", value: app.upload.filePath || "No file chosen" },
    { label: "Format", value: FORMAT_LABELS[app.upload.format] },
    { label: "Add to Library", value: yesNo(app.upload.addToLibrary) },
  ];
}

function architectureDetailItems(arch: ArchitectureForm): SummaryItem[] {
  const type = { label: "Type", value: ARCHITECTURE_LABELS[arch.type] };
  if (arch.type === "gateBased") {
    const g = arch.gateBased;
    return [
      type,
      { label: "Error Rate", value: num(g.errorRate) },
      { label: "Gate Time", value: ns(g.gateTime) },
      { label: "Measurement Time", value: ns(g.measurementTime) },
      {
        label: "Two-Qubit Gate Time",
        value: g.twoQubitGateTime === null ? "Engine default" : ns(g.twoQubitGateTime),
      },
    ];
  }
  if (arch.type === "majorana") {
    const m = arch.majorana;
    return [
      type,
      { label: "Error Rate", value: num(m.errorRate) },
      { label: "Operation Time", value: ns(m.operationTime) },
      {
        label: "T Error Rate",
        value: m.tErrorRate === null ? "Derived from error rate" : String(m.tErrorRate),
      },
      {
        label: "Target Year",
        value:
          m.targetYear === null ? DASH : `${m.targetYear} (inert on this pipeline)`,
      },
    ];
  }
  const n = arch.neutralAtom;
  return [
    type,
    { label: "Rydberg Time", value: ns(n.rydbergTime) },
    { label: "Rydberg Error", value: String(n.rydbergError) },
    { label: "Single-Qubit Time", value: ns(n.singleQubitTime) },
    { label: "Single-Qubit Error", value: String(n.singleQubitError) },
    { label: "Measurement Time", value: ns(n.measurementTime) },
    { label: "Measurement Error", value: String(n.measurementError) },
    { label: "Handoff Time", value: ns(n.handoffTime) },
    { label: "Atom Spacing", value: `${n.atomSpacing} µm` },
    {
      label: "Data Qubit Spacing",
      value:
        n.dataQubitSpacing === null
          ? "Engine default (12.0 µm)"
          : `${n.dataQubitSpacing} µm`,
    },
    { label: "Max Velocity", value: `${n.maxVelocity} m/s` },
    { label: "Max Acceleration", value: `${n.maxAcceleration} m/s²` },
    {
      label: "Surface Code 1-Qubit Time Factor",
      value: String(n.surfaceCodeOneQubitTimeFactor),
    },
    {
      label: "Surface Code 2-Qubit Time Factor",
      value: String(n.surfaceCodeTwoQubitTimeFactor),
    },
    {
      label: "Target Year",
      value: n.targetYear === null ? DASH : `${n.targetYear} (inert on this pipeline)`,
    },
  ];
}

function traceTransformDetailItems(transform: TraceTransformForm): SummaryItem[] {
  const dmc = transform.dynamicMemoryCompute;
  const items: SummaryItem[] = [
    { label: T_COUNT_PER_ROTATION_LABEL, value: String(transform.tStatesPerRotation) },
    { label: "CCX Magic States", value: yesNo(transform.ccxMagicStates) },
    { label: "Slow-Down Factor", value: String(transform.slowDownFactor) },
    { label: "Dynamic Memory Compute", value: dmc ? "On" : "Off" },
  ];
  if (dmc) {
    items.push(
      {
        label: "Compute Capacity Percentage",
        value: num(dmc.computeCapacityPercentage),
      },
      {
        label: "Eviction Strategy",
        value: EVICTION_STRATEGY_LABELS[dmc.evictionStrategy] ?? dmc.evictionStrategy,
      },
    );
  }
  items.push({ label: "Unmemory", value: yesNo(transform.unmemory) });
  return items;
}

/**
 * The exhaustive companion to the recap: every draft value, grouped for the
 * expandable panel. Mirrors the results page's advanced breakdown, minus the
 * fields a draft has not earned yet (run id, created-at) — replaced by the
 * auto-generated name it would run under.
 */
export function advancedConfigDetails(
  state: FormState,
  generatedName: string,
  qreVersion: string,
): AdvancedDetailGroup[] {
  const factories = state.magicStateFactories.map(
    (factory) => MAGIC_STATE_FACTORY_LABELS[factory],
  );
  const secondary = state.secondaryFactories;

  return [
    { title: "Application", items: applicationDetailItems(state.application) },
    { title: "Architecture", items: architectureDetailItems(state.architecture) },
    {
      title: "Error Correction & Factories",
      items: [
        { label: "QEC Code", value: QEC_LABELS[deriveQecCode(state.architecture)] },
        {
          label: factories.length > 1 ? "Magic State Factories" : "Magic State Factory",
          value: factories.join(", "),
        },
        {
          label: "Secondary Factories",
          value:
            secondary.length > 0
              ? secondary.map((f) => SECONDARY_FACTORY_LABELS[f]).join(", ")
              : "None",
        },
        {
          label: "Memory Optimization",
          value: MEMORY_OPTIMIZATION_LABELS[state.memoryOptimization],
        },
      ],
    },
    { title: "Trace Transform", items: traceTransformDetailItems(state.traceTransform) },
    {
      title: "Run Metadata",
      items: [
        {
          label: TOTAL_FAULT_TOLERANT_EXECUTION_ERROR_LABEL,
          value: num(state.maxError),
        },
        { label: "QRE Version", value: qreVersion },
        { label: "Auto-Generated Name", value: generatedName },
      ],
    },
  ];
}
