import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { SqliteRunStore, DATABASE_SCHEMA_VERSION } from "../main/sqliteRunStore.js";
import { logError } from "./logger.js";

/** Error codes for store access failures. */
export type StoreAccessErrorCode =
  | "DB_NOT_CONFIGURED"
  | "DB_NOT_FOUND"
  | "DB_SCHEMA_MISMATCH";

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

/** Lazy, cached per-process SqliteRunStore. */
let cachedStore: SqliteRunStore | null = null;

/**
 * Get or create the run store, lazily and cached per process.
 * Throws a typed StoreAccessError on failures (configuration, schema version).
 *
 * Behavior:
 * 1. Read QRE_DB_PATH from process.env; throw DB_NOT_CONFIGURED if unset.
 * 2. Check path exists on disk; throw DB_NOT_FOUND if not.
 * 3. Read-only preflight: open read-only, check PRAGMA user_version, close.
 *    Compare against DATABASE_SCHEMA_VERSION; throw DB_SCHEMA_MISMATCH on mismatch.
 * 4. Only then construct the real SqliteRunStore and cache it.
 */
export function getRunStore(): SqliteRunStore {
  if (cachedStore !== null) {
    return cachedStore;
  }

  const dbPath = process.env.QRE_DB_PATH;
  if (!dbPath || dbPath.trim() === "") {
    throw createStoreAccessError(
      "DB_NOT_CONFIGURED",
      "QRE_DB_PATH environment variable is not set.",
    );
  }

  if (!existsSync(dbPath)) {
    throw createStoreAccessError(
      "DB_NOT_FOUND",
      `Database file not found at: ${dbPath}`,
    );
  }

  // Read-only preflight: open, check schema version, close
  let preflightDb: DatabaseSync;
  try {
    preflightDb = new DatabaseSync(dbPath, { readOnly: true });
  } catch (error) {
    logError("Failed to open database in read-only mode", error);
    throw createStoreAccessError(
      "DB_NOT_FOUND",
      "Failed to access the database file.",
    );
  }

  try {
    const versionRow = preflightDb
      .prepare("PRAGMA user_version")
      .get() as { user_version: number } | undefined;
    const schemaVersion = versionRow?.user_version ?? 0;

    if (schemaVersion !== DATABASE_SCHEMA_VERSION) {
      throw createStoreAccessError(
        "DB_SCHEMA_MISMATCH",
        `Database schema version (${schemaVersion}) does not match the required version (${DATABASE_SCHEMA_VERSION}). Launch or update the QRE Dashboard to migrate this database.`,
      );
    }
  } finally {
    preflightDb.close();
  }

  // Preflight passed; construct the real store
  cachedStore = new SqliteRunStore(dbPath);
  return cachedStore;
}

/** Close the cached store, if any. Called during shutdown. */
export function closeRunStore(): void {
  if (cachedStore !== null) {
    try {
      cachedStore.close();
    } catch (error) {
      logError("Error closing run store", error);
    }
    cachedStore = null;
  }
}

/** Reset the cached store (for tests). */
export function resetRunStoreForTests(): void {
  cachedStore = null;
}
