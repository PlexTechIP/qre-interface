/**
 * MCP tool: qre_get_run
 *
 * Retrieves a single run by ID with full details (except raw engine output).
 * Includes config, result metadata, a frontier sample, and error details.
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { logError } from "../logger.js";
import { storeAccessFailure, toolFailure, toolSuccess } from "../toolResult.js";
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
  try {
    if (!input.id || input.id.trim() === "") {
      return toolFailure("STORE_READ_FAILED", "Run ID is required and must not be empty");
    }

    const store = getRunStore();
    const record = await store.get(input.id);

    if (!record) {
      return toolFailure("RUN_NOT_FOUND", `No run found with ID: ${input.id}`);
    }

    // Validate the record
    const validation = validateRunRecord(record);
    if (!validation.valid) {
      logError("Invalid run record in store", { id: record.id, errors: validation.errors });
      return toolFailure("STORE_READ_FAILED", "The stored run record is corrupted.");
    }

    // Project to RunDetail
    const detail = toRunDetail(record);

    // Check output size
    const output: GetRunOutput = { run: detail };
    const jsonSize = estimateJsonSize(output);

    if (jsonSize > MAX_OUTPUT_SIZE) {
      logError("RunDetail output too large", { id: input.id, size: jsonSize });
      return toolFailure(
        "STORE_READ_FAILED",
        "Run details are too large to return; the data has been truncated to prevent context overflow.",
      );
    }

    return toolSuccess(output);
  } catch (error) {
    logError("getRun handler error", error);
    const storeFailure = storeAccessFailure(error);
    if (storeFailure) return storeFailure;
    return toolFailure("STORE_READ_FAILED", "Failed to retrieve the run.");
  }
}

