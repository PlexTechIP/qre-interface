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

import { statSync } from "node:fs";
import { resolveRunDatabasePath } from "../main/dataDir.js";
import {
  RunStoreSchemaMismatchError,
  SqliteReadOnlyRunStore,
} from "../main/sqliteReadOnlyRunStore.js";
import { DATABASE_SCHEMA_VERSION } from "../main/sqliteRunStoreReader.js";
import { logError } from "./logger.js";

/** Error codes for store access failures. A closed set, on purpose. */
export const STORE_ACCESS_ERROR_CODES = [
  "DB_NOT_CONFIGURED",
  "DB_NOT_FOUND",
  "DB_SCHEMA_MISMATCH",
  "DB_LOCKED",
  "DB_READONLY",
  "DB_UNAVAILABLE",
] as const;

export type StoreAccessErrorCode = (typeof STORE_ACCESS_ERROR_CODES)[number];

function isStoreAccessErrorCode(value: unknown): value is StoreAccessErrorCode {
  return (
    typeof value === "string" &&
    (STORE_ACCESS_ERROR_CODES as readonly string[]).includes(value)
  );
}

const STORE_ACCESS_ERROR_NAME = "StoreAccessError";

/**
 * A failure this module authored: an allowlisted code and a message a person
 * wrote, which is what makes it safe to forward to an MCP client as-is.
 */
export class StoreAccessError extends Error {
  constructor(
    readonly code: StoreAccessErrorCode,
    message: string,
  ) {
    super(message);
    this.name = STORE_ACCESS_ERROR_NAME;
  }
}

function createStoreAccessError(
  code: StoreAccessErrorCode,
  message: string,
): StoreAccessError {
  return new StoreAccessError(code, message);
}

/**
 * Only an error THIS module raised qualifies.
 *
 * "Any Error with a string `code`" was the previous test, and it is true of far
 * more than these: every `node:sqlite` failure carries `code:
 * "ERR_SQLITE_ERROR"` and every filesystem failure carries `ENOENT` or
 * `EACCES`. `runTool` forwards a store-access error's code and message to the
 * client verbatim, because both were authored here — so under the old test a
 * corrupt database at query time went out as `{"code": "ERR_SQLITE_ERROR",
 * "message": "database disk image is malformed…"}`: a code outside the
 * documented set and a raw exception message, which is exactly what the tool
 * boundary promises never happens. Checking the name AND the closed code set
 * keeps a foreign error on the fallback path, where it belongs.
 */
export function isStoreAccessError(error: unknown): error is StoreAccessError {
  return (
    error instanceof Error &&
    error.name === STORE_ACCESS_ERROR_NAME &&
    isStoreAccessErrorCode((error as { code?: unknown }).code)
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
 * A failure that says "not now", as against "not ever".
 *
 * The dashboard holding a write lock is the ordinary case: SQLite already
 * waited out the busy timeout before reporting it, and the connection that
 * reported it is still perfectly good. Treating it as a dead connection cost
 * the timeout twice — once in the call that failed, once in the reopen — and
 * threw away a handle that would have answered the next call.
 */
export function isTransientLockFailure(error: unknown): boolean {
  const code = primaryResultCode(error);
  return code === SQLITE_BUSY || code === SQLITE_LOCKED;
}

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

/**
 * The cached connection, and what it was opened on.
 *
 * The identity is what lets a later call notice the file is not the one the
 * connection holds. SQLite keeps reading an unlinked file quite happily, so an
 * analyst who deleted their history to start over and relaunched the dashboard
 * got a server that reported the OLD runs for as long as it lived — every list
 * was answered from an inode nothing else could see any more.
 */
interface CachedStore {
  store: SqliteReadOnlyRunStore;
  path: string;
  device: number;
  inode: number;
}

let cached: CachedStore | null = null;

/**
 * Connections this process has stopped using but must not close yet.
 *
 * `getRunStore()` is synchronous, but a handler holds the store it returned
 * across awaits — `listRuns` reads the keys, awaits, then reads the page — and
 * two requests that arrive in one stdin chunk interleave at microtask
 * granularity. So closing a replaced connection here closes the one another
 * handler is about to use: its next read throws `ERR_INVALID_STATE`, which
 * reaches the client as a generic `STORE_READ_FAILED` naming nothing.
 *
 * Retiring instead costs one descriptor on a read-only, idle connection, and
 * only when the database is moved, replaced, or migrated under a running
 * server. They are closed together at shutdown.
 */
const retired = new Set<SqliteReadOnlyRunStore>();

/** Stop using the cached connection without closing it. */
function retireCachedStore(): void {
  if (cached === null) return;
  retired.add(cached.store);
  cached = null;
}

function fileIdentity(path: string): { device: number; inode: number } | null {
  try {
    const stats = statSync(path);
    return { device: stats.dev, inode: stats.ino };
  } catch {
    return null;
  }
}

function isSameFile(
  entry: CachedStore,
  path: string,
  identity: { device: number; inode: number },
): boolean {
  return (
    entry.path === path &&
    entry.device === identity.device &&
    entry.inode === identity.inode
  );
}

function notConfigured(): StoreAccessError {
  return createStoreAccessError(
    "DB_NOT_CONFIGURED",
    "No run history is configured. Launch the QRE Dashboard once so it can " +
      "record where its database lives, or set QRE_DB_PATH to the path shown " +
      "under Settings > Data & storage.",
  );
}

function notFound(): StoreAccessError {
  return createStoreAccessError(
    "DB_NOT_FOUND",
    "No database was found at the location QRE_DB_PATH points to.",
  );
}

/** What the per-call re-check of an open connection concluded. */
type SchemaRecheck =
  | { kind: "current" }
  | { kind: "mismatch"; actual: number }
  | { kind: "busy" }
  | { kind: "broken" };

function recheckSchema(store: SqliteReadOnlyRunStore): SchemaRecheck {
  let actual: number;
  try {
    actual = store.schemaVersion();
  } catch (error) {
    if (isTransientLockFailure(error)) return { kind: "busy" };
    logError("Could not re-check the run store schema version", error);
    return { kind: "broken" };
  }
  return actual === DATABASE_SCHEMA_VERSION
    ? { kind: "current" }
    : { kind: "mismatch", actual };
}

/**
 * Get or create the read-only run store, cached per process but never trusted
 * blindly. Throws a typed StoreAccessError on every failure.
 *
 * Each call re-resolves where the database should be and checks that the
 * cached connection is still looking at that file, at the schema this build
 * reads. Three things change under a long-lived server: the pointer file (the
 * dashboard moved its data), the file itself (the history was deleted and
 * recreated), and the schema (the dashboard migrated in place). A stat and a
 * pragma per tool call is the price of answering from the database the analyst
 * is actually looking at, and it is microseconds against a query.
 *
 * What it does NOT do is treat not knowing as news. A pointer file that cannot
 * be read this instant, or a stat that fails, says nothing about where the
 * database went — so the open connection is left alone and only this call
 * fails. Discarding it meant a single unreadable `location.json` answered
 * `DB_NOT_CONFIGURED` ("Launch the QRE Dashboard once…") for a history that was
 * open and answering a moment earlier.
 *
 * The schema version is verified on the connection the caller then uses, so
 * there is no window in which the dashboard migrates between the check and the
 * first read.
 */
export function getRunStore(): SqliteReadOnlyRunStore {
  const dbPath = resolveRunDatabasePath();
  if (!dbPath || dbPath.trim() === "") throw notConfigured();

  const identity = fileIdentity(dbPath);
  if (identity === null) throw notFound();

  if (cached !== null && !isSameFile(cached, dbPath, identity)) {
    retireCachedStore();
  }

  if (cached !== null) {
    const recheck = recheckSchema(cached.store);
    switch (recheck.kind) {
      case "current":
        return cached.store;
      case "busy":
        // The dashboard is writing. The connection is fine; let the caller's
        // own read wait it out and report DB_LOCKED if it has to.
        return cached.store;
      case "mismatch":
        retireCachedStore();
        throw describeOpenFailure(
          new RunStoreSchemaMismatchError(recheck.actual, DATABASE_SCHEMA_VERSION),
        );
      case "broken":
        retireCachedStore();
        break;
    }
  }

  let store: SqliteReadOnlyRunStore;
  try {
    store = new SqliteReadOnlyRunStore(dbPath);
  } catch (error) {
    logError("Failed to open the run store", error);
    throw describeOpenFailure(error);
  }

  cached = { store, path: dbPath, ...identity };
  return store;
}

/**
 * Close every connection this process opened — the current one and any it
 * retired. Called during shutdown.
 */
export function closeRunStore(): void {
  const open = [...retired, ...(cached === null ? [] : [cached.store])];
  retired.clear();
  cached = null;

  for (const store of open) {
    try {
      store.close();
    } catch (error) {
      logError("Error closing run store", error);
    }
  }
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
