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
  BENCHMARK_IDS,
  expectedQecCode,
  isLitinski19Allowed,
  type ArchitectureType,
  type MagicStateFactoryId,
  type MajoranaArchitecture,
  type QecCodeId,
  type RunConfig,
  type TraceTransformType,
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
}

export interface ArchitectureForm {
  type: ArchitectureType;
  gateBased: GateBasedForm;
  majorana: MajoranaForm;
}

export type ApplicationFormType = "benchmark" | "saved" | "uploaded";

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
}

export interface PsspcForm {
  /** Default 20. Valid: 5 <= x <= 20. */
  tStatesPerRotation: number;
  ccxMagicStates: boolean;
}

export interface TraceTransformForm {
  type: TraceTransformType;
  psspc: PsspcForm;
}

export interface FormState {
  /** Blank => auto-generated at serialization time (see generateName). */
  name: string;
  application: ApplicationForm;
  architecture: ArchitectureForm;
  magicStateFactory: MagicStateFactoryId;
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
    },
    architecture: {
      type: "gateBased",
      gateBased: {
        errorRate: 0.0001,
        gateTime: null,
        measurementTime: null,
        twoQubitGateTime: null,
      },
      majorana: { errorRate: 0.00001, operationTime: 1000 },
    },
    magicStateFactory: "round_based",
    traceTransform: {
      type: "psspc",
      psspc: { tStatesPerRotation: 20, ccxMagicStates: false },
    },
    maxError: 1.0,
  };
}

/** Rehydrate an immutable saved config into the editable form used by Rerun. */
export function formStateFromRunConfig(config: RunConfig): FormState {
  const initial = createInitialFormState();
  const application: ApplicationForm =
    config.application.type === "benchmark"
      ? {
          ...initial.application,
          type: "benchmark",
          benchmarkId: config.application.benchmarkId,
        }
      : {
          ...initial.application,
          type: "uploaded",
          upload: {
            filePath: config.application.filePath,
            format: config.application.format,
            addToLibrary: config.application.addToLibrary,
          },
        };

  const architecture: ArchitectureForm =
    config.architecture.type === "gateBased"
      ? {
          ...initial.architecture,
          type: "gateBased",
          gateBased: {
            errorRate: config.architecture.errorRate,
            gateTime: config.architecture.gateTime,
            measurementTime: config.architecture.measurementTime,
            twoQubitGateTime: config.architecture.twoQubitGateTime ?? null,
          },
        }
      : {
          ...initial.architecture,
          type: "majorana",
          majorana: {
            errorRate: config.architecture.errorRate,
            operationTime: config.architecture.operationTime,
          },
        };

  return normalizeFormState({
    name: config.name,
    application,
    architecture,
    magicStateFactory: config.magicStateFactory,
    traceTransform: {
      type: config.traceTransform.type,
      psspc:
        config.traceTransform.type === "psspc"
          ? {
              tStatesPerRotation: config.traceTransform.tStatesPerRotation,
              ccxMagicStates: config.traceTransform.ccxMagicStates,
            }
          : initial.traceTransform.psspc,
    },
    maxError: config.maxError,
  });
}

/**
 * QEC code derived from the architecture type only, via the contract helper.
 * Works before the required times are entered (fills probes that the helper
 * ignores), so the UI can display the derived code and auto-name at any time.
 */
export function deriveQecCode(arch: ArchitectureForm): QecCodeId {
  return expectedQecCode(
    arch.type === "gateBased"
      ? {
          type: "gateBased",
          errorRate: arch.gateBased.errorRate ?? 0.0001,
          gateTime: arch.gateBased.gateTime ?? 1,
          measurementTime: arch.gateBased.measurementTime ?? 1,
          twoQubitGateTime: arch.gateBased.twoQubitGateTime,
        }
      : {
          type: "majorana",
          errorRate: arch.majorana.errorRate,
          operationTime: arch.majorana.operationTime ?? 1000,
        },
  );
}

/**
 * Whether Litinski19 is selectable given the current draft — GateBased with a
 * present error rate <= 1e-3. Delegates the threshold to the contract helper.
 */
export function isLitinski19AllowedInForm(arch: ArchitectureForm): boolean {
  if (arch.type !== "gateBased" || arch.gateBased.errorRate === null) return false;
  return isLitinski19Allowed({
    type: "gateBased",
    errorRate: arch.gateBased.errorRate,
    gateTime: arch.gateBased.gateTime ?? 1,
    measurementTime: arch.gateBased.measurementTime ?? 1,
    twoQubitGateTime: arch.gateBased.twoQubitGateTime,
  });
}

/**
 * Enforce cross-field coupling the schema requires, so the UI state is never
 * internally inconsistent: Litinski19 falls back to Round-Based whenever it is
 * no longer allowed (Majorana, or GateBased error rate raised above 1e-3).
 */
export function normalizeFormState(state: FormState): FormState {
  if (
    state.magicStateFactory === "litinski19" &&
    !isLitinski19AllowedInForm(state.architecture)
  ) {
    return { ...state, magicStateFactory: "round_based" };
  }
  return state;
}
