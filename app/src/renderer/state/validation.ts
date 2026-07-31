/**
 * Field-level (inline) validation — the "as you type" layer. Produces a
 * human-readable message per invalid field for display next to the input.
 *
 * This is intentionally a superset check of the schema's numeric bounds so the
 * user sees a friendly reason early; the schema (schemaValidation.ts) remains
 * the authority at submit time. `isConfigValid` combines both for Run gating.
 */
 
import { validateHyperparams, type HyperparamError } from "../constants/hyperparameters";
import type { FormState, ManualCountsForm, NeutralAtomForm } from "./formState";
import { schemaValidationStamp, toRunConfig } from "./toRunConfig";
import { validateRunConfigSchema } from "./schemaValidation";
 
export interface FieldErrors {
  benchmarkId?: string;
  savedProgram?: string;
  uploadFilePath?: string;
  /** Manual Logical Counts field errors, keyed by the contract field name. */
  numQubits?: string;
  tCount?: string;
  rotationCount?: string;
  rotationDepth?: string;
  cczCount?: string;
  ccixCount?: string;
  measurementCount?: string;
  errorRate?: string;
  gateTime?: string;
  measurementTime?: string;
  twoQubitGateTime?: string;
  operationTime?: string;
  /** Neutral Atom field errors, keyed by the contract field name. */
  rydbergTime?: string;
  rydbergError?: string;
  singleQubitTime?: string;
  singleQubitError?: string;
  measurementError?: string;
  handoffTime?: string;
  atomSpacing?: string;
  maxVelocity?: string;
  maxAcceleration?: string;
  surfaceCodeOneQubitTimeFactor?: string;
  surfaceCodeTwoQubitTimeFactor?: string;
  tStatesPerRotation?: string;
  maxError?: string;
  /** Per-benchmark hyperparameter errors (only present when non-empty). */
  hyperparams?: HyperparamError[];
}
 
export function validateForm(state: FormState): FieldErrors {
  const errors: FieldErrors = {};
  const { application, architecture, traceTransform, maxError } = state;
 
  if (application.type === "benchmark") {
    if (application.benchmarkId.length === 0) {
      errors.benchmarkId = "Select a benchmark to estimate.";
    }
    const hyperparamErrors = validateHyperparams(
      application.benchmarkId,
      application.hyperparams[application.benchmarkId] ?? {},
    );
    if (hyperparamErrors.length > 0) errors.hyperparams = hyperparamErrors;
  } else if (application.type === "saved") {
    const chosen = application.savedPrograms.find(
      (program) => program.id === application.selectedSavedId,
    );
    if (!chosen) errors.savedProgram = "Select a saved program to estimate.";
  } else if (application.type === "manualCounts") {
    validateManualCounts(application.manualCounts, errors);
  } else if (application.upload.filePath.trim().length === 0) {
    errors.uploadFilePath = "Choose a program file to upload.";
  }
 
  if (architecture.type === "gateBased") {
    const g = architecture.gateBased;
    if (g.errorRate === null) {
      errors.errorRate = "Enter an error rate.";
    } else if (!(g.errorRate > 0 && g.errorRate < 0.01)) {
      errors.errorRate = "Error rate must be between 0 and 0.01 (exclusive).";
    }
    if (g.gateTime === null) {
      errors.gateTime = "Gate time is required — enter a value in nanoseconds.";
    } else if (!(g.gateTime > 0)) {
      errors.gateTime = "Gate time must be greater than 0.";
    }
    if (g.measurementTime === null) {
      errors.measurementTime =
        "Measurement time is required — enter a value in nanoseconds.";
    } else if (!(g.measurementTime > 0)) {
      errors.measurementTime = "Measurement time must be greater than 0.";
    }
    if (g.twoQubitGateTime !== null && !(g.twoQubitGateTime > 0)) {
      errors.twoQubitGateTime = "Two-qubit gate time must be greater than 0.";
    }
  } else if (architecture.type === "majorana") {
    const m = architecture.majorana;
    if (m.operationTime === null) {
      errors.operationTime = "Operation time is required.";
    } else if (!(m.operationTime > 0)) {
      errors.operationTime = "Operation time must be greater than 0.";
    }
  } else {
    validateNeutralAtom(architecture.neutralAtom, errors);
  }
 
  if (traceTransform.type === "psspc") {
    const t = traceTransform.psspc.tStatesPerRotation;
    if (!(Number.isInteger(t) && t >= 5 && t <= 20)) {
      errors.tStatesPerRotation =
        "T states per rotation must be a whole number from 5 to 20.";
    }
  }
 
  if (maxError === null) {
    errors.maxError = "Enter a max error.";
  } else if (!(maxError > 0 && maxError <= 1)) {
    errors.maxError = "Max error must be between 0 and 1 (1.0 is allowed).";
  }
 
  return errors;
}
 
/** A non-negative-integer count field: required, whole number, >= `min`. */
function checkCount(
  value: number | null,
  min: number,
  label: string,
): string | undefined {
  if (value === null) return `${label} is required.`;
  if (!Number.isInteger(value)) return `${label} must be a whole number.`;
  if (value < min) return `${label} must be ${min} or greater.`;
  return undefined;
}
 
/** Assign `message` to `errors[key]` only when it is a real error (not undefined). */
function assignIf(
  errors: FieldErrors,
  key: keyof FieldErrors,
  message: string | undefined,
): void {
  if (message !== undefined) (errors as Record<string, string>)[key] = message;
}
 
/** Validate the seven Manual Logical Counts fields into `errors`. */
function validateManualCounts(m: ManualCountsForm, errors: FieldErrors): void {
  assignIf(errors, "numQubits", checkCount(m.numQubits, 1, "Number of Qubits"));
  assignIf(errors, "tCount", checkCount(m.tCount, 0, "T Count"));
  assignIf(errors, "rotationCount", checkCount(m.rotationCount, 0, "Rotation Count"));
  assignIf(errors, "cczCount", checkCount(m.cczCount, 0, "CCZ Count"));
  assignIf(errors, "ccixCount", checkCount(m.ccixCount, 0, "CCiX Count"));
  assignIf(errors, "measurementCount", checkCount(m.measurementCount, 0, "Measurement Count"));
 
  // Rotation Depth is a non-negative integer additionally bounded by Rotation
  // Count (a rotation cannot have more depth than there are rotations).
  const depthBase = checkCount(m.rotationDepth, 0, "Rotation Depth");
  if (depthBase !== undefined) {
    errors.rotationDepth = depthBase;
  } else if (
    m.rotationCount !== null &&
    m.rotationDepth !== null &&
    m.rotationDepth > m.rotationCount
  ) {
    errors.rotationDepth = "Rotation Depth cannot exceed Rotation Count.";
  }
}
 
/**
 * Validate the twelve Neutral Atom fields into `errors`. Ranges follow the QPU
 * Specification tab: times are integers > 0 (handoff >= 0), the three error
 * rates fall in [0, 0.01), spacing/velocity/acceleration are > 0, and the two
 * Surface Code time factors are integers >= 1.
 */
function validateNeutralAtom(n: NeutralAtomForm, errors: FieldErrors): void {
  const posInt = (v: number, label: string): string | undefined => {
    if (!Number.isInteger(v)) return `${label} must be a whole number.`;
    if (!(v > 0)) return `${label} must be greater than 0.`;
    return undefined;
  };
  const errorRate = (v: number, label: string): string | undefined =>
    v >= 0 && v < 0.01 ? undefined : `${label} must be between 0 and 0.01 (exclusive upper).`;
  const positive = (v: number, label: string): string | undefined =>
    v > 0 ? undefined : `${label} must be greater than 0.`;
  const factor = (v: number, label: string): string | undefined => {
    if (!Number.isInteger(v)) return `${label} must be a whole number.`;
    if (!(v >= 1)) return `${label} must be 1 or greater.`;
    return undefined;
  };
 
  assignIf(errors, "rydbergTime", posInt(n.rydbergTime, "Rydberg Time"));
  assignIf(errors, "rydbergError", errorRate(n.rydbergError, "Rydberg Error"));
  assignIf(errors, "singleQubitTime", posInt(n.singleQubitTime, "Single-Qubit Time"));
  assignIf(errors, "singleQubitError", errorRate(n.singleQubitError, "Single-Qubit Error"));
  assignIf(errors, "measurementTime", posInt(n.measurementTime, "Measurement Time"));
  assignIf(errors, "measurementError", errorRate(n.measurementError, "Measurement Error"));
  if (!Number.isInteger(n.handoffTime) || n.handoffTime < 0) {
    errors.handoffTime = "Handoff Time must be a whole number of 0 or greater.";
  }
  assignIf(errors, "atomSpacing", positive(n.atomSpacing, "Atom Spacing"));
  assignIf(errors, "maxVelocity", positive(n.maxVelocity, "Max Velocity"));
  assignIf(errors, "maxAcceleration", positive(n.maxAcceleration, "Max Acceleration"));
  assignIf(errors, "surfaceCodeOneQubitTimeFactor", factor(n.surfaceCodeOneQubitTimeFactor, "Surface Code 1-Qubit Time Factor"));
  assignIf(errors, "surfaceCodeTwoQubitTimeFactor", factor(n.surfaceCodeTwoQubitTimeFactor, "Surface Code 2-Qubit Time Factor"));
}
 
export function hasFieldErrors(errors: FieldErrors): boolean {
  return Object.keys(errors).length > 0;
}
 
/**
 * Run gating: valid only when there are no inline field errors AND the
 * serialized config passes the committed JSON Schema. Uses a placeholder stamp
 * because id/createdAt don't exist until Run-click and don't affect validity.
 */
export function isConfigValid(state: FormState): boolean {
  if (hasFieldErrors(validateForm(state))) return false;
  const config = toRunConfig(state, schemaValidationStamp());
  if (config === null) return false;
  return validateRunConfigSchema(config).valid;
}