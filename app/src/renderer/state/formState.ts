/**
 * Editable form state — the single source of truth for a draft run.
 *
 * FormState is a superset of RunConfig: it keeps both architecture and both
 * transform variants' drafts so toggling type never loses the other side's
 * input, and it allows `null` for numeric fields the user hasn't filled yet.
 * `toRunConfig` (see toRunConfig.ts) serializes it to a contract RunConfig.
 *
 * `id`/`createdAt` are NOT stored here — they're stamped at Run-click.
 */
 
import {
  DEFAULT_TRACE_TRANSFORM,
  normalizeTraceTransform,
  type EvictionStrategy,
  type TraceTransform,
} from "../../shared/traceTransform";
import {
  BENCHMARK_IDS,
  expectedQecCode,
  isGsj24Allowed,
  isLitinski19Allowed,
  type Architecture,
  type ArchitectureType,
  type MagicStateFactoryId,
  type MajoranaArchitecture,
  type MemoryOptimizationId,
  type NeutralAtomArchitecture,
  type QecCodeId,
  type RunConfig,
  type SecondaryFactoryId,
  type UploadedProgramFormat,
} from "../../shared/types";
import {
  defaultAllHyperparams,
  type HyperparamValues,
} from "../constants/hyperparameters";
 
export interface GateBasedForm {
  /** Default 1e-4. Valid: 0 < x < 0.01. null until entered. */
  errorRate: number | null;
  /** Required, > 0, no default (null until entered). */
  gateTime: number | null;
  /** Required, > 0, no default (null until entered). */
  measurementTime: number | null;
  /** Optional; null means use the engine default. */
  twoQubitGateTime: number | null;
}
 
export interface MajoranaForm {
  /** Select-only: 1e-4 / 1e-5 / 1e-6. Default 1e-5. */
  errorRate: MajoranaArchitecture["errorRate"];
  /** Default 1000 ns; > 0. null until entered. */
  operationTime: number | null;
  /**
   * T Error Rate (v1.4.0). Optional; 0 < x <= 0.05. `null` means OMITTED, and
   * omitted is not the same as inert: qdk derives it from `errorRate` in
   * `Majorana.__post_init__` (1e-4 -> 0.05, 1e-5 -> 0.015, 1e-6 -> 0.01). A set
   * value is genuinely live, so the control is labelled "derived", not
   * "recorded-only".
   */
  tErrorRate: number | null;
  /**
   * Target Year (v1.4.0). Optional; integer >= 0. `null` means OMITTED. Inert on
   * our pipeline — set on MEAS_XX/MEAS_ZZ as a property, and no transform of
   * ours consumes a target year.
   */
  targetYear: number | null;
}
 
/**
 * Neutral Atom draft (v1.1.0). Every field has a spec default (QPU Specification
 * tab), so none is nullable — the form seeds them all and the user edits in
 * place, mirroring how Majorana treats its defaulted fields.
 */
export interface NeutralAtomForm {
  /** Rydberg Time (ns), > 0. Default 500. */
  rydbergTime: number;
  /** Rydberg Error, [0, 0.01). Default 1e-3. */
  rydbergError: number;
  /** Single-Qubit Time (ns), > 0. Default 1000. */
  singleQubitTime: number;
  /** Single-Qubit Error, [0, 0.01). Default 1e-4. */
  singleQubitError: number;
  /** Measurement Time (ns), > 0. Default 10000. */
  measurementTime: number;
  /** Measurement Error, [0, 0.01). Default 1e-4. */
  measurementError: number;
  /** Handoff Time (ns), >= 0. Default 0. */
  handoffTime: number;
  /** Atom Spacing (µm), > 0. Default 3.0. */
  atomSpacing: number;
  /**
   * Data Qubit Spacing (µm) (v1.4.0), > 0. `null` means OMITTED, and omitted is
   * qdk's own 12.0 — which is what every pre-v1.4.0 record ran with. The spec
   * table calls 12.0 a default, but the contract types the field optional, and
   * seeding it would write an explicit 12.0 into every Neutral Atom record for
   * no behavioural gain (measured bit-identical across 6.0 / 12.0 / 30.0). So
   * it follows the same rule as twoQubitGateTime: absent until the user sets it.
   */
  dataQubitSpacing: number | null;
  /** Max Velocity (m/s), > 0. Default 0.25. */
  maxVelocity: number;
  /** Max Acceleration (m/s²), > 0. Default 5000.0. */
  maxAcceleration: number;
  /** Surface Code Single-Qubit Time Factor, >= 1. Default 1. */
  surfaceCodeOneQubitTimeFactor: number;
  /** Surface Code Two-Qubit Time Factor, >= 1. Default 1. */
  surfaceCodeTwoQubitTimeFactor: number;
  /**
   * Target Year (v1.4.0). Optional; integer >= 0. `null` means OMITTED. Inert on
   * our pipeline, same as Majorana's — set on CZ/CNOT as a property that no
   * transform of ours reads.
   */
  targetYear: number | null;
}
 
export interface ArchitectureForm {
  type: ArchitectureType;
  gateBased: GateBasedForm;
  majorana: MajoranaForm;
  neutralAtom: NeutralAtomForm;
}
 
export type ApplicationFormType =
  | "benchmark"
  | "saved"
  | "uploaded"
  | "manualCounts";
 
/**
 * Manual Logical Counts draft — the seven contract fields, each `null` until the
 * user enters it (so the form can require them without pretending a default).
 */
export interface ManualCountsForm {
  numQubits: number | null;
  tCount: number | null;
  rotationCount: number | null;
  rotationDepth: number | null;
  cczCount: number | null;
  ccixCount: number | null;
  measurementCount: number | null;
}
 
export interface UploadForm {
  filePath: string;
  format: UploadedProgramFormat;
  /** "Save to my programs" — mirrors the contract's addToLibrary and, when set,
   *  keeps the uploaded file in `savedPrograms` so it can be re-run later. */
  addToLibrary: boolean;
}
 
/** One program the user kept in their session library (an earlier upload). */
export interface SavedProgram {
  id: string;
  /** Display name, defaulting to the file's basename. */
  name: string;
  filePath: string;
  format: UploadedProgramFormat;
}
 
export interface ApplicationForm {
  type: ApplicationFormType;
  benchmarkId: string;
  /** Per-benchmark hyperparameter values, keyed by benchmark id. Every benchmark
   *  is seeded to its spec defaults so switching benchmarks never loses entries. */
  hyperparams: Record<string, HyperparamValues>;
  upload: UploadForm;
  /** Session library of saved uploads, surfaced under the "Saved Programs" type. */
  savedPrograms: SavedProgram[];
  /** The selected saved program's id (empty until one is picked). */
  selectedSavedId: string;
  /** Manual Logical Counts draft, used when type === "manualCounts". */
  manualCounts: ManualCountsForm;
}
 
/**
 * The trace-transform draft. There is no variant to pick: PSSPC and Lattice
 * Surgery are sequential stages that both run on every estimate (see
 * shared/traceTransform.ts), so the form edits one object of parameters.
 */
export interface DynamicMemoryComputeForm {
  /** Fraction of capacity given to compute. 0 < x <= 1. Default 0.5. null until entered. */
  computeCapacityPercentage: number | null;
  /** qdk default: least_recently_used. */
  evictionStrategy: EvictionStrategy;
}

export interface TraceTransformForm {
  /** PSSPC. Default 20. Valid: 5 <= x <= 20. */
  tStatesPerRotation: number;
  /** PSSPC. Default false; bound to the GSJ24 CCX secondary factory. */
  ccxMagicStates: boolean;
  /** Lattice Surgery. Fixed at 1.0. */
  slowDownFactor: 1.0;
  /**
   * Stage 0 (v1.4.0). `null` means the stage is OFF and must be ABSENT from the
   * serialized pipeline — not present at its defaults. Those are different
   * pipelines and therefore different estimates, which is why the stage is
   * modelled as nullable rather than as an always-present object with an
   * `enabled` flag: there is no shape here that can accidentally serialize a
   * stage the analyst turned off.
   */
  dynamicMemoryCompute: DynamicMemoryComputeForm | null;
  /**
   * Stage 3 (v1.4.0). Unmemory REVERSES Dynamic Memory Compute, so it is gated
   * on stage 0 rather than labelled recorded-only — with stage 0 off there is no
   * memory model to remove, and an unchanged estimate is the correct result.
   * `normalizeFormState` clears this whenever stage 0 is off.
   */
  unmemory: boolean;
}
 
export interface FormState {
  /** Blank => auto-generated at serialization time (see generateName). */
  name: string;
  application: ApplicationForm;
  architecture: ArchitectureForm;
  /**
   * Primary magic-state factories (v1.2.0) — a multi-select set, never empty.
   * normalizeFormState drops members the current architecture disallows and
   * falls back to ["round_based"] rather than leaving the set empty.
   */
  magicStateFactories: MagicStateFactoryId[];
  /**
   * Secondary factories (v1.1.0). Multi-select set, empty by default. Independent
   * of the primary magicStateFactories. gsj24_ccx is kept in sync with the PSSPC
   * ccxMagicStates flag by the UI; magic_up_to_clifford is cleared on Majorana by
   * normalizeFormState.
   */
  secondaryFactories: SecondaryFactoryId[];
  /** Memory optimization (v1.1.0). "none" by default. */
  memoryOptimization: MemoryOptimizationId;
  traceTransform: TraceTransformForm;
  /** Default 1.0 (unconstrained). Valid: 0 < x <= 1. null => unset. */
  maxError: number | null;
}
 
/** First benchmark in contract order, used as the default selection. */
const DEFAULT_BENCHMARK_ID = BENCHMARK_IDS[0];
 
/** A fresh draft: everything defaulted except the two required GateBased times. */
export function createInitialFormState(): FormState {
  return {
    name: "",
    application: {
      type: "benchmark",
      benchmarkId: DEFAULT_BENCHMARK_ID,
      hyperparams: defaultAllHyperparams(),
      upload: { filePath: "", format: "qsharp", addToLibrary: false },
      savedPrograms: [],
      selectedSavedId: "",
      manualCounts: {
        numQubits: null,
        tCount: null,
        rotationCount: null,
        rotationDepth: null,
        cczCount: null,
        ccixCount: null,
        measurementCount: null,
      },
    },
    architecture: {
      type: "gateBased",
      gateBased: {
        errorRate: 0.0001,
        gateTime: null,
        measurementTime: null,
        twoQubitGateTime: null,
      },
      majorana: {
        errorRate: 0.00001,
        operationTime: 1000,
        tErrorRate: null,
        targetYear: null,
      },
      neutralAtom: {
        rydbergTime: 500,
        rydbergError: 0.001,
        singleQubitTime: 1000,
        singleQubitError: 0.0001,
        measurementTime: 10000,
        measurementError: 0.0001,
        handoffTime: 0,
        atomSpacing: 3.0,
        dataQubitSpacing: null,
        maxVelocity: 0.25,
        maxAcceleration: 5000.0,
        surfaceCodeOneQubitTimeFactor: 1,
        surfaceCodeTwoQubitTimeFactor: 1,
        targetYear: null,
      },
    },
    magicStateFactories: ["round_based"],
    secondaryFactories: [],
    memoryOptimization: "none",
    traceTransform: traceTransformForm(DEFAULT_TRACE_TRANSFORM),
    maxError: 1.0,
  };
}

/**
 * Serialize the four-stage pipeline back to the contract shape. PSSPC and
 * Lattice Surgery always run and copy straight across; the two optional stages
 * are OMITTED when off rather than written at their defaults.
 *
 * This is the rule the whole stage design exists to protect. qdk composes
 * `DynamicMemoryCompute(0.5, LRU) × PSSPC × LatticeSurgery` into a genuinely
 * different estimate than `PSSPC × LatticeSurgery` (477 qubits / 1,363,950 ns
 * vs 256 / 1,852,200 on Ising Model (2D) 3×3), so a form that always wrote an
 * object would silently add stage 0 to every run — and the toggle would look
 * like it worked while changing nothing, because every run already had it.
 *
 * Returns null when stage 0 is enabled with no capacity entered, which gates
 * serialization the same way a missing gate time does. Dropping the stage
 * instead would run a shorter pipeline than the form is showing.
 */
export function buildTraceTransform(form: TraceTransformForm): TraceTransform | null {
  const transform: TraceTransform = {
    tStatesPerRotation: form.tStatesPerRotation,
    ccxMagicStates: form.ccxMagicStates,
    slowDownFactor: form.slowDownFactor,
  };

  const dmc = form.dynamicMemoryCompute;
  if (dmc === null) return transform;
  if (dmc.computeCapacityPercentage === null) return null;

  transform.dynamicMemoryCompute = {
    computeCapacityPercentage: dmc.computeCapacityPercentage,
    evictionStrategy: dmc.evictionStrategy,
  };
  // Unmemory reverses stage 0, so it is written only alongside it. This is the
  // boundary's own check rather than a restatement of normalizeFormState's —
  // a config can also arrive here from a rerun or an import.
  if (form.unmemory) {
    transform.unmemory = true;
  }
  return transform;
}

/**
 * Adapt a contract TraceTransform to the editable form shape. An absent stage 0
 * becomes `null` (off) rather than an object at its defaults, so the round trip
 * config -> form -> config cannot introduce a stage the record never ran.
 */
export function traceTransformForm(transform: TraceTransform): TraceTransformForm {
  return {
    tStatesPerRotation: transform.tStatesPerRotation,
    ccxMagicStates: transform.ccxMagicStates,
    slowDownFactor: transform.slowDownFactor,
    dynamicMemoryCompute:
      transform.dynamicMemoryCompute === undefined
        ? null
        : { ...transform.dynamicMemoryCompute },
    unmemory: transform.unmemory ?? false,
  };
}
 
/** Rehydrate an immutable saved config into the editable form used by Rerun. */
export function formStateFromRunConfig(config: RunConfig): FormState {
  const initial = createInitialFormState();
  const app = config.application;
  let application: ApplicationForm;
  if (app.type === "benchmark") {
    application = {
      ...initial.application,
      type: "benchmark",
      benchmarkId: app.benchmarkId,
      /**
       * Restore the SAVED hyperparameters, not the benchmark's defaults.
       *
       * `parameters` become the arguments of the benchmark's Q# entry
       * operation, so losing them does not reset a label — it estimates a
       * DIFFERENT CIRCUIT. Rerunning a 3x3 / T=9 Ising Model record silently
       * re-ran it at the 10x10 / T=30 defaults, reporting 52,801 physical
       * qubits where the original said 256, with nothing on screen to say the
       * workload had changed.
       *
       * Seeded from the benchmark's defaults first so a record saved before a
       * parameter was added still gets a value for it rather than a hole.
       */
      hyperparams: {
        ...initial.application.hyperparams,
        [app.benchmarkId]: {
          ...(initial.application.hyperparams[app.benchmarkId] ?? {}),
          ...(config.parameters ?? {}),
        },
      },
    };
  } else if (app.type === "uploaded") {
    application = {
      ...initial.application,
      type: "uploaded",
      upload: {
        filePath: app.filePath,
        format: app.format,
        addToLibrary: app.addToLibrary,
      },
    };
  } else {
    application = {
      ...initial.application,
      type: "manualCounts",
      manualCounts: {
        numQubits: app.numQubits,
        tCount: app.tCount,
        rotationCount: app.rotationCount,
        rotationDepth: app.rotationDepth,
        cczCount: app.cczCount,
        ccixCount: app.ccixCount,
        measurementCount: app.measurementCount,
      },
    };
  }
 
  let architecture: ArchitectureForm;
  if (config.architecture.type === "gateBased") {
    architecture = {
      ...initial.architecture,
      type: "gateBased",
      gateBased: {
        errorRate: config.architecture.errorRate,
        gateTime: config.architecture.gateTime,
        measurementTime: config.architecture.measurementTime,
        twoQubitGateTime: config.architecture.twoQubitGateTime ?? null,
      },
    };
  } else if (config.architecture.type === "majorana") {
    architecture = {
      ...initial.architecture,
      type: "majorana",
      majorana: {
        errorRate: config.architecture.errorRate,
        operationTime: config.architecture.operationTime,
        tErrorRate: config.architecture.tErrorRate ?? null,
        targetYear: config.architecture.targetYear ?? null,
      },
    };
  } else {
    architecture = {
      ...initial.architecture,
      type: "neutralAtom",
      neutralAtom: {
        rydbergTime: config.architecture.rydbergTime,
        rydbergError: config.architecture.rydbergError,
        singleQubitTime: config.architecture.singleQubitTime,
        singleQubitError: config.architecture.singleQubitError,
        measurementTime: config.architecture.measurementTime,
        measurementError: config.architecture.measurementError,
        handoffTime: config.architecture.handoffTime,
        atomSpacing: config.architecture.atomSpacing,
        dataQubitSpacing: config.architecture.dataQubitSpacing ?? null,
        maxVelocity: config.architecture.maxVelocity,
        maxAcceleration: config.architecture.maxAcceleration,
        surfaceCodeOneQubitTimeFactor:
          config.architecture.surfaceCodeOneQubitTimeFactor,
        surfaceCodeTwoQubitTimeFactor:
          config.architecture.surfaceCodeTwoQubitTimeFactor,
        targetYear: config.architecture.targetYear ?? null,
      },
    };
  }
 
  return normalizeFormState({
    name: config.name,
    application,
    architecture,
    magicStateFactories: [...config.magicStateFactories],
    secondaryFactories: config.secondaryFactories ?? [],
    memoryOptimization: config.memoryOptimization ?? "none",
    // Rerun of a v1.1.0 record goes through the same read path as History and
    // Comparison, so an old psspc/latticeSurgery record rehydrates correctly.
    traceTransform: traceTransformForm(normalizeTraceTransform(config.traceTransform)),
    maxError: config.maxError,
  });
}
 
/**
 * QEC code derived from the architecture type only, via the contract helper.
 * Works before the required times are entered (fills probes that the helper
 * ignores), so the UI can display the derived code and auto-name at any time.
 */
export function deriveQecCode(arch: ArchitectureForm): QecCodeId {
  if (arch.type === "gateBased") {
    return expectedQecCode({
      type: "gateBased",
      errorRate: arch.gateBased.errorRate ?? 0.0001,
      gateTime: arch.gateBased.gateTime ?? 1,
      measurementTime: arch.gateBased.measurementTime ?? 1,
      twoQubitGateTime: arch.gateBased.twoQubitGateTime,
    });
  }
  if (arch.type === "majorana") {
    return expectedQecCode({
      type: "majorana",
      errorRate: arch.majorana.errorRate,
      operationTime: arch.majorana.operationTime ?? 1000,
    });
  }
  return expectedQecCode(neutralAtomArchitecture(arch.neutralAtom));
}

/**
 * The contract NeutralAtom a draft represents. `targetYear` is omitted when
 * unset rather than defaulted — it is optional in the contract, and neither
 * caller (QEC derivation, factory availability) reads it at all.
 */
function neutralAtomArchitecture(n: NeutralAtomForm): NeutralAtomArchitecture {
  const { targetYear, dataQubitSpacing, ...rest } = n;
  const architecture: NeutralAtomArchitecture = { type: "neutralAtom", ...rest };
  if (dataQubitSpacing !== null) architecture.dataQubitSpacing = dataQubitSpacing;
  if (targetYear !== null) architecture.targetYear = targetYear;
  return architecture;
}
 
/**
 * Build the contract Architecture a form draft currently represents, filling the
 * few probe fields the availability helpers ignore, so the contract-level
 * `isLitinski19Allowed` / `isGsj24Allowed` can be reused verbatim (single source
 * of truth for the thresholds). Returns null only when a required GateBased field
 * is unset, in which case factory availability is treated as false.
 */
function draftArchitecture(arch: ArchitectureForm): Architecture | null {
  if (arch.type === "gateBased") {
    if (arch.gateBased.errorRate === null) return null;
    return {
      type: "gateBased",
      errorRate: arch.gateBased.errorRate,
      gateTime: arch.gateBased.gateTime ?? 1,
      measurementTime: arch.gateBased.measurementTime ?? 1,
      twoQubitGateTime: arch.gateBased.twoQubitGateTime,
    };
  }
  if (arch.type === "majorana") {
    return {
      type: "majorana",
      errorRate: arch.majorana.errorRate,
      operationTime: arch.majorana.operationTime ?? 1000,
    };
  }
  return neutralAtomArchitecture(arch.neutralAtom);
}
 
/**
 * Whether Litinski19 is selectable given the current draft. Delegates the
 * thresholds to the contract helper (Superconducting <= 1e-3, or Neutral Atom
 * with all three errors <= 1e-3). Majorana never qualifies.
 */
export function isLitinski19AllowedInForm(arch: ArchitectureForm): boolean {
  const architecture = draftArchitecture(arch);
  return architecture !== null && isLitinski19Allowed(architecture);
}
 
/**
 * Whether GSJ24 is selectable given the current draft. Delegates to the contract
 * helper (Superconducting <= 1e-3, or Neutral Atom with rydbergError <= 1e-3 and
 * single-qubit/measurement error < 1e-2). Majorana never qualifies.
 */
export function isGsj24AllowedInForm(arch: ArchitectureForm): boolean {
  const architecture = draftArchitecture(arch);
  return architecture !== null && isGsj24Allowed(architecture);
}
 
/**
 * Whether a primary magic-state factory is allowed on the current draft
 * architecture. round_based always is, which is what guarantees the set can
 * always fall back to something rather than emptying out.
 */
export function isPrimaryFactoryAllowed(
  factory: MagicStateFactoryId,
  arch: ArchitectureForm,
): boolean {
  if (factory === "round_based") return true;
  if (factory === "litinski19") return isLitinski19AllowedInForm(arch);
  return isGsj24AllowedInForm(arch);
}
 
/**
 * Enforce cross-field coupling the schema requires, so the UI state is never
 * internally inconsistent:
 *  - primary factories no longer allowed on the current architecture (raised
 *    error rate, or a switch to Majorana, which supports only round_based) are
 *    dropped from the set, which falls back to ["round_based"] if that empties
 *    it; and
 *  - magic_up_to_clifford is dropped from the secondary set under Majorana, which
 *    the schema forbids.
 * Idempotent: applying it to already-consistent state returns it unchanged.
 */
export function normalizeFormState(state: FormState): FormState {
  let next = state;
 
  // Drop primary factories the current architecture disallows — raising an error
  // rate or switching to Majorana can invalidate part of the set.
  //
  // Two ways the result can be empty, and they mean different things:
  //  - the set was ALREADY empty — the user cleared it in the checkbox group.
  //    That is a legal-but-invalid draft state; `validateForm` flags it and the
  //    Run gate blocks it, so it is left empty rather than silently repaired.
  //  - filtering removed the last member because it was DISALLOWED (a switch to
  //    Majorana with only litinski19 selected, or an agent draft naming a
  //    factory this architecture forbids). There is a real factory to replace it
  //    with, so it falls back to round_based, which every architecture accepts.
  const filtered = state.magicStateFactories.filter((factory) =>
    isPrimaryFactoryAllowed(factory, state.architecture),
  );
  const primaries: MagicStateFactoryId[] =
    filtered.length === 0 && state.magicStateFactories.length > 0
      ? ["round_based"]
      : filtered;
  // Compared by CONTENT, not length, so `["litinski19"] -> ["round_based"]` is
  // seen as a change rather than mis-read as unchanged (both have length 1).
  const primariesUnchanged =
    primaries.length === state.magicStateFactories.length &&
    primaries.every((factory, index) => factory === state.magicStateFactories[index]);
  if (!primariesUnchanged) {
    next = { ...next, magicStateFactories: primaries };
  }
 
  if (
    state.architecture.type === "majorana" &&
    next.secondaryFactories.includes("magic_up_to_clifford")
  ) {
    next = {
      ...next,
      secondaryFactories: next.secondaryFactories.filter(
        (f) => f !== "magic_up_to_clifford",
      ),
    };
  }

  // Unmemory reverses Dynamic Memory Compute, so it cannot run without it. The
  // UI disables the control, and this clears the value as well — otherwise
  // turning stage 0 off would leave a checked Unmemory in state, ready to
  // serialize a stage with nothing to reverse the moment stage 0 came back.
  if (next.traceTransform.dynamicMemoryCompute === null && next.traceTransform.unmemory) {
    next = {
      ...next,
      traceTransform: { ...next.traceTransform, unmemory: false },
    };
  }

  return next;
}