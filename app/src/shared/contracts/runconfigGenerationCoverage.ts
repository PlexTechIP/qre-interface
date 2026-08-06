/**
 * How every canonical RunConfig leaf participates in model generation.
 *
 * The drift test compares these lists with the canonical JSON Schema. Adding a
 * canonical field therefore requires an explicit decision: generate it, derive
 * it in the trusted app path, or exclude it for a documented product reason.
 */

export const GENERATED_CANONICAL_PATHS = [
  "name",
  "application.type",
  "application.benchmarkId",
  "application.numQubits",
  "application.tCount",
  "application.rotationCount",
  "application.rotationDepth",
  "application.cczCount",
  "application.ccixCount",
  "application.measurementCount",
  "architecture.type",
  "architecture.errorRate",
  "architecture.gateTime",
  "architecture.measurementTime",
  "architecture.twoQubitGateTime",
  "architecture.operationTime",
  "architecture.tErrorRate",
  "architecture.targetYear",
  "architecture.rydbergTime",
  "architecture.rydbergError",
  "architecture.singleQubitTime",
  "architecture.singleQubitError",
  "architecture.measurementError",
  "architecture.handoffTime",
  "architecture.atomSpacing",
  "architecture.dataQubitSpacing",
  "architecture.maxVelocity",
  "architecture.maxAcceleration",
  "architecture.surfaceCodeOneQubitTimeFactor",
  "architecture.surfaceCodeTwoQubitTimeFactor",
  "magicStateFactories",
  "secondaryFactories",
  "memoryOptimization",
  "parameters",
  "traceTransform.tStatesPerRotation",
  "traceTransform.ccxMagicStates",
  "traceTransform.slowDownFactor",
  "traceTransform.dynamicMemoryCompute.computeCapacityPercentage",
  "traceTransform.dynamicMemoryCompute.evictionStrategy",
  "traceTransform.unmemory",
  "maxError",
] as const;

export const APP_CONTROLLED_CANONICAL_PATHS = [
  "schemaVersion",
  "id",
  "createdAt",
  "qecCode",
  "provenance.authoredBy",
  "provenance.model",
  "qreVersion",
] as const;

/**
 * The analyst can still select an existing upload manually. The model cannot
 * propose a local path or generate a circuit, so uploaded-only fields stay out
 * of the natural-language generation surface.
 */
export const EXCLUDED_CANONICAL_PATHS = [
  "application.filePath",
  "application.format",
  "application.addToLibrary",
] as const;
