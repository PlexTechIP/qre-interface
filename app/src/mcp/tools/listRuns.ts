/**
 * MCP tool: qre_list_runs
 *
 * Lists recent quantum runs with optional filtering and cursor-based pagination.
 * Filtering happens in-memory over the full result set, not in SQL.
 * Pagination is keyset-based using base64-encoded composite keys.
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { logError } from "../logger.js";
import { toolFailure, toolSuccess } from "../toolResult.js";
import { toRunSummary } from "../projections.js";
import { getRunStore } from "../runStoreAccess.js";
import { validateRunRecord } from "../../shared/runRecordValidation.js";
import type { RunSummary, ArchitectureType, QecCodeId, MagicStateFactoryId, RunRecord } from "../../shared/types.js";

export interface ListRunsInput {
  limit?: number | undefined;
  cursor?: string | undefined;
  filter?:
    | {
        nameSearch?: string | undefined;
        applicationType?: "benchmark" | "uploaded" | "manualCounts" | undefined;
        benchmarkId?: string | undefined;
        architecture?: ArchitectureType | undefined;
        qecCode?: QecCodeId | undefined;
        magicStateFactory?: MagicStateFactoryId | undefined;
        qreVersion?: string | undefined;
      }
    | undefined;
}

export interface ListRunsOutput {
  runs: RunSummary[];
  totalMatched: number;
  nextCursor?: string; // omitted if no next page
}

/**
 * Encode a pagination cursor from a run's sort key.
 * Cursor encodes (createdAt, savedAt, id) as base64url for resumption.
 */
function encodeCursor(createdAt: string, savedAt: string, id: string): string {
  const key = JSON.stringify([createdAt, savedAt, id]);
  return Buffer.from(key, "utf8").toString("base64url");
}

/**
 * Decode a pagination cursor. Returns null if malformed.
 */
function decodeCursor(cursor: string): [string, string, string] | null {
  try {
    const key = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as unknown;
    if (
      Array.isArray(key) &&
      key.length === 3 &&
      typeof key[0] === "string" &&
      typeof key[1] === "string" &&
      typeof key[2] === "string"
    ) {
      return [key[0], key[1], key[2]];
    }
  } catch {
    // Malformed cursor
  }
  return null;
}

/**
 * Check if a run should be included based on filter criteria.
 */
function matchesFilter(record: RunRecord, filter: ListRunsInput["filter"]): boolean {
  if (!filter) return true;

  const { config, result } = record;

  // Name search: case-insensitive substring
  if (filter.nameSearch !== undefined) {
    const needle = filter.nameSearch.toLowerCase().trim();
    if (needle.length > 0 && !config.name.toLowerCase().includes(needle)) {
      return false;
    }
  }

  // Application type filter
  if (filter.applicationType !== undefined) {
    const expectedAppType = filter.applicationType;
    if (config.application.type !== expectedAppType) {
      return false;
    }

    // If filtering by applicationType and it's benchmark, also check benchmarkId if provided
    if (
      filter.benchmarkId !== undefined &&
      config.application.type === "benchmark"
    ) {
      if (config.application.benchmarkId !== filter.benchmarkId) {
        return false;
      }
    }
  }

  // Architecture filter
  if (filter.architecture !== undefined && config.architecture.type !== filter.architecture) {
    return false;
  }

  // QEC code filter
  if (filter.qecCode !== undefined && config.qecCode !== filter.qecCode) {
    return false;
  }

  // Magic state factory filter (matches any in the set)
  if (filter.magicStateFactory !== undefined) {
    if (!config.magicStateFactories.includes(filter.magicStateFactory)) {
      return false;
    }
  }

  // QRE version filter
  if (filter.qreVersion !== undefined && result.qreVersion !== filter.qreVersion) {
    return false;
  }

  return true;
}

/**
 * Tool handler for qre_list_runs.
 */
export async function handleListRuns(
  input: ListRunsInput,
): Promise<CallToolResult> {
  try {
    const limit = Math.min(input.limit ?? 25, 100);
    if (limit < 1) {
      return toolFailure("STORE_READ_FAILED", "limit must be at least 1");
    }

    // Fetch all runs (sorted newest-first by store)
    const store = getRunStore();
    const allRecords = await store.list();

    // Validate all records
    for (const record of allRecords) {
      const validation = validateRunRecord(record);
      if (!validation.valid) {
        logError("Invalid run record in store", { id: record.id, errors: validation.errors });
        return toolFailure("STORE_READ_FAILED", "Encountered invalid record in store.");
      }
    }

    // Filter in-memory
    const filtered = allRecords.filter((record) => matchesFilter(record, input.filter));
    const totalMatched = filtered.length;

    // Apply cursor-based pagination
    let startIndex = 0;
    if (input.cursor) {
      const decoded = decodeCursor(input.cursor);
      if (!decoded) {
        return toolFailure("INVALID_CURSOR", "Cursor is malformed.");
      }

      const [cursorCreatedAt, cursorSavedAt, cursorId] = decoded;
      // Find the position of the cursor run, then start AFTER it
      for (let i = 0; i < filtered.length; i++) {
        const r = filtered[i];
        if (
          r &&
          r.config.createdAt === cursorCreatedAt &&
          r.savedAt === cursorSavedAt &&
          r.id === cursorId
        ) {
          startIndex = i + 1;
          break;
        }
      }
      // If cursor run not found, start from the beginning
    }

    // Slice the page
    const page = filtered.slice(startIndex, startIndex + limit);

    // Build output
    const runs = page.map(toRunSummary);
    const output: ListRunsOutput = {
      runs,
      totalMatched,
    };

    // Set nextCursor only if there are more results
    if (page.length > 0 && startIndex + limit < filtered.length) {
      const lastOnPage = page[page.length - 1];
      if (lastOnPage) {
        output.nextCursor = encodeCursor(
          lastOnPage.config.createdAt,
          lastOnPage.savedAt,
          lastOnPage.id,
        );
      }
    }

    return toolSuccess(output);
  } catch (error) {
    logError("listRuns handler error", error);
    if (error && typeof error === "object" && "code" in error) {
      const errCode = (error as { code?: string }).code;
      if (
        errCode === "DB_NOT_CONFIGURED" ||
        errCode === "DB_NOT_FOUND" ||
        errCode === "DB_SCHEMA_MISMATCH"
      ) {
        return toolFailure(errCode as "DB_NOT_CONFIGURED" | "DB_NOT_FOUND" | "DB_SCHEMA_MISMATCH", (error as { message?: string }).message || "Database error");
      }
    }
    return toolFailure("STORE_READ_FAILED", "Failed to list runs.");
  }
}

