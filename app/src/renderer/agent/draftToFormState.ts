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

function unsupportedFields(draft: GeneratedRunDraft): string[] {
  const unsupported: string[] = [];
  if (draft.architecture.type === "majorana") {
    if (draft.architecture.tErrorRate !== null)
      unsupported.push("Majorana T error rate");
    if (draft.architecture.targetYear !== null)
      unsupported.push("Majorana target year");
  }
  if (draft.architecture.type === "neutralAtom") {
    if (draft.architecture.dataQubitSpacing !== null)
      unsupported.push("data-qubit spacing");
    if (draft.architecture.targetYear !== null)
      unsupported.push("Neutral Atom target year");
  }
  if (draft.traceTransform.dynamicMemoryCompute !== null) {
    unsupported.push("Dynamic Memory Compute");
  }
  if (draft.traceTransform.unmemory) unsupported.push("Unmemory");
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
        `The proposal uses fields the current configuration form cannot edit yet: ${unsupported.join(", ")}. ` +
        "Nothing was applied. Ask for a proposal without those fields or wait for the form integration.",
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
    for (const field of BENCHMARK_HYPERPARAMS[benchmarkId]) {
      const value = draft.parameters[field.key];
      if (value !== null && value !== undefined)
        proposedParameters[field.key] = value;
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

  const architecture: FormState["architecture"] =
    draft.architecture.type === "gateBased"
      ? {
          ...initial.architecture,
          type: "gateBased",
          gateBased: {
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
              errorRate: draft.architecture.errorRate,
              operationTime: draft.architecture.operationTime,
            },
          }
        : {
            ...initial.architecture,
            type: "neutralAtom",
            neutralAtom: {
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
        traceTransform: {
          tStatesPerRotation: draft.traceTransform.tStatesPerRotation,
          ccxMagicStates: draft.traceTransform.ccxMagicStates,
          slowDownFactor: 1,
        },
        maxError: draft.maxError,
      }),
      provenance: { authoredBy: "model_assisted", model },
    },
  };
}
