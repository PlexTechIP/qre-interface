/**
 * How the MCP server reaches the dashboard's run history — and how it is kept
 * from changing it.
 *
 * The store handed to tools is a `SqliteReadOnlyRunStore`, so the guarantee is
 * structural rather than a matter of discipline: SQLite refuses writes on the
 * connection, and the type has no write methods for a tool to call. Nothing
 * here constructs `SqliteRunStore`; migration stays the dashboard's job, per
 * the design's CLOSED-1 rule.
 *
 * Where the database is comes from `dataDir.ts`: an explicit QRE_DB_PATH if one
 * is set, otherwise the location the dashboard published. This process cannot
 * ask Electron and must not guess — opening the wrong database would report an
 * analyst's history as empty, which is worse than refusing to start.
 *
 * Messages returned from this module name the environment variable, never the
 * resolved path — a path is the analyst's filesystem layout, and it has no
 * business crossing to an external MCP client.
 */

import { existsSync } from "node:fs";
import { resolveRunDatabasePath } from "../main/dataDir.js";
import {
  RunStoreSchemaMismatchError,
  SqliteReadOnlyRunStore,
} from "../main/sqliteReadOnlyRunStore.js";
import { logError } from "./logger.js";

/** Error codes for store access failures. */
export type StoreAccessErrorCode =
  | "DB_NOT_CONFIGURED"
  | "DB_NOT_FOUND"
  | "DB_SCHEMA_MISMATCH"
  | "DB_LOCKED"
  | "DB_READONLY"
  | "DB_UNAVAILABLE";

export interface StoreAccessError extends Error {
  code: StoreAccessErrorCode;
}

function createStoreAccessError(
  code: StoreAccessErrorCode,
  message: string,
): StoreAccessError {
  const error = new Error(message) as StoreAccessError;
  error.code = code;
  return error;
}

export function isStoreAccessError(error: unknown): error is StoreAccessError {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
  );
}

/**
 * SQLite reports an extended result code — SQLITE_READONLY_DIRECTORY is 1544,
 * not 8 — and the low byte carries the primary code the caller cares about.
 */
function primaryResultCode(error: unknown): number | null {
  if (typeof error !== "object" || error === null || !("errcode" in error)) {
    return null;
  }
  const { errcode } = error as { errcode?: unknown };
  return typeof errcode === "number" ? errcode & 0xff : null;
}

const SQLITE_BUSY = 5;
const SQLITE_LOCKED = 6;
const SQLITE_READONLY = 8;
const SQLITE_CANTOPEN = 14;

/**
 * Turn a failure to open the database into something an analyst can act on.
 *
 * The distinction matters: a busy database means try again, a read-only one
 * means fix permissions, and a missing one means check the configuration.
 * Collapsing all three into "not found" sends people looking for the wrong
 * problem.
 */
function describeOpenFailure(error: unknown): StoreAccessError {
  if (error instanceof RunStoreSchemaMismatchError) {
    return createStoreAccessError(
      "DB_SCHEMA_MISMATCH",
      `Database schema version (${error.actual}) does not match the required version (${error.expected}). Launch or update the QRE Dashboard to migrate this database.`,
    );
  }

  switch (primaryResultCode(error)) {
    case SQLITE_BUSY:
    case SQLITE_LOCKED:
      return createStoreAccessError(
        "DB_LOCKED",
        "The database is busy. The QRE Dashboard may be writing to it; try again shortly.",
      );
    case SQLITE_READONLY:
      // Reading a WAL database still needs to create its -shm file, so a
      // directory the process cannot write to fails the open outright.
      return createStoreAccessError(
        "DB_READONLY",
        "The database could not be opened for reading because its directory is not writable. SQLite needs to create a temporary index file beside it.",
      );
    case SQLITE_CANTOPEN:
      return createStoreAccessError(
        "DB_NOT_FOUND",
        "No database was found at the location QRE_DB_PATH points to.",
      );
    default:
      return createStoreAccessError(
        "DB_UNAVAILABLE",
        "The database could not be opened.",
      );
  }
}

/** Lazy, cached per-process read-only store. */
let cachedStore: SqliteReadOnlyRunStore | null = null;

/**
 * Get or create the read-only run store, lazily and cached per process.
 * Throws a typed StoreAccessError on every failure.
 *
 * The schema version is verified on the connection the caller then uses, so
 * there is no window in which the dashboard migrates between the check and the
 * first read.
 */
export function getRunStore(): SqliteReadOnlyRunStore {
  if (cachedStore !== null) {
    return cachedStore;
  }

  const dbPath = resolveRunDatabasePath();
  if (!dbPath || dbPath.trim() === "") {
    throw createStoreAccessError(
      "DB_NOT_CONFIGURED",
      "No run history is configured. Launch the QRE Dashboard once so it can " +
        "record where its database lives, or set QRE_DB_PATH to the path shown " +
        "under Settings > Data & storage.",
    );
  }

  if (!existsSync(dbPath)) {
    throw createStoreAccessError(
      "DB_NOT_FOUND",
      "No database was found at the location QRE_DB_PATH points to.",
    );
  }

  try {
    cachedStore = new SqliteReadOnlyRunStore(dbPath);
  } catch (error) {
    logError("Failed to open the run store", error);
    throw describeOpenFailure(error);
  }

  return cachedStore;
}

/** Close the cached store, if any. Called during shutdown. */
export function closeRunStore(): void {
  if (cachedStore === null) return;
  try {
    cachedStore.close();
  } catch (error) {
    logError("Error closing run store", error);
  }
  cachedStore = null;
}

/**
 * Drop the cached store between tests.
 *
 * This closes the connection rather than just forgetting it: a test that
 * abandons an open handle and then deletes its temporary directory leaks a
 * descriptor on POSIX and fails outright on Windows.
 */
export function resetRunStoreForTests(): void {
  closeRunStore();
}
