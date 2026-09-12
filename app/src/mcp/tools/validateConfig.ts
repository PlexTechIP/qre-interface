/**
 * MCP tool: qre_validate_config
 *
 * Answers "would this draft run?" — and is only worth having if it answers the
 * same way the app does, and the same way `qre_run_estimate` does. The walk
 * itself therefore lives in `prepareDraft.ts`, which both tools call; this file
 * is the reporting half of it, and nothing more.
 *
 * Nothing is persisted: no run store is opened, no record is written, and the
 * input type carries no `id` or `createdAt` for a model to mint run identity
 * with.
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { runTool, toolSuccess } from "../toolResult.js";
import { boundErrors, prepareDraft } from "./prepareDraft.js";
import type { ValidationErrorItem, ValidationSource } from "./prepareDraft.js";

export type { ValidationErrorItem, ValidationSource };

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

export interface ValidateConfigOutput {
  valid: boolean;
  errors: ValidationErrorItem[];
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
      const prepared = prepareDraft(input.draft);
      return toolSuccess({
        valid: prepared.ok,
        errors: boundErrors(prepared.errors),
      } satisfies ValidateConfigOutput);
    },
  );
}
