/**
 * MCP tool: qre_validate_config
 *
 * Answers "would this draft run?" — and is only worth having if it answers the
 * same way the app does. So it walks the seam the Run button walks and states
 * no rule of its own:
 *
 *   committed generation schema -> the one draft adapter -> normalizeFormState
 *   -> validateForm -> toRunConfig -> validateRunConfigSchema
 *
 * Every architecture, factory and hyperparameter rule stays where the app keeps
 * it. A copy here would be a fifth statement of rules that already live in the
 * JSON Schema, the normalizer, the serialiser and the form — and the copy is
 * what makes a validator that disagrees with the thing it validates for.
 *
 * Nothing is persisted: no run store is opened, no record is written, and the
 * input type carries no `id` or `createdAt` for a model to mint run identity
 * with.
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { boundedText, runTool, toolSuccess } from "../toolResult.js";
import { validateGeneratedDraft } from "../../main/draftValidation.js";
import { formStateFromGeneratedDraft } from "../../renderer/state/generatedDraftToForm.js";
import { generatedDraftFromFormState } from "../../renderer/state/generatedDraft.js";
import {
  normalizeFormState,
  type FormState,
} from "../../renderer/state/formState.js";
import { validateForm, type FieldErrors } from "../../renderer/state/validation.js";
import type { HyperparamError } from "../../renderer/constants/hyperparameters.js";
import { schemaValidationStamp, toRunConfig } from "../../renderer/state/toRunConfig.js";
import { validateRunConfigSchema } from "../../renderer/state/schemaValidation.js";
import type { GeneratedRunDraft } from "../../shared/agentTypes.js";

export interface ValidateConfigInput {
  /**
   * Untrusted until `validateGeneratedDraft` says otherwise.
   *
   * Typed `unknown` rather than `GeneratedRunDraft` because nothing has checked
   * it at this point: the registered input schema accepts any object on
   * purpose, so that the committed JSON Schema is the single gate. Claiming the
   * validated type here would let a future edit read `draft.architecture`
   * before the gate and compile cleanly.
   */
  draft: unknown;
}

/** Which stage of the seam rejected the draft. */
export type ValidationSource = "structure" | "coupling" | "form" | "schema";

export interface ValidationErrorItem {
  field: string;
  source: ValidationSource;
  message: string;
}

export interface ValidateConfigOutput {
  valid: boolean;
  errors: ValidationErrorItem[];
}

const MAX_ERRORS = 50;
const MAX_MESSAGE = 500;
/** Each side of a "you asked for X, it would run as Y" message. */
const MAX_REPAIR_VALUE = 160;

/**
 * Bound the list itself. Escaping and path redaction happen below, in
 * `toolSuccess`, so this only has to decide how much to say.
 */
function boundErrors(errors: ValidationErrorItem[]): ValidationErrorItem[] {
  return errors.slice(0, MAX_ERRORS).map((error) => ({
    ...error,
    message: boundedText(error.message, MAX_MESSAGE),
  }));
}

/**
 * What the pipeline quietly changed on the way in.
 *
 * The adapters repair rather than fail — right for the chat path, where the
 * analyst then edits a working form, and wrong here: an agent asking "would this
 * run?" about a repaired draft is told yes, about a different run.
 *
 * The check is a ROUND TRIP rather than a list of fields, because a list of
 * fields is what the previous version was and it covered one of them. It
 * compared factories only, so two other substitutions passed as valid:
 *
 *   - an empty `magicStateFactories` became `["round_based"]`
 *   - `parameters` naming a different benchmark's hyperparameters were dropped
 *     for that benchmark's DEFAULTS — a draft asking about a 4×4 lattice was
 *     answered `valid: true` for a Shor's run at bitSize 31
 *
 * Lowering the normalised form back through `generatedDraftFromFormState` — the
 * same projection `qre_draft_from_run` returns — gives what the caller would
 * actually get, and anything that differs is something they did not ask for.
 * It states no rules, so it keeps working when the adapters learn a new one.
 *
 * The round trip is stable: every one of the runs in a real history that can be
 * drafted at all round-trips byte-identically, so a difference here is a real
 * substitution and not an artefact of a default being filled in.
 */
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

function repairedByPipeline(
  draft: GeneratedRunDraft,
  state: FormState,
): ValidationErrorItem[] {
  const dropped = (
    field: "magicStateFactories" | "secondaryFactories",
    asked: readonly string[],
    kept: readonly string[],
  ): ValidationErrorItem[] =>
    asked
      .filter((factory) => !kept.includes(factory))
      .map((factory) => ({
        field,
        source: "coupling" as const,
        message: `${factory} is not available on this architecture.`,
      }));

  // The one case worth a specific message, because it names the reason.
  const specific = [
    ...dropped(
      "magicStateFactories",
      draft.magicStateFactories,
      state.magicStateFactories,
    ),
    ...dropped(
      "secondaryFactories",
      draft.secondaryFactories,
      state.secondaryFactories,
    ),
  ];
  const alreadyReported = new Set(specific.map((item) => item.field));

  let roundTripped: GeneratedRunDraft;
  try {
    roundTripped = generatedDraftFromFormState(state);
  } catch {
    // The form cannot be lowered back to a draft, so there is nothing to
    // compare against. The later stages still have their say.
    return specific;
  }

  const fields = new Set([
    ...Object.keys(draft as Record<string, unknown>),
    ...Object.keys(roundTripped as Record<string, unknown>),
  ]);

  const changed: ValidationErrorItem[] = [];
  for (const field of fields) {
    if (alreadyReported.has(field)) continue;
    const asked = canonical(field, (draft as Record<string, unknown>)[field]);
    const actual = canonical(field, (roundTripped as Record<string, unknown>)[field]);
    if (JSON.stringify(asked) === JSON.stringify(actual)) continue;

    changed.push({
      field,
      source: "coupling",
      // Both values are caller- or adapter-authored, so both are bounded here
      // as well as at the boundary. Showing what it WOULD run as is the point:
      // "this was ignored" without saying what replaced it leaves an agent
      // guessing at exactly the moment it was about to be wrong.
      message:
        `This was not used as given. The run would use ` +
        `${boundedText(JSON.stringify(actual), MAX_REPAIR_VALUE)} instead of ` +
        `${boundedText(JSON.stringify(asked), MAX_REPAIR_VALUE)}.`,
    });
  }

  return [...specific, ...changed];
}

/**
 * The form's own errors, flattened into one item per field.
 *
 * Every `FieldErrors` value is a string except `hyperparams`, which is a
 * `HyperparamError[]`. A uniform `String(message)` over the entries therefore
 * rendered every benchmark-parameter error as the literal text
 * `[object Object]` — the one error class an agent tuning a benchmark is most
 * likely to hit, and the one it could learn nothing from.
 */
function formErrors(errors: FieldErrors): ValidationErrorItem[] {
  const items: ValidationErrorItem[] = [];

  for (const [field, value] of Object.entries(errors)) {
    if (!value) continue;
    if (field === "hyperparams" && Array.isArray(value)) {
      for (const issue of value as HyperparamError[]) {
        items.push({
          // The parameter's own key, so the item names the field to change
          // rather than the group it belongs to.
          field: issue.key,
          source: "form",
          message: `${issue.label}: ${issue.message}`,
        });
      }
      continue;
    }
    items.push({ field, source: "form", message: String(value) });
  }

  return items;
}

/**
 * Tool handler for qre_validate_config.
 *
 * An invalid draft is a successful RESULT carrying `valid: false`, not a tool
 * error: the point is to let an agent see what is wrong and try again. `isError`
 * is reserved for something actually going wrong inside the server.
 */
export async function handleValidateConfig(
  input: ValidateConfigInput,
): Promise<CallToolResult> {
  return runTool(
    "validateConfig",
    { code: "VALIDATION_FAILED", message: "Failed to validate the draft." },
    async () => {
      // 1. Does it look like a draft at all? The committed generation schema
      //    decides, so this rejects exactly what the app's own gate rejects.
      const structural = validateGeneratedDraft(input.draft);
      if (!structural.ok) {
        return toolSuccess({
          valid: false,
          errors: boundErrors([
            { field: "draft", source: "structure", message: structural.reason },
          ]),
        } satisfies ValidateConfigOutput);
      }

      // 2. Raise it into a form, through the same adapter the chat path uses.
      const mapped = formStateFromGeneratedDraft(structural.draft);
      if (!mapped.ok) {
        return toolSuccess({
          valid: false,
          errors: boundErrors([
            { field: "draft", source: "structure", message: mapped.message },
          ]),
        } satisfies ValidateConfigOutput);
      }

      const normalized = normalizeFormState(mapped.state);

      // 3. Anything the pipeline silently repaired is reported, not accepted.
      //    Compared against the NORMALISED form, not the mapped one: the
      //    normaliser repairs too, and its repairs were invisible here.
      const coupling = repairedByPipeline(structural.draft, normalized);
      if (coupling.length > 0) {
        return toolSuccess({
          valid: false,
          errors: boundErrors(coupling),
        } satisfies ValidateConfigOutput);
      }

      // 4. Field-level validation, as the form performs it.
      const errors: ValidationErrorItem[] = formErrors(validateForm(normalized));

      // 5. Serialise. A null here means the draft is structurally incomplete in
      //    a way the form surfaces but the serialiser cannot represent.
      const runConfig = toRunConfig(normalized, schemaValidationStamp());
      if (runConfig === null) {
        errors.push({
          field: "draft",
          source: "structure",
          message: "The draft is incomplete and cannot be serialised to a run configuration.",
        });
        return toolSuccess({
          valid: false,
          errors: boundErrors(errors),
        } satisfies ValidateConfigOutput);
      }

      // 6. The committed run-config schema has the last word — the same
      //    artifact the engine validates against.
      const schema = validateRunConfigSchema(runConfig);
      for (const issue of schema.issues) {
        errors.push({
          field: issue.field,
          source: "schema",
          message: issue.message,
        });
      }

      return toolSuccess({
        valid: errors.length === 0,
        errors: boundErrors(errors),
      } satisfies ValidateConfigOutput);
    },
  );
}
