/**
 * "Would this draft run?", answered once for the two tools that ask it.
 *
 * `qre_validate_config` asks so it can report; `qre_run_estimate` asks so it can
 * refuse before spawning anything. Those must be the SAME answer — a run tool
 * that accepts a draft the validator calls invalid is worse than either tool
 * alone, because an agent then has a checked draft and a surprise. So the walk
 * lives here and both tools call it.
 *
 * It walks the seam the Run button walks:
 *
 *   committed generation schema -> the one draft adapter -> normalizeFormState
 *   -> validateForm -> toRunConfig -> validateRunConfigSchema
 *
 * Every architecture, factory and hyperparameter rule stays where the app keeps
 * it. Where this file names a rule it does so by CALLING the app's own
 * predicate or reading the app's own table, never by restating the rule — a
 * copy is what makes a validator that disagrees with the thing it validates
 * for.
 *
 * The order below is the load-bearing part, and it comes from team 2's
 * implementation of this tool (#32): the coupling checks run against what the
 * caller ASKED FOR, before the adapters repair it, because a repair erases the
 * evidence. The chat path wants that repair — an analyst then edits a working
 * form — and this path must not have it, or an agent asking "would this run?"
 * is told yes about a different run.
 *
 * The round trip at the end is a BACKSTOP, not the primary check. The named
 * checks above it produce messages that say what is wrong; the round trip only
 * catches a substitution nobody has enumerated yet, and describes it
 * generically. Measured against a battery of drafts it currently catches
 * nothing the named checks miss, which is the point — it exists for the repair
 * the adapters learn next.
 *
 * Nothing here is persisted and nothing here runs: no run store is opened, no
 * record is written, and the `runConfig` it returns carries a placeholder
 * identity stamp. Minting a real `id`/`createdAt` is the caller's act, and
 * `qre_run_estimate` is the only caller that does it.
 */

import { boundedText } from "../toolResult.js";
import { validateGeneratedDraft } from "../../main/draftValidation.js";
import { formStateFromGeneratedDraft } from "../../renderer/state/generatedDraftToForm.js";
import { generatedDraftFromFormState } from "../../renderer/state/generatedDraft.js";
import {
  isPrimaryFactoryAllowed,
  isSecondaryFactoryAllowed,
  normalizeFormState,
  type FormState,
} from "../../renderer/state/formState.js";
import { validateForm, type FormValidation } from "../../renderer/state/validation.js";
import { BENCHMARK_HYPERPARAMS } from "../../renderer/constants/hyperparameters.js";
import { schemaValidationStamp, toRunConfig } from "../../renderer/state/toRunConfig.js";
import { validateRunConfigSchema } from "../../renderer/state/schemaValidation.js";
import type { BenchmarkId, RunConfig, RunProvenance } from "../../shared/types.js";
import type { GeneratedRunDraft } from "../../shared/agentTypes.js";

/** Which stage of the seam rejected the draft. */
export type ValidationSource = "structure" | "coupling" | "form" | "schema";

export interface ValidationErrorItem {
  field: string;
  source: ValidationSource;
  message: string;
}

/**
 * Which step of the walk produced the FIRST complaint.
 *
 * Distinct from an item's `source`, which names the kind of rule that spoke:
 * the round-trip backstop reports items with `source: "coupling"` (it is a
 * substitution, and that is how the app talks about one) while the stage is
 * `"unexplained"`, because knowing the backstop was what fired is what tells a
 * reader that no named check covered it.
 */
export type PreparedDraftStage =
  | "size"
  | "structure"
  | "coupling"
  | "form"
  | "schema"
  | "unexplained";

export type PreparedDraft =
  | {
      ok: true;
      draft: GeneratedRunDraft;
      normalized: FormState;
      runConfig: RunConfig;
      errors: [];
    }
  | { ok: false; errors: ValidationErrorItem[]; stage: PreparedDraftStage };

const MAX_ERRORS = 50;
const MAX_MESSAGE = 500;
/**
 * A structural failure gets more room, because it is ONE item that enumerates
 * a contract rather than one complaint about one field.
 *
 * `validateGeneratedDraft` reports up to five failures and spells out the
 * values each allows — the `parameters` variant listing alone is ~330
 * characters — so a draft with several problems produced a 598-character
 * reason that the 500 cap cut with an ellipsis, losing two of the six variants
 * the caller then had to choose between. The reason is budgeted at its source
 * to stay under this, so nothing is truncated on the way out.
 */
const MAX_STRUCTURE_MESSAGE = 1200;
/** Each side of a "you asked for X, it would run as Y" message. */
const MAX_REPAIR_VALUE = 160;
/**
 * How much draft this tool will read.
 *
 * A real draft serialises to a couple of kilobytes; the largest the contract
 * can express is a neutral-atom architecture, still a fraction of this. The
 * gate is here so that the schema walk, the form adapters, and the round trip
 * are never asked to prove it the slow way — it is a bound on WORK, which is
 * why `name` does not count towards it (see `measureDraft`).
 */
const MAX_DRAFT_CHARS = 32 * 1024;

/**
 * Bound the list itself. Escaping and path redaction happen below, in
 * `toolSuccess`, so this only has to decide how much to say.
 */
export function boundErrors(errors: ValidationErrorItem[]): ValidationErrorItem[] {
  return errors.slice(0, MAX_ERRORS).map((error) => ({
    ...error,
    message: boundedText(
      error.message,
      error.source === "structure" ? MAX_STRUCTURE_MESSAGE : MAX_MESSAGE,
    ),
  }));
}

/** A single structural complaint, unbounded — bounding stays the caller's job. */
function structuralFailure(
  message: string,
  stage: PreparedDraftStage = "structure",
): PreparedDraft {
  return {
    ok: false,
    stage,
    errors: [{ field: "draft", source: "structure", message }],
  };
}

type DraftMeasurement =
  | { readonly kind: "measured"; readonly chars: number }
  | { readonly kind: "unreadable" };

/**
 * How big the draft is, for the purpose of refusing to work on it.
 *
 * Two things this must not do, both learned the hard way.
 *
 * It must not count `name`. `name` is the one field no schema bounds — the
 * generation contract says `string | null`, `RunConfig` sets only
 * `minLength: 1`, the form's input has no `maxLength` — so a run saved with a
 * 33,000-character name produced a draft from `qre_draft_from_run` that this
 * tool then refused as "not a draft", contradicting its own description. A
 * long string is also the cheapest thing here to validate, so it is not what
 * the gate is defending against.
 *
 * And it must not throw. `JSON.stringify` recurses, so a value nested about
 * ten thousand deep overflows the stack — while `JSON.parse` on the way in
 * accepts it happily and zod's loose object does not look inside. That turned a
 * draft the contract would have rejected with "name must be string or null"
 * into an `isError` VALIDATION_FAILED, which is exactly what this tool
 * promises never to do with a bad draft.
 */
function measureDraft(draft: unknown): DraftMeasurement {
  const measurable =
    typeof draft === "object" && draft !== null && !Array.isArray(draft)
      ? { ...(draft as Record<string, unknown>), name: undefined }
      : draft;

  try {
    const serialized = JSON.stringify(measurable);
    return {
      kind: "measured",
      chars: typeof serialized === "string" ? serialized.length : 0,
    };
  } catch {
    return { kind: "unreadable" };
  }
}

/**
 * The form as the caller described it, before the adapter repaired it.
 *
 * `formStateFromGeneratedDraft` drops a factory the architecture forbids and
 * falls back to `["round_based"]` rather than leaving the set empty. That is
 * right for the chat path and wrong here, and it happens on the way IN — so by
 * the time `validateForm` runs, the form no longer has anything to complain
 * about. Putting the two factory sets back is what lets the app's own checks
 * see what was actually asked for, rather than this file re-deciding what they
 * would have said.
 */
function asAsked(draft: GeneratedRunDraft, state: FormState): FormState {
  return {
    ...state,
    magicStateFactories: draft.magicStateFactories,
    secondaryFactories: draft.secondaryFactories,
  };
}

/**
 * The couplings a repair would hide, each answered by the app's own rule.
 *
 * Every branch here either calls a predicate the form calls
 * (`isPrimaryFactoryAllowed`, `isSecondaryFactoryAllowed`) or reads the table
 * the form reads (`BENCHMARK_HYPERPARAMS`), so there is no second statement of
 * a rule to drift. The messages are the ones the app would give.
 */
function couplingErrors(
  draft: GeneratedRunDraft,
  asked: FormState,
): ValidationErrorItem[] {
  const errors: ValidationErrorItem[] = [];

  for (const factory of draft.magicStateFactories) {
    if (!isPrimaryFactoryAllowed(factory, asked.architecture)) {
      errors.push({
        field: "magicStateFactories",
        source: "coupling",
        message: `${factory} is not available on this architecture.`,
      });
    }
  }

  for (const factory of draft.secondaryFactories) {
    if (!isSecondaryFactoryAllowed(factory, asked.architecture.type)) {
      errors.push({
        field: "secondaryFactories",
        source: "coupling",
        message: `${factory} is not available on this architecture.`,
      });
    }
  }

  // An empty set is a repair too — the normaliser fills it — and the form
  // already has the message for it, naming the options. Asking `validateForm`
  // for that one field beats writing a second copy of the sentence.
  if (draft.magicStateFactories.length === 0) {
    const message = validateForm(asked).fields.magicStateFactories;
    if (message) {
      errors.push({ field: "magicStateFactories", source: "coupling", message });
    }
  }

  // Hyperparameters that belong to a DIFFERENT benchmark. The generation
  // schema models `parameters` as one variant per benchmark, so a
  // quantum-dynamics parameter set is structurally valid — it is just not this
  // benchmark's, and the adapter answers by substituting this benchmark's
  // defaults. Saying which key does not belong beats saying that something was
  // replaced.
  if (draft.application.type === "benchmark") {
    const benchmarkId = draft.application.benchmarkId;
    const declared = new Set(
      (BENCHMARK_HYPERPARAMS[benchmarkId as BenchmarkId] ?? []).map(
        (field) => field.key,
      ),
    );
    for (const key of Object.keys(draft.parameters)) {
      if (!declared.has(key)) {
        errors.push({
          field: "parameters",
          source: "coupling",
          message: `${key} is not a parameter of the ${benchmarkId} benchmark.`,
        });
      }
    }
  }

  return errors;
}

/**
 * Fold values the contract itself calls equivalent, before comparing them.
 *
 * The round trip compares written forms, so it reports any difference in
 * spelling as a substitution. One difference is not one: `name` is documented in
 * the generation schema as "Use null to let the app generate one", and
 * `RunConfig.name` as "auto-derived and serialized when the user leaves it
 * blank" — so `""` and `null` are the same request, and the adapter's
 * `state.name || null` is spelling, not a repair. Without this fold, a draft
 * with an empty name was answered `valid: false` with "The run would use null
 * instead of """ for a configuration the app runs happily.
 *
 * This is deliberately a short list and should stay one. An entry here asserts
 * that two spellings mean the same thing TO THE CONTRACT; anything else that
 * differs is a substitution and must keep being reported.
 */
function canonical(field: string, value: unknown): unknown {
  if (field === "name" && value === "") return null;
  return value;
}

/**
 * The backstop: anything the pipeline changed that nothing above named.
 *
 * Lowering the normalised form back through `generatedDraftFromFormState` — the
 * same projection `qre_draft_from_run` returns — gives what the caller would
 * actually get, and a field that differs is one they did not ask for. It states
 * no rules, so it keeps working when the adapters learn one nobody has written
 * a check for.
 *
 * `reported` is what the named checks already covered, so a field they
 * explained is not explained again, worse.
 *
 * The round trip is stable: every run in a real history that can be drafted at
 * all round-trips byte-identically, so a difference here is a real substitution
 * and not an artefact of a default being filled in.
 *
 * Exported because it is the only part of the walk no draft currently reaches —
 * the named checks above catch everything today, which is exactly why it has to
 * be exercised directly rather than through a fixture that would quietly stop
 * testing it the moment a named check learned the same case.
 */
export function unexplainedChanges(
  draft: GeneratedRunDraft,
  state: FormState,
  reported: ReadonlySet<string>,
): ValidationErrorItem[] {
  let roundTripped: GeneratedRunDraft;
  try {
    roundTripped = generatedDraftFromFormState(state);
  } catch {
    // The form cannot be lowered back to a draft, so there is nothing to
    // compare against. The stages above have already had their say.
    return [];
  }

  const fields = new Set([
    ...Object.keys(draft as Record<string, unknown>),
    ...Object.keys(roundTripped as Record<string, unknown>),
  ]);

  const changed: ValidationErrorItem[] = [];
  for (const field of fields) {
    if (reported.has(field)) continue;
    const asked = canonical(field, (draft as Record<string, unknown>)[field]);
    const actual = canonical(field, (roundTripped as Record<string, unknown>)[field]);
    if (JSON.stringify(asked) === JSON.stringify(actual)) continue;

    changed.push({
      field,
      source: "coupling",
      // Showing what it WOULD run as is the point: "this was ignored" without
      // saying what replaced it leaves an agent guessing at exactly the moment
      // it was about to be wrong.
      message:
        `This was not used as given. The run would use ` +
        `${boundedText(JSON.stringify(actual), MAX_REPAIR_VALUE)} instead of ` +
        `${boundedText(JSON.stringify(asked), MAX_REPAIR_VALUE)}.`,
    });
  }

  return changed;
}

/**
 * The form's own errors, one item per field.
 *
 * The two halves are walked separately because they ARE two things:
 * `fields` is uniformly string-valued and `hyperparams` carries a key and a
 * label per entry. `validateForm` used to return them in one object, and both
 * implementations of this tool tripped on that independently — one rendered
 * every benchmark-parameter error as the literal text `[object Object]`, the
 * other passed the array to a string function and died with
 * `text.replace is not a function`. The shape is fixed at the source now, so
 * there is no member here to special-case.
 */
function formErrors(validation: FormValidation): ValidationErrorItem[] {
  const items: ValidationErrorItem[] = [];

  for (const [field, message] of Object.entries(validation.fields)) {
    if (message) items.push({ field, source: "form", message });
  }

  for (const issue of validation.hyperparams) {
    items.push({
      // The parameter's own key, so the item names the field to change rather
      // than the group it belongs to.
      field: issue.key,
      source: "form",
      message: `${issue.label}: ${issue.message}`,
    });
  }

  return items;
}

/**
 * Walk the seam. `ok: false` at exactly the points `qre_validate_config`
 * answers `valid: false`, so the two tools cannot disagree.
 *
 * `provenance` travels into the stamp rather than being assigned to the config
 * afterwards, because provenance is part of what the run-config schema
 * validates — see the note on `RunStamp`. The id and timestamp in that stamp
 * are placeholders: this function never mints run identity.
 */
export function prepareDraft(
  draft: unknown,
  options: { provenance?: RunProvenance } = {},
): PreparedDraft {
  // 0. Is it small enough to be worth reading? The registered input schema
  //    accepts any object, so this is where the work is bounded.
  const size = measureDraft(draft);
  if (size.kind === "unreadable") {
    return structuralFailure(
      "The draft could not be read as a run draft: it is nested too deeply.",
      "size",
    );
  }
  if (size.chars > MAX_DRAFT_CHARS) {
    return structuralFailure(
      `The draft is too large to be a run draft (over ${MAX_DRAFT_CHARS / 1024} KiB, not counting its name).`,
      "size",
    );
  }

  // 1. Does it look like a draft at all? The committed generation schema
  //    decides, so this rejects exactly what the app's own gate rejects.
  const structural = validateGeneratedDraft(draft);
  if (!structural.ok) {
    return structuralFailure(structural.reason);
  }

  // 2. Raise it into a form, through the same adapter the chat path uses.
  const mapped = formStateFromGeneratedDraft(structural.draft);
  if (!mapped.ok) {
    return structuralFailure(mapped.message);
  }

  // 3. Couplings, against what was ASKED rather than what the adapter kept.
  //    Early return: a draft naming a forbidden factory has not been
  //    validated so much as refused, and running the rest would bury that
  //    under whatever the substituted configuration happens to say.
  const asked = asAsked(structural.draft, mapped.state);
  const coupling = couplingErrors(structural.draft, asked);
  if (coupling.length > 0) {
    return { ok: false, stage: "coupling", errors: coupling };
  }

  const normalized = normalizeFormState(mapped.state);

  // 4. Field-level validation, as the form performs it.
  const errors: ValidationErrorItem[] = formErrors(validateForm(normalized));
  // The stage names the EARLIEST step that complained, so a schema issue
  // reported alongside a form issue does not rename the failure.
  let stage: PreparedDraftStage | null = errors.length > 0 ? "form" : null;

  // 5. Serialise. A null here means the draft is structurally incomplete in
  //    a way the form surfaces but the serialiser cannot represent.
  const runConfig = toRunConfig(
    normalized,
    schemaValidationStamp(options.provenance),
  );
  if (runConfig === null) {
    errors.push({
      field: "draft",
      source: "structure",
      message:
        "The draft is incomplete and cannot be serialised to a run configuration.",
    });
    return { ok: false, stage: stage ?? "structure", errors };
  }

  // 6. The committed run-config schema has the last word — the same
  //    artifact the engine validates against.
  const schema = validateRunConfigSchema(runConfig);
  for (const issue of schema.issues) {
    errors.push({ field: issue.field, source: "schema", message: issue.message });
  }
  if (stage === null && errors.length > 0) stage = "schema";

  // 7. Backstop: a substitution none of the above named. Runs last and adds
  //    only to what is already there, so a field with a real explanation
  //    keeps it.
  const unexplained = unexplainedChanges(
    structural.draft,
    normalized,
    new Set(errors.map((error) => error.field)),
  );
  errors.push(...unexplained);
  if (stage === null && unexplained.length > 0) stage = "unexplained";

  if (errors.length > 0) {
    return { ok: false, stage: stage ?? "form", errors };
  }

  return {
    ok: true,
    draft: structural.draft,
    normalized,
    runConfig,
    errors: [],
  };
}
