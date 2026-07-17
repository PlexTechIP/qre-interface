/**
 * Field-level (inline) validation — the "as you type" layer. Produces a
 * human-readable message per invalid field for display next to the input.
 *
 * This is intentionally a superset check of the schema's numeric bounds so the
 * user sees a friendly reason early; the schema (schemaValidation.ts) remains
 * the authority at submit time. `isConfigValid` combines both for Run gating.
 */

import type { FormState } from "./formState";
import { schemaValidationStamp, toRunConfig } from "./toRunConfig";
import { validateRunConfigSchema } from "./schemaValidation";

export interface FieldErrors {
  benchmarkId?: string;
  uploadFilePath?: string;
  errorRate?: string;
  gateTime?: string;
  measurementTime?: string;
  twoQubitGateTime?: string;
  operationTime?: string;
  tStatesPerRotation?: string;
  maxError?: string;
}

export function validateForm(state: FormState): FieldErrors {
  const errors: FieldErrors = {};
  const { application, architecture, traceTransform, maxError } = state;

  if (application.type === "benchmark") {
    if (application.benchmarkId.length === 0) {
      errors.benchmarkId = "Select a benchmark to estimate.";
    }
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
  } else {
    const m = architecture.majorana;
    if (m.operationTime === null) {
      errors.operationTime = "Operation time is required.";
    } else if (!(m.operationTime > 0)) {
      errors.operationTime = "Operation time must be greater than 0.";
    }
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
