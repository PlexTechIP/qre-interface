/**
 * MCP tool: qre_list_runs
 *
 * Lists recent quantum runs with optional filtering and cursor-based pagination.
 * Filtering runs through the store's own query semantics; only the coarse
 * application-type filter, which `RunFilter` cannot express, is applied here.
 * Pagination is keyset-based using base64-encoded composite keys.
 *
 * A page costs a page. The store answers the filter with KEYS — five columns
 * per run, no JSON — and only the runs on the page are read in full. The
 * earlier version read and parsed every matching record to slice one page from
 * it (design note F-4), so paging deeper cost the same as paging shallowly and
 * both grew with the history; the README's numbers recorded that limit.
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { logError } from "../logger.js";
import { runTool, toolFailure, toolSuccess } from "../toolResult.js";
import { toRunSummary } from "../projections.js";
import { getRunStore } from "../runStoreAccess.js";
import type { RunKey, RunKeyFilter } from "../../main/sqliteRunStoreReader.js";
import { validateStoredRunRecord } from "../../shared/runRecordValidation.js";
import {
  BENCHMARK_IDS,
  MANUAL_COUNTS_APPLICATION_KEY,
  type BenchmarkId,
  type ArchitectureType,
  type MagicStateFactoryId,
  type QecCodeId,
  type RunSummary,
} from "../../shared/types.js";

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
 * Translate the MCP filter into the store's own `RunFilter`.
 *
 * The store already owns these semantics — `matchesRunFilter` in
 * `shared/types.ts` is described there as "the reference match semantics", and
 * `SqliteRunStore.query` pushes the exact-match fields into indexed SQL. Only
 * the application dimension needs translating, because the MCP surface splits
 * the store's single composite key into a coarse `applicationType` plus an
 * optional `benchmarkId`: a model must never be handed the `uploaded:<path>`
 * form of that key.
 *
 * A benchmark id is only honoured when it names a benchmark this build knows:
 * `applicationKey` renders an uploaded run as `uploaded:<absolute path>`, so
 * forwarding arbitrary caller text as an application key would let a model test
 * whether a given file on the analyst's disk had been run, and read the answer
 * off `totalMatched`. An unrecognised id matches nothing, which is also the
 * honest answer for a benchmark that does not exist.
 *
 * "Any benchmark" becomes the set of known ids, and "any upload" cannot be a
 * key set at all — `matchesApplicationType` handles that one after the query.
 */
function isKnownBenchmark(id: string): id is BenchmarkId {
  return (BENCHMARK_IDS as readonly string[]).includes(id);
}

function toStoreFilter(filter: ListRunsInput["filter"]): RunKeyFilter {
  const storeFilter: RunKeyFilter = {};
  if (filter === undefined) return storeFilter;

  if (filter.nameSearch !== undefined) storeFilter.nameSearch = filter.nameSearch;
  if (filter.architecture !== undefined) storeFilter.architecture = filter.architecture;
  if (filter.qecCode !== undefined) storeFilter.qecCode = filter.qecCode;
  if (filter.magicStateFactory !== undefined) {
    storeFilter.magicStateFactory = filter.magicStateFactory;
  }
  if (filter.qreVersion !== undefined) storeFilter.qreVersion = filter.qreVersion;

  if (filter.benchmarkId !== undefined) {
    storeFilter.applications = isKnownBenchmark(filter.benchmarkId)
      ? [filter.benchmarkId]
      : [];
  } else if (filter.applicationType === "manualCounts") {
    storeFilter.application = MANUAL_COUNTS_APPLICATION_KEY;
  } else if (filter.applicationType === "benchmark") {
    storeFilter.applications = BENCHMARK_IDS;
  }

  return storeFilter;
}

/**
 * The part of the application filter `RunFilter` cannot carry, decided on the
 * application KEY the store indexes: a benchmark id, `uploaded:<path>`, or the
 * manual-counts marker. Those three shapes are `applicationKey`'s whole range,
 * so the key says the type without the record.
 *
 * Also what makes a contradictory filter behave: asking for `manualCounts` runs
 * of a benchmark matches nothing, rather than quietly ignoring one of the two.
 */
function matchesApplicationType(
  key: RunKey,
  filter: ListRunsInput["filter"],
): boolean {
  switch (filter?.applicationType) {
    case undefined:
      return true;
    case "manualCounts":
      return key.application === MANUAL_COUNTS_APPLICATION_KEY;
    case "uploaded":
      return key.application.startsWith("uploaded:");
    case "benchmark":
      return isKnownBenchmark(key.application);
  }
}

/**
 * Tool handler for qre_list_runs.
 */
export async function handleListRuns(
  input: ListRunsInput,
): Promise<CallToolResult> {
  return runTool(
    "listRuns",
    { code: "STORE_READ_FAILED", message: "Failed to list runs." },
    async () => {
    const limit = Math.min(input.limit ?? 25, 100);
    if (limit < 1) {
      return toolFailure("STORE_READ_FAILED", "limit must be at least 1");
    }

    // Keys only: the whole matching set is still walked — a count and a cursor
    // position need it — but as five columns per run, with no JSON parsed and
    // no record upgraded for anything that is not on the page.
    const store = getRunStore();
    const matching = (await store.queryKeys(toStoreFilter(input.filter)))
      .filter((key) => matchesApplicationType(key, input.filter));
    const totalMatched = matching.length;

    let startIndex = 0;
    if (input.cursor !== undefined && input.cursor.length > 0) {
      const decoded = decodeCursor(input.cursor);
      if (!decoded) {
        return toolFailure("INVALID_CURSOR", "Cursor is malformed.");
      }

      const [cursorCreatedAt, cursorSavedAt, cursorId] = decoded;
      const position = matching.findIndex(
        (key) =>
          key.createdAt === cursorCreatedAt &&
          key.savedAt === cursorSavedAt &&
          key.id === cursorId,
      );
      // Silently restarting here hands the agent page one again together with a
      // fresh cursor, so it re-reads runs it has already seen and believes it
      // advanced. Say so instead.
      if (position === -1) {
        return toolFailure(
          "INVALID_CURSOR",
          "This cursor no longer points at a run in these results; the history " +
            "or the filter changed. List again without a cursor.",
        );
      }
      startIndex = position + 1;
    }

    const pageKeys = matching.slice(startIndex, startIndex + limit);
    const page = await store.getMany(pageKeys.map((key) => key.id));

    // Validate only what is about to be returned. Validating the whole history
    // meant one unreadable record made every page fail.
    for (const record of page) {
      const validation = validateStoredRunRecord(record);
      if (!validation.valid) {
        logError("Invalid run record in store", {
          id: record.id,
          errors: validation.errors,
        });
        return toolFailure(
          "STORE_READ_FAILED",
          "Encountered invalid record in store.",
        );
      }
    }

    const output: ListRunsOutput = {
      runs: page.map(toRunSummary),
      totalMatched,
    };

    // The cursor names the last KEY on the page, not the last record: a run
    // deleted between the two reads leaves the page one short, and resuming
    // from the key still lands on the run after it.
    //
    // So it is emitted whenever more keys matched, even if the page came back
    // shorter than asked for — `nextCursor`, not the page length, is what the
    // tool's description tells a caller to stop on. The alternative is a
    // snapshot: both reads inside one deferred transaction, which needs them
    // in a single synchronous store call, since a transaction spanning an
    // await could interleave with another handler on the same connection.
    if (pageKeys.length > 0 && startIndex + limit < matching.length) {
      const lastOnPage = pageKeys[pageKeys.length - 1];
      if (lastOnPage) {
        output.nextCursor = encodeCursor(
          lastOnPage.createdAt,
          lastOnPage.savedAt,
          lastOnPage.id,
        );
      }
    }

    return toolSuccess(output satisfies ListRunsOutput);
    },
  );
}

