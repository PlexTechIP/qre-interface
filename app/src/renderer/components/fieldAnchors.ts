/**
 * Where each form field lives in the DOM, and what the analyst calls it.
 *
 * Two surfaces now point the analyst at a control they are not looking at: the
 * validation summary ("resolve this issue") and the model-proposal summary
 * ("the model set this"). Both need the same anchor ids and the same words, and
 * the overview's warning about `configSummaryFields.ts` and `resultFields.ts`
 * is what happens when each grows its own copy — add a field to one and the
 * other never learns about it. One table, two readers.
 *
 * `FieldAnchorKey` is a superset of the validation keys, so
 * `Record<FieldAnchorKey, …>` below still forces every error key to have an
 * anchor and a label: a new `FieldErrors` member is a compile error here.
 */

import type { FieldErrors } from "../state/validation";

export type FieldAnchorKey =
  | Exclude<keyof FieldErrors, "hyperparams">
  | "runName"
  | "applicationType"
  | "architectureType"
  | "memoryOptimization"
  | "ccxMagicStates";

/**
 * Candidate element ids, in priority order. Only one architecture's fields are
 * mounted at a time, so a key that can surface under more than one (e.g.
 * `errorRate`) lists every id it could carry; the jump resolves to whichever is
 * actually in the DOM. Ids that are not simple inputs point at the block's
 * labelling element instead — good enough to scroll to, and the field takes
 * over from there.
 */
export const FIELD_ANCHORS: Record<FieldAnchorKey, readonly string[]> = {
  runName: ["run-name"],
  applicationType: ["application-type-label"],
  benchmarkId: ["select-benchmark-label"],
  savedProgram: ["saved-program-label"],
  uploadFilePath: ["upload-file"],
  numQubits: ["manual-numQubits"],
  tCount: ["manual-tCount"],
  rotationCount: ["manual-rotationCount"],
  rotationDepth: ["manual-rotationDepth"],
  cczCount: ["manual-cczCount"],
  ccixCount: ["manual-ccixCount"],
  measurementCount: ["manual-measurementCount"],
  architectureType: ["architecture-label"],
  errorRate: ["gb-error-rate", "mj-error-rate"],
  gateTime: ["gb-gate-time"],
  measurementTime: ["gb-measurement-time", "na-measurement-time"],
  twoQubitGateTime: ["gb-two-qubit-time"],
  operationTime: ["mj-operation-time"],
  rydbergTime: ["na-rydberg-time"],
  rydbergError: ["na-rydberg-error"],
  singleQubitTime: ["na-single-qubit-time"],
  singleQubitError: ["na-single-qubit-error"],
  measurementError: ["na-measurement-error"],
  handoffTime: ["na-handoff-time"],
  atomSpacing: ["na-atom-spacing"],
  maxVelocity: ["na-max-velocity"],
  maxAcceleration: ["na-max-acceleration"],
  surfaceCodeOneQubitTimeFactor: ["na-sc-one-qubit-factor"],
  surfaceCodeTwoQubitTimeFactor: ["na-sc-two-qubit-factor"],
  tErrorRate: ["mj-t-error-rate"],
  targetYear: ["mj-target-year", "na-target-year"],
  dataQubitSpacing: ["na-data-qubit-spacing"],
  tStatesPerRotation: ["micro-tstates"],
  ccxMagicStates: ["micro-ccx-label"],
  computeCapacityPercentage: ["micro-dmc-capacity"],
  memoryOptimization: ["micro-memory-opt"],
  maxError: ["micro-max-error"],
  // Primary and secondary factories are ONE control with five checkboxes — the
  // analyst never sees the split — so both point at the group's title.
  magicStateFactories: ["micro-factory-label"],
};

export const FIELD_LABELS: Record<FieldAnchorKey, string> = {
  runName: "Run name",
  applicationType: "Application Type",
  benchmarkId: "Benchmark",
  savedProgram: "Saved program",
  uploadFilePath: "Program file",
  numQubits: "Number of qubits",
  tCount: "T count",
  rotationCount: "Rotation count",
  rotationDepth: "Rotation depth",
  cczCount: "CCZ count",
  ccixCount: "CCiX count",
  measurementCount: "Measurement count",
  architectureType: "Architecture",
  errorRate: "Error rate",
  gateTime: "Gate time",
  measurementTime: "Measurement time",
  twoQubitGateTime: "Two-qubit gate time",
  operationTime: "Operation time",
  rydbergTime: "Rydberg time",
  rydbergError: "Rydberg error",
  singleQubitTime: "Single-qubit time",
  singleQubitError: "Single-qubit error",
  measurementError: "Measurement error",
  handoffTime: "Handoff time",
  atomSpacing: "Atom spacing",
  maxVelocity: "Max velocity",
  maxAcceleration: "Max acceleration",
  surfaceCodeOneQubitTimeFactor: "Surface code 1-qubit time factor",
  surfaceCodeTwoQubitTimeFactor: "Surface code 2-qubit time factor",
  tErrorRate: "T Error Rate",
  targetYear: "Target Year",
  dataQubitSpacing: "Data Qubit Spacing",
  tStatesPerRotation: "T Count Per Rotation",
  ccxMagicStates: "CCX Magic States",
  computeCapacityPercentage: "Compute Capacity Percentage",
  memoryOptimization: "Memory Optimization",
  maxError: "Total Fault Tolerant Execution Error",
  magicStateFactories: "Magic State Factory",
};

/** The id `HyperparametersPanel` renders for a benchmark parameter's input. */
export function hyperparamAnchor(key: string): string {
  return `hparam-${key}`;
}
