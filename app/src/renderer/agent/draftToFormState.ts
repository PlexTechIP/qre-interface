import type { GeneratedRunDraft } from "../../shared/agentTypes";
import {
  BENCHMARK_IDS,
  type BenchmarkId,
  type MagicStateFactoryId,
  type RunProvenance,
  type SecondaryFactoryId,
} from "../../shared/types";
import {
  FIELD_ANCHORS,
  FIELD_LABELS,
  hyperparamAnchor,
  type FieldAnchorKey,
} from "../components/fieldAnchors";
import { BENCHMARK_HYPERPARAMS } from "../constants/hyperparameters";
import type { HyperparamValues } from "../constants/hyperparameters";
import {
  ARCHITECTURE_LABELS,
  MAGIC_STATE_FACTORY_LABELS,
  MEMORY_OPTIMIZATION_LABELS,
  SECONDARY_FACTORY_LABELS,
} from "../constants/labels";
import { findBenchmark } from "../constants/staticOptions";
import {
  createInitialFormState,
  normalizeFormState,
  type FormState,
} from "../state/formState";

/**
 * One value the model actually chose, ready to list next to the form.
 *
 * Carries its own anchors rather than a key the panel resolves, because the
 * benchmark hyperparameters are not in `FieldAnchorKey` — their controls are
 * generated per benchmark. One shape keeps the panel a plain presenter.
 */
export interface ProposedField {
  /** Candidate element ids for the jump affordance. */
  anchors: readonly string[];
  /** The analyst-facing label, in the control's own words. */
  label: string;
  /** The model's choice, formatted the way the form shows it. */
  value: string;
}

export interface DraftHandoff {
  state: FormState;
  provenance: RunProvenance;
  /**
   * Exactly the values the model chose. Everything else in `state` is a form
   * default the model never mentioned.
   *
   * This is REPORTED by the mapping below as it writes each field, not derived
   * by diffing `state` against `createInitialFormState()`. A diff cannot tell
   * "the model asked for 20 T states per rotation" from "the model said nothing
   * and 20 is the default" — the two produce identical state — so it would
   * quietly drop the model's deliberate choices whenever they happen to agree
   * with a default, which is most of them.
   */
  proposed: readonly ProposedField[];
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

/**
 * Collects what the model chose, in form order, as the mapping writes it.
 *
 * The rule for "chose" is not "differs from the default" — see `proposed` on
 * `DraftHandoff`. It is "expressed an opinion": a `null` in a required-nullable
 * field is the generation schema's way of saying *no opinion*, and an empty
 * factory set is replaced by the form's own default below, so neither is the
 * model's decision and neither may be shown as one. A chosen value that happens
 * to equal the default IS listed.
 */
class ProposalLog {
  private readonly fields: ProposedField[] = [];

  /** Record a value the model chose, under the form control that now holds it. */
  add(key: FieldAnchorKey, value: string): void {
    this.fields.push({
      anchors: FIELD_ANCHORS[key],
      label: FIELD_LABELS[key],
      value,
    });
  }

  /** Same, for a benchmark parameter — its control is generated per benchmark. */
  addHyperparam(key: string, label: string, value: string): void {
    this.fields.push({ anchors: [hyperparamAnchor(key)], label, value });
  }

  /** Skip `null`/`undefined` — the schema's "no opinion", not a choice. */
  addOptional(key: FieldAnchorKey, value: number | string | null | undefined): void {
    if (value === null || value === undefined) return;
    this.add(key, String(value));
  }

  list(): readonly ProposedField[] {
    return this.fields;
  }
}

/**
 * Log the chosen architecture and the fields that variant carries. Written as a
 * switch over the same discriminant the mapping uses, so a fourth architecture
 * cannot be mapped and left undescribed.
 */
function logArchitecture(
  log: ProposalLog,
  architecture: GeneratedRunDraft["architecture"],
): void {
  log.add("architectureType", ARCHITECTURE_LABELS[architecture.type]);
  if (architecture.type === "gateBased") {
    log.add("errorRate", String(architecture.errorRate));
    log.add("gateTime", String(architecture.gateTime));
    log.add("measurementTime", String(architecture.measurementTime));
    log.addOptional("twoQubitGateTime", architecture.twoQubitGateTime);
    return;
  }
  if (architecture.type === "majorana") {
    log.add("errorRate", String(architecture.errorRate));
    log.add("operationTime", String(architecture.operationTime));
    return;
  }
  log.add("rydbergTime", String(architecture.rydbergTime));
  log.add("rydbergError", String(architecture.rydbergError));
  log.add("singleQubitTime", String(architecture.singleQubitTime));
  log.add("singleQubitError", String(architecture.singleQubitError));
  log.add("measurementTime", String(architecture.measurementTime));
  log.add("measurementError", String(architecture.measurementError));
  log.add("handoffTime", String(architecture.handoffTime));
  log.add("atomSpacing", String(architecture.atomSpacing));
  log.add("maxVelocity", String(architecture.maxVelocity));
  log.add("maxAcceleration", String(architecture.maxAcceleration));
  log.add(
    "surfaceCodeOneQubitTimeFactor",
    String(architecture.surfaceCodeOneQubitTimeFactor),
  );
  log.add(
    "surfaceCodeTwoQubitTimeFactor",
    String(architecture.surfaceCodeTwoQubitTimeFactor),
  );
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
  const log = new ProposalLog();
  log.addOptional("runName", draft.name);
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
  // Logged here rather than in the branch below so the list reads in form
  // order: type, then benchmark, then that benchmark's parameters.
  log.add(
    "applicationType",
    benchmarkId !== null ? "Benchmark" : "Manual Logical Counts",
  );
  if (benchmarkId !== null) {
    log.add("benchmarkId", findBenchmark(benchmarkId)?.name ?? benchmarkId);
    // Only the selected benchmark's keys are read, so a proposal carrying some
    // other benchmark's parameter variant contributes nothing rather than
    // wrong values — the same outcome the old all-null shape produced. The
    // boolean guard rejects the no-parameters variant's `none: true` marker,
    // which is a schema-level sentinel and never a hyperparameter value.
    for (const field of BENCHMARK_HYPERPARAMS[benchmarkId]) {
      const value = draft.parameters[field.key];
      if (value !== undefined && value !== null && typeof value !== "boolean") {
        proposedParameters[field.key] = value;
        log.addHyperparam(field.key, field.label, String(value));
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
    const counts = draft.application;
    application = {
      ...initial.application,
      type: "manualCounts",
      manualCounts: {
        numQubits: counts.numQubits,
        tCount: counts.tCount,
        rotationCount: counts.rotationCount,
        rotationDepth: counts.rotationDepth,
        cczCount: counts.cczCount,
        ccixCount: counts.ccixCount,
        measurementCount: counts.measurementCount,
      },
    };
    log.add("numQubits", String(counts.numQubits));
    log.add("tCount", String(counts.tCount));
    log.add("rotationCount", String(counts.rotationCount));
    log.add("rotationDepth", String(counts.rotationDepth));
    log.add("cczCount", String(counts.cczCount));
    log.add("ccixCount", String(counts.ccixCount));
    log.add("measurementCount", String(counts.measurementCount));
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
  logArchitecture(log, draft.architecture);

  // One control holds both factory sets — the analyst never sees the primary /
  // secondary split — so they report as one line. An empty primary set is the
  // form's round_based default below rather than the model's pick, so it is
  // logged only when the model named something.
  const namedFactories = [
    ...draft.magicStateFactories.map(
      (id: MagicStateFactoryId) => MAGIC_STATE_FACTORY_LABELS[id],
    ),
    ...draft.secondaryFactories.map(
      (id: SecondaryFactoryId) => SECONDARY_FACTORY_LABELS[id],
    ),
  ];
  if (namedFactories.length > 0) {
    log.add("magicStateFactories", namedFactories.join(", "));
  }
  // Reachable only in principle: the generation schema pins this to "none" and
  // `unsupportedFields` refuses anything else. Logged for the same reason the
  // guard exists — the model's reply is not re-validated against that schema.
  if (draft.memoryOptimization !== "none") {
    log.add(
      "memoryOptimization",
      MEMORY_OPTIMIZATION_LABELS[draft.memoryOptimization],
    );
  }
  log.add("tStatesPerRotation", String(draft.traceTransform.tStatesPerRotation));
  log.add("ccxMagicStates", draft.traceTransform.ccxMagicStates ? "On" : "Off");
  log.add("maxError", String(draft.maxError));

  return {
    ok: true,
    handoff: {
      state: normalizeFormState({
        ...initial,
        name: draft.name ?? "",
        application,
        architecture,
        // An empty set is schema-valid model output but must not land the form
        // on nothing-checked: a machine draft gets the round_based default,
        // whereas a person emptying the checkbox group in the form is left empty
        // on purpose (that path shows the validation error instead).
        magicStateFactories:
          draft.magicStateFactories.length > 0
            ? [...draft.magicStateFactories]
            : ["round_based"],
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
      proposed: log.list(),
    },
  };
}
