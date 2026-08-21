/**
 * A run form, lowered to a generated draft.
 *
 * Design follow-up F-5: the parts that own these adapters "must reuse one
 * shared projection rather than implementing two subtly different draft
 * shapes". This used to live inside `src/mcp/projections.ts`, where only the
 * MCP server could reach it, so the next caller needing it would have written a
 * second one. It sits beside `formState.ts` now, because that is where the
 * form's own rules live.
 *
 * The opposite direction is deliberately NOT here: see
 * `generatedDraftToForm.ts` for why keeping them apart matters.
 */

import type { FormState } from "./formState.js";
import type { GeneratedRunDraft } from "../../shared/agentTypes.js";

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

  // The contract models `parameters` as one variant per benchmark plus a `none`
  // variant, and every variant is `additionalProperties: false` with required
  // keys. An empty object matches NONE of them, so a manual-counts run has to
  // say `{ none: true }` rather than say nothing — that sentinel is what the
  // "no parameters" variant is for.
  const parameters: GeneratedRunDraft["parameters"] =
    state.application.type === "benchmark"
      ? Object.fromEntries(
          Object.entries(
            state.application.hyperparams[state.application.benchmarkId] || {},
          )
            .filter(([, v]) => v !== null && v !== undefined && v !== "")
            .map(([k, v]) => [k, v as string | number | boolean]),
        )
      : { none: true };

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
