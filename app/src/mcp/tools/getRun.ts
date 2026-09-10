/**
 * MCP tool: qre_get_run
 *
 * Retrieves a single run by ID with full details (except raw engine output).
 * Includes config, result metadata, a bounded frontier sample, and error details.
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { logError } from "../logger.js";
import { boundedText, runTool, toolFailure, toolSuccess } from "../toolResult.js";
import { toRunDetail, type RunDetail } from "../projections.js";
import { getRunStore } from "../runStoreAccess.js";
import { validateStoredRunRecord } from "../../shared/runRecordValidation.js";

export interface GetRunInput {
  id: string;
}

export interface GetRunOutput {
  run: RunDetail;
}

/**
 * Tool handler for qre_get_run.
 */
export async function handleGetRun(input: GetRunInput): Promise<CallToolResult> {
  return runTool("getRun", { code: "STORE_READ_FAILED", message: "Failed to retrieve the run." }, async () => {
    if (!input.id || input.id.trim() === "") {
      return toolFailure("STORE_READ_FAILED", "Run ID is required and must not be empty");
    }

    const record = await getRunStore().get(input.id);
    if (!record) {
      // The id is the one string the caller fully controls, so it is bounded
      // before being echoed. `boundedText` also escapes it.
      return toolFailure(
        "RUN_NOT_FOUND",
        `No run found with ID: ${boundedText(input.id, 100)}`,
      );
    }

    const validation = validateStoredRunRecord(record);
    if (!validation.valid) {
      logError("Invalid run record in store", {
        id: record.id,
        errors: validation.errors,
      });
      return toolFailure("STORE_READ_FAILED", "The stored run record is corrupted.");
    }

    // No size guard: `toRunDetail` bounds every engine-controlled field, so a
    // RunDetail has a computable maximum. Refusing an oversized run made it
    // permanently unreadable, and said the data had been truncated when nothing
    // had been truncated and nothing was returned.
    return toolSuccess({ run: toRunDetail(record) } satisfies GetRunOutput);
  });
}
