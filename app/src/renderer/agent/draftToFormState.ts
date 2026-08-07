import type { GeneratedRunDraft } from "../../shared/agentTypes";
import {
  BENCHMARK_IDS,
  type BenchmarkId,
  type RunProvenance,
} from "../../shared/types";
import { BENCHMARK_HYPERPARAMS } from "../constants/hyperparameters";
import type { HyperparamValues } from "../constants/hyperparameters";
import {
  createInitialFormState,
  normalizeFormState,
  type FormState,
} from "../state/formState";

export interface DraftHandoff {
  state: FormState;
  provenance: RunProvenance;
}

export type DraftMappingResult =
  { ok: true; handoff: DraftHandoff } | { ok: false; message: string };

/**
 * Fields the lowered generation schema lets the model propose but this mapping
 * does not carry into the form. A proposal touching any of them is REFUSED
 * whole rather than partially applied: silently dropping a field the analyst
 * asked for is the one failure mode a review step cannot catch, because the
 * form then looks like a complete answer to a different question.
 *
 * Team 3 landed real controls for the first six on 2026-08-07, so each is now a
 * deliberate scope line rather than a missing control — mapping them is
 * follow-up work, not a blocker. `slowDownFactor` is different and permanent:
 * the contract pins it to `const: 1`.
 */
function unsupportedFields(draft: GeneratedRunDraft): string[] {
  const unsupported: string[] = [];
  // Memory Optimization's control is DISABLED in Run Configuration
  // ("unavailable in this build"), and week 5 wired the field through to
  // `build_isa_query`, so a proposed yoked code would reach the engine via a
  // field the analyst can see and cannot change — a review step that is present
  // but powerless. The schema now pins the enum to "none", so this guard should
  // be unreachable; it stays because the model's response is not re-validated
  // against that schema on the way in, and a silently-applied yoked code is a
  // wrong estimate rather than a visible error.
  if (draft.memoryOptimization !== "none") {
    unsupported.push("Memory Optimization");
  }
  return unsupported;
}

/** Map a strict model proposal into the existing, human-editable form draft. */
export function draftToFormState(
  draft: GeneratedRunDraft,
  model: string,
): DraftMappingResult {
  const unsupported = unsupportedFields(draft);
  if (unsupported.length > 0) {
    return {
      ok: false,
      message:
        `The proposal sets fields this draft path does not carry into the form: ${unsupported.join(", ")}. ` +
        "Nothing was applied — ask for a proposal without those fields, or set them yourself in Run Configuration.",
    };
  }

  const initial = createInitialFormState();
  const proposedBenchmarkId =
    draft.application.type === "benchmark"
      ? draft.application.benchmarkId
      : null;
  if (
    proposedBenchmarkId !== null &&
    !BENCHMARK_IDS.some((id) => id === proposedBenchmarkId)
  ) {
    return { ok: false, message: "The proposal named an unknown benchmark." };
  }
  const benchmarkId =
    proposedBenchmarkId !== null ? (proposedBenchmarkId as BenchmarkId) : null;
  const proposedParameters: HyperparamValues =
    benchmarkId === null
      ? {}
      : { ...initial.application.hyperparams[benchmarkId] };
  if (benchmarkId !== null) {
    // Only the selected benchmark's keys are read, so a proposal carrying some
    // other benchmark's parameter variant contributes nothing rather than
    // wrong values — the same outcome the old all-null shape produced. The
    // boolean guard rejects the no-parameters variant's `none: true` marker,
    // which is a schema-level sentinel and never a hyperparameter value.
    for (const field of BENCHMARK_HYPERPARAMS[benchmarkId]) {
      const value = draft.parameters[field.key];
      if (value !== undefined && value !== null && typeof value !== "boolean") {
        proposedParameters[field.key] = value;
      }
    }
  }
  let application: FormState["application"];
  if (draft.application.type === "benchmark" && benchmarkId !== null) {
    application = {
      ...initial.application,
      type: "benchmark",
      benchmarkId,
      hyperparams: {
        ...initial.application.hyperparams,
        [benchmarkId]: proposedParameters,
      },
    };
  } else if (draft.application.type === "manualCounts") {
    application = {
      ...initial.application,
      type: "manualCounts",
      manualCounts: {
        numQubits: draft.application.numQubits,
        tCount: draft.application.tCount,
        rotationCount: draft.application.rotationCount,
        rotationDepth: draft.application.rotationDepth,
        cczCount: draft.application.cczCount,
        ccixCount: draft.application.ccixCount,
        measurementCount: draft.application.measurementCount,
      },
    };
  } else {
    return { ok: false, message: "The proposal named an unknown benchmark." };
  }

  // Each branch spreads the initial sub-form before overriding. The model owns
  // only the fields the lowered schema generates; anything Team 3 adds to a
  // *Form later (v1.4.0 added Majorana tErrorRate/targetYear and Neutral Atom
  // dataQubitSpacing/targetYear) has to keep its default rather than vanish —
  // replacing the object wholesale silently drops fields the form requires.
  const architecture: FormState["architecture"] =
    draft.architecture.type === "gateBased"
      ? {
          ...initial.architecture,
          type: "gateBased",
          gateBased: {
            ...initial.architecture.gateBased,
            errorRate: draft.architecture.errorRate,
            gateTime: draft.architecture.gateTime,
            measurementTime: draft.architecture.measurementTime,
            twoQubitGateTime: draft.architecture.twoQubitGateTime,
          },
        }
      : draft.architecture.type === "majorana"
        ? {
            ...initial.architecture,
            type: "majorana",
            majorana: {
              ...initial.architecture.majorana,
              errorRate: draft.architecture.errorRate,
              operationTime: draft.architecture.operationTime,
            },
          }
        : {
            ...initial.architecture,
            type: "neutralAtom",
            neutralAtom: {
              ...initial.architecture.neutralAtom,
              rydbergTime: draft.architecture.rydbergTime,
              rydbergError: draft.architecture.rydbergError,
              singleQubitTime: draft.architecture.singleQubitTime,
              singleQubitError: draft.architecture.singleQubitError,
              measurementTime: draft.architecture.measurementTime,
              measurementError: draft.architecture.measurementError,
              handoffTime: draft.architecture.handoffTime,
              atomSpacing: draft.architecture.atomSpacing,
              maxVelocity: draft.architecture.maxVelocity,
              maxAcceleration: draft.architecture.maxAcceleration,
              surfaceCodeOneQubitTimeFactor:
                draft.architecture.surfaceCodeOneQubitTimeFactor,
              surfaceCodeTwoQubitTimeFactor:
                draft.architecture.surfaceCodeTwoQubitTimeFactor,
            },
          };

  return {
    ok: true,
    handoff: {
      state: normalizeFormState({
        ...initial,
        name: draft.name ?? "",
        application,
        architecture,
        magicStateFactories: [...draft.magicStateFactories],
        secondaryFactories: [...draft.secondaryFactories],
        memoryOptimization: draft.memoryOptimization,
        // Same spread rule as the architecture branches above. Stages 0 and 3
        // keep their initial values (off) rather than being omitted: a draft
        // that proposed either was already refused by unsupportedFields, so
        // "off" is the only state that can reach here — and `dynamicMemoryCompute`
        // must be present-and-null, not absent, because validateForm reads
        // through it.
        // The pipeline stages the draft no longer carries (Dynamic Memory
        // Compute, Unmemory, the pinned slow-down factor) keep the form's
        // initial values, which is what the analyst would see having never
        // touched them.
        traceTransform: {
          ...initial.traceTransform,
          tStatesPerRotation: draft.traceTransform.tStatesPerRotation,
          ccxMagicStates: draft.traceTransform.ccxMagicStates,
        },
        maxError: draft.maxError,
      }),
      provenance: { authoredBy: "model_assisted", model },
    },
  };
}
