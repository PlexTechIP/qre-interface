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
import {
  normalizeFormState,
  type FormState,
} from "../../renderer/state/formState.js";
import { validateForm } from "../../renderer/state/validation.js";
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
 * What the adapter quietly repaired on the way in.
 *
 * `draftToFormState` drops a factory the architecture forbids rather than
 * failing — right for the chat path, where the analyst then edits a working
 * form, and wrong here: an agent asking "would this run?" about a draft naming
 * `magic_up_to_clifford` on Majorana would be told yes, about a different run.
 *
 * So this compares what was asked for against what came back and reports the
 * difference. It states no rule — it does not need to know WHY a factory was
 * dropped, and it keeps working when the normaliser learns a new coupling.
 */
function repairedByAdapter(
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

  return [
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

      // 3. Anything the adapter silently repaired is reported, not accepted.
      const coupling = repairedByAdapter(structural.draft, mapped.state);
      if (coupling.length > 0) {
        return toolSuccess({
          valid: false,
          errors: boundErrors(coupling),
        } satisfies ValidateConfigOutput);
      }

      const normalized = normalizeFormState(mapped.state);

      // 4. Field-level validation, as the form performs it.
      const errors: ValidationErrorItem[] = Object.entries(
        validateForm(normalized),
      )
        .filter(([, message]) => Boolean(message))
        .map(([field, message]) => ({
          field,
          source: "form" as const,
          message: String(message),
        }));

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
