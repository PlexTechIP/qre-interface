/**
 * Data projections for MCP tool outputs.
 *
 * Converts RunRecord and FormState into MCP-safe types with bounded,
 * properly-escaped user-authored text and no sensitive internal fields.
 */

import { boundedText } from "./toolResult.js";
import type {
  RunRecord,
  RunSummary,
  RunSummaryApplication,
  FrontierRow,
  RunError,
  ArchitectureType,
} from "../shared/types.js";
import type { FormState } from "../renderer/state/formState.js";
import type { GeneratedRunDraft } from "../shared/agentTypes.js";

/**
 * RunDetail — a fuller view of a run than RunSummary, but still with `raw`
 * excluded to avoid unbounded context flood.
 */
export interface RunDetail {
  id: string;
  name: string;
  createdAt: string;
  savedAt: string;
  startedAt: string;
  completedAt: string;
  status: "succeeded" | "failed";
  error: RunError | null;
  architecture: ArchitectureType;
  application: RunSummaryApplication;
  qreVersion: string;
  /** One representative frontier row (index 0, if available). */
  frontierSample: FrontierRow | null;
  /** Number of frontier rows in the result (null if failed). */
  frontierRowCount: number | null;
}

/**
 * Project a RunRecord into a RunSummary — a bounded view safe for agent context.
 *
 * - Caps run name to 200 Unicode code points and escapes control characters
 * - Excludes full config, result.raw, full frontier, and all other internal fields
 * - Returns only the 6 key fields for agent understanding
 */
export function toRunSummary(record: RunRecord): RunSummary {
  const application = buildRunSummaryApplication(record.config.application);

  return {
    id: record.id,
    name: boundedText(record.config.name, 200),
    createdAt: record.config.createdAt,
    savedAt: record.savedAt,
    status: record.result.status,
    architecture: record.config.architecture.type,
    application,
  };
}

/**
 * Project a RunRecord into a RunDetail — a fuller view but still bounded.
 *
 * - Includes config/result metadata but excludes result.raw entirely
 * - Caps name and escapes error messages (user and engine text)
 * - Returns a frontier sample (one row) and a count, not the full frontier
 * - Returns error details capped and escaped, with no stack trace or path
 */
export function toRunDetail(record: RunRecord): RunDetail {

  const application = buildRunSummaryApplication(record.config.application);

  // Get a sample frontier row and count
  const frontier = record.result.frontier;
  const frontierRowCount = frontier ? frontier.length : null;
  const frontierSample = frontier && frontier.length > 0 ? frontier[0] ?? null : null;

  // Escape error message if present
  let error = record.result.error;
  if (error !== null) {
    error = {
      code: error.code,
      // Engine failures carry up to 2000 characters of Python stderr, so this
      // is the field that most needs path redaction, not just capping.
      message: boundedText(error.message, 1000),
    };
  }

  return {
    id: record.id,
    name: boundedText(record.config.name, 200),
    createdAt: record.config.createdAt,
    savedAt: record.savedAt,
    startedAt: record.result.startedAt,
    completedAt: record.result.completedAt,
    status: record.result.status,
    error,
    architecture: record.config.architecture.type,
    application,
    qreVersion: record.result.qreVersion,
    frontierSample,
    frontierRowCount,
  };
}

/**
 * Build the MCP-safe RunSummaryApplication from a RunConfig's application.
 * Deliberately omits filePath for uploaded applications (data-egress risk).
 */
function buildRunSummaryApplication(
  application: RunRecord["config"]["application"],
): RunSummaryApplication {
  switch (application.type) {
    case "benchmark":
      return {
        type: "benchmark",
        benchmarkId: application.benchmarkId,
      };
    case "uploaded":
      return {
        type: "uploaded",
        format: application.format,
      };
    case "manualCounts":
      return {
        type: "manualCounts",
      };
  }
}

/**
 * Convert a FormState into a GeneratedRunDraft.
 *
 * This is a discriminated helper: it either returns a valid draft
 * or throws a structured error naming the unsupported field.
 *
 * Refusals (throws):
 * - Uploaded-application form (no file path in GeneratedApplication)
 * - Majorana-specific optional fields (tErrorRate, targetYear)
 * - Neutral Atom-specific optional fields (dataQubitSpacing, targetYear)
 * - Non-default dynamicMemoryCompute settings
 * - Non-default unmemory settings
 * - Non-PSSPC eviction strategy or other trace transform stages not in GeneratedTraceTransform
 */
export function generatedDraftFromFormState(state: FormState): GeneratedRunDraft {
  // Reject uploaded applications
  if (state.application.type === "uploaded") {
    throw new Error(
      "Cannot draft from a form with an uploaded application. File paths cannot be represented in a generated draft.",
    );
  }

  // Build the application discriminator
  let application: GeneratedRunDraft["application"];
  if (state.application.type === "benchmark") {
    application = {
      type: "benchmark",
      benchmarkId: state.application.benchmarkId,
    };
  } else if (state.application.type === "manualCounts") {
    const mc = state.application.manualCounts;
    // All fields are required for ManualCountsApplication
    if (
      mc.numQubits === null ||
      mc.tCount === null ||
      mc.rotationCount === null ||
      mc.rotationDepth === null ||
      mc.cczCount === null ||
      mc.ccixCount === null ||
      mc.measurementCount === null
    ) {
      throw new Error(
        "Cannot draft from manual counts with incomplete fields.",
      );
    }
    application = {
      type: "manualCounts",
      numQubits: mc.numQubits,
      tCount: mc.tCount,
      rotationCount: mc.rotationCount,
      rotationDepth: mc.rotationDepth,
      cczCount: mc.cczCount,
      ccixCount: mc.ccixCount,
      measurementCount: mc.measurementCount,
    };
  } else {
    throw new Error(`Unknown application type in FormState`);
  }

  // Build the architecture, checking for unsupported optional fields
  const arch = state.architecture;
  const archType = arch.type;

  let architecture: GeneratedRunDraft["architecture"];

  if (archType === "gateBased") {
    const form = arch.gateBased;
    architecture = {
      type: "gateBased",
      errorRate: form.errorRate ?? 0.0001,
      gateTime: form.gateTime ?? 50,
      measurementTime: form.measurementTime ?? 100,
      twoQubitGateTime: form.twoQubitGateTime,
    };
  } else if (archType === "majorana") {
    const form = arch.majorana;
    // Reject if the form has set tErrorRate or targetYear
    if (form.tErrorRate !== null || form.targetYear !== null) {
      throw new Error(
        "Majorana-specific optional fields (tErrorRate, targetYear) cannot be represented in a generated draft.",
      );
    }
    architecture = {
      type: "majorana",
      errorRate: form.errorRate,
      operationTime: form.operationTime ?? 1000,
    };
  } else if (archType === "neutralAtom") {
    const form = arch.neutralAtom;
    // Reject if the form has set dataQubitSpacing or targetYear
    if (form.dataQubitSpacing !== null || form.targetYear !== null) {
      throw new Error(
        "Neutral Atom-specific optional fields (dataQubitSpacing, targetYear) cannot be represented in a generated draft.",
      );
    }
    architecture = {
      type: "neutralAtom",
      rydbergTime: form.rydbergTime,
      rydbergError: form.rydbergError,
      singleQubitTime: form.singleQubitTime,
      singleQubitError: form.singleQubitError,
      measurementTime: form.measurementTime,
      measurementError: form.measurementError,
      handoffTime: form.handoffTime,
      atomSpacing: form.atomSpacing,
      maxVelocity: form.maxVelocity,
      maxAcceleration: form.maxAcceleration,
      surfaceCodeOneQubitTimeFactor: form.surfaceCodeOneQubitTimeFactor,
      surfaceCodeTwoQubitTimeFactor: form.surfaceCodeTwoQubitTimeFactor,
    };
  } else {
    // TypeScript exhaustiveness check
    const _: never = archType;
    throw new Error(`Unknown architecture type: ${_}`);
  }

  // Check trace transform for unsupported stages
  const tt = state.traceTransform;
  if (tt.dynamicMemoryCompute !== null) {
    throw new Error(
      "DynamicMemoryCompute trace transform stage cannot be represented in a generated draft.",
    );
  }
  if (tt.unmemory) {
    throw new Error(
      "Unmemory trace transform stage cannot be represented in a generated draft.",
    );
  }

  const traceTransform: GeneratedRunDraft["traceTransform"] = {
    tStatesPerRotation: tt.tStatesPerRotation,
    ccxMagicStates: tt.ccxMagicStates,
  };

  // Extract hyperparameters for the selected benchmark (empty for manualCounts)
  // Filter out null values to match GeneratedBenchmarkParameters type
  const parameters: GeneratedRunDraft["parameters"] =
    state.application.type === "benchmark"
      ? Object.fromEntries(
          Object.entries(
            state.application.hyperparams[state.application.benchmarkId] || {},
          )
            .filter(
              ([, v]) =>
                v !== null && v !== undefined && v !== "",
            )
            .map(([k, v]) => [k, v as string | number | boolean]),
        )
      : {};

  return {
    name: state.name || null,
    application,
    architecture,
    magicStateFactories: state.magicStateFactories,
    secondaryFactories: state.secondaryFactories,
    memoryOptimization: state.memoryOptimization,
    traceTransform,
    maxError: state.maxError ?? 1.0,
    parameters,
  };
}
