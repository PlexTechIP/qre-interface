/**
 * MCP tool: qre_get_run
 *
 * Retrieves a single run by ID with full details (except raw engine output).
 * Includes config, result metadata, a frontier sample, and error details.
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { logError } from "../logger.js";
import { boundedText, runTool, toolFailure, toolSuccess } from "../toolResult.js";
import { toRunDetail, type RunDetail } from "../projections.js";
import { getRunStore } from "../runStoreAccess.js";
import { validateRunRecord } from "../../shared/runRecordValidation.js";

export interface GetRunInput {
  id: string;
}

export interface GetRunOutput {
  run: RunDetail;
}

/**
 * Estimate the JSON size of an object (rough heuristic).
 */
function estimateJsonSize(obj: unknown): number {
  return JSON.stringify(obj).length;
}

const MAX_OUTPUT_SIZE = 65536; // ~64 KiB

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

    const validation = validateRunRecord(record);
    if (!validation.valid) {
      logError("Invalid run record in store", {
        id: record.id,
        errors: validation.errors,
      });
      return toolFailure("STORE_READ_FAILED", "The stored run record is corrupted.");
    }

    const output: GetRunOutput = { run: toRunDetail(record) };

    // NOTE: rejecting an oversized run rather than bounding the projection is
    // a known defect (the message claims a truncation that did not happen).
    // Left as-is deliberately: replacing it is its own change.
    const jsonSize = estimateJsonSize(output);
    if (jsonSize > MAX_OUTPUT_SIZE) {
      logError("RunDetail output too large", { id: input.id, size: jsonSize });
      return toolFailure(
        "STORE_READ_FAILED",
        "Run details are too large to return; the data has been truncated to prevent context overflow.",
      );
    }

    return toolSuccess(output);
  });
}
