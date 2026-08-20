/**
 * MCP tool: qre_validate_config
 *
 * Validates a GeneratedRunDraft against the full pipeline's requirements.
 * Unlike the renderer's silent-repair pipeline, this tool catches and reports
 * coupling violations (disallowed factories, incompatible secondary factories,
 * unknown hyperparameter keys, etc.) as validation errors rather than silently
 * fixing them.
 *
 * Pipeline order (load-bearing):
 * 1. Structural gate: validateGeneratedDraft
 * 2. Adapter: generatedDraftToFormState
 * 3. Coupling checks: isPrimaryFactoryAllowed, secondaryFactories rules, etc.
 * 4. Normalize: normalizeFormState
 * 5. Form validation: validateForm
 * 6. Serialize: toRunConfig
 * 7. Schema validation: validateRunConfigSchema
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { logError } from "../logger.js";
import { capText, escapeControlChars, toolFailure, toolSuccess } from "../toolResult.js";
import { generatedDraftToFormState } from "../projections.js";
import { validateGeneratedDraft } from "../../main/draftValidation.js";
import type { GeneratedRunDraft } from "../../shared/agentTypes.js";
import { normalizeFormState, isPrimaryFactoryAllowed } from "../../renderer/state/formState.js";
import { validateForm } from "../../renderer/state/validation.js";
import { toRunConfig, schemaValidationStamp } from "../../renderer/state/toRunConfig.js";
import { validateRunConfigSchema } from "../../renderer/state/schemaValidation.js";
import { BENCHMARK_HYPERPARAMS } from "../../renderer/constants/hyperparameters.js";
import type { FormState } from "../../renderer/state/formState.js";

export interface ValidateConfigInput {
  draft: GeneratedRunDraft;
}

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

/**
 * Tool handler for qre_validate_config.
 *
 * Returns a normal successful result with { valid: false, errors: [...] } when
 * the draft fails validation — the point of this tool is to let an agent see what's
 * wrong and try again, not to treat invalid config as a protocol-level error.
 *
 * toolFailure/isError is ONLY for genuine internal exceptions (something threw).
 */
export async function handleValidateConfig(input: ValidateConfigInput): Promise<CallToolResult> {
  try {
    const errors: ValidationErrorItem[] = [];

    // 1. Structural gate: validate the draft's raw shape
    const draftValidation = validateGeneratedDraft(input.draft);
    if (!draftValidation.ok) {
      errors.push({
        field: "draft",
        source: "structure",
        message: capText(draftValidation.reason, 500),
      });
      return toolSuccess({ valid: false, errors });
    }

    const draft = draftValidation.draft;

    // 2. Adapter: convert to FormState (no normalization yet)
    let formState: FormState;
    try {
      formState = generatedDraftToFormState(draft);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push({
        field: "draft",
        source: "structure",
        message: capText(message, 500),
      });
      return toolSuccess({ valid: false, errors });
    }

    // 3. Coupling checks: on the RAW un-normalized state
    checkCouplingViolations(formState, errors);

    // Early return if coupling violations found
    if (errors.length > 0) {
      return toolSuccess({ valid: false, errors: capErrorsArray(errors) });
    }

    // 4. Normalize: now apply the silent repairs
    const normalized = normalizeFormState(formState);

    // 5. Form validation: field-level errors
    const fieldErrors = validateForm(normalized);
    Object.entries(fieldErrors).forEach(([field, message]) => {
      if (message) {
        errors.push({
          field,
          source: "form",
          message: capText(message, 500),
        });
      }
    });

    // 6. Serialize: check if toRunConfig returns null (structurally incomplete)
    const stamp = schemaValidationStamp();
    const runConfig = toRunConfig(normalized, stamp);
    if (runConfig === null) {
      errors.push({
        field: "draft",
        source: "structure",
        message: "The draft is structurally incomplete and cannot be serialized.",
      });
      return toolSuccess({ valid: false, errors });
    }

    // 7. Schema validation: check against the committed JSON Schema
    const schemaValidation = validateRunConfigSchema(runConfig);
    if (!schemaValidation.valid) {
      // Split newline-separated error string into individual items
      const schemaErrors = schemaValidation.errors
        .split("\n")
        .filter((line) => line.trim().length > 0);
      for (const errorLine of schemaErrors) {
        const trimmed = capText(errorLine, 500);
        // Try to extract field name from error line (typically "data.fieldName ..." format)
        const fieldMatch = errorLine.match(/^data\.(\w+)/);
        const field = fieldMatch?.[1] ?? "schema";
        errors.push({
          field,
          source: "schema",
          message: trimmed,
        });
      }
    }

    // Success: return the final result
    return toolSuccess({
      valid: errors.length === 0,
      errors: capErrorsArray(errors),
    });
  } catch (error) {
    logError("validateConfig handler error", error);
    return toolFailure(
      "VALIDATION_FAILED",
      "The draft could not be validated.",
    );
  }
}

/**
 * Check coupling violations that normalizeFormState would silently repair.
 * This is the core finding of the plan: we catch these BEFORE normalize erases
 * the evidence.
 */
function checkCouplingViolations(
  formState: FormState,
  errors: ValidationErrorItem[],
): void {
  // D1: Empty magicStateFactories — leave it empty so form validation naturally reports it
  // (handled by form validation in step 5, not here)

  // Check: each factory must be allowed on the current architecture
  for (const factory of formState.magicStateFactories) {
    if (!isPrimaryFactoryAllowed(factory, formState.architecture)) {
      errors.push({
        field: "magicStateFactories",
        source: "coupling",
        message: `Magic state factory "${factory}" is not allowed for the selected architecture.`,
      });
    }
  }

  // Check: Majorana + magic_up_to_clifford is disallowed
  if (
    formState.architecture.type === "majorana" &&
    formState.secondaryFactories.includes("magic_up_to_clifford")
  ) {
    errors.push({
      field: "secondaryFactories",
      source: "coupling",
      message: 'Secondary factory "magic_up_to_clifford" is not allowed for Majorana architecture.',
    });
  }

  // D2: memoryOptimization !== "none" is disallowed (the form disables this for agent drafts)
  if (formState.memoryOptimization !== "none") {
    errors.push({
      field: "memoryOptimization",
      source: "coupling",
      message: `Memory optimization must be "none" for agent-authored drafts; received "${formState.memoryOptimization}".`,
    });
  }

  // D3: Unknown hyperparameter keys
  if (formState.application.type === "benchmark") {
    const benchmarkId = formState.application.benchmarkId;
    const declaredKeys = new Set<string>();
    const hyperparam = BENCHMARK_HYPERPARAMS[benchmarkId as keyof typeof BENCHMARK_HYPERPARAMS];
    if (hyperparam) {
      for (const field of hyperparam) {
        declaredKeys.add(field.key);
      }
    }

    const paramValues = formState.application.hyperparams[benchmarkId] ?? {};
    for (const key of Object.keys(paramValues)) {
      if (!declaredKeys.has(key)) {
        errors.push({
          field: "parameters",
          source: "coupling",
          message: `Unknown hyperparameter key "${key}" for benchmark "${benchmarkId}".`,
        });
      }
    }
  }
}

/**
 * Cap the errors array to a reasonable size (around 50 items) so a wildly broken
 * draft doesn't produce an unbounded response. Also escape control characters in
 * message text to prevent injection.
 */
function capErrorsArray(errors: ValidationErrorItem[]): ValidationErrorItem[] {
  const capped = errors.slice(0, 50);
  return capped.map((err) => ({
    ...err,
    message: escapeControlChars(err.message),
  }));
}
