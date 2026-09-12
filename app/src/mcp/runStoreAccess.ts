/**
 * How the MCP server reaches the dashboard's run history — and how it is kept
 * from changing anything it may not change.
 *
 * There are two connections here, because there are two kinds of caller. Read
 * tools get a `SqliteReadOnlyRunStore`: SQLite refuses writes on the
 * connection and the type has no write methods, so "a read tool cannot write"
 * is structural rather than a matter of discipline. `qre_run_estimate` gets a
 * `SqliteAppendRunStore`, which can write exactly one statement and refuses to
 * open a database at a schema it does not already know.
 *
 * Nothing here constructs `SqliteRunStore`. That is the whole of the original
 * CLOSED-1 rule that survives verbatim: migration is the dashboard's job, and
 * this process must never do it — so the module that migrates stays off the
 * server's import graph entirely, which `importGraph.test.ts` holds.
 *
 * Where the database is comes from `dataDir.ts`: an explicit QRE_DB_PATH if one
 * is set, otherwise the location the dashboard published. This process cannot
 * ask Electron and must not guess — opening the wrong database would report an
 * analyst's history as empty, which is worse than refusing to start.
 *
 * The stat before every open is load-bearing for the append store in a way it
 * is not for the read store: `new DatabaseSync(path)` without `readOnly`
 * CREATES the file. Refusing a path nothing lives at, before constructing
 * anything, is what keeps a mistyped QRE_DB_PATH from quietly becoming a second
 * empty history.
 *
 * Messages returned from this module name the environment variable, never the
 * resolved path — a path is the analyst's filesystem layout, and it has no
 * business crossing to an external MCP client.
 */

import { statSync } from "node:fs";
import { resolveRunDatabasePath } from "../main/dataDir.js";
import {
  SqliteAppendRunStore,
  type AppendRunStoreOptions,
} from "../main/sqliteAppendRunStore.js";
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
        "The database could not be opened for reading or for writing because its directory is not writable. SQLite needs to create a temporary index file beside it.",
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
interface CachedStore<T> {
  store: T;
  path: string;
  device: number;
  inode: number;
}

/** What both caches need of the thing they hold. */
interface SchemaCheckedStore {
  schemaVersion(): number;
  close(): void;
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
  entry: CachedStore<unknown>,
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

function recheckSchema(store: SchemaCheckedStore): SchemaRecheck {
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
 * One cached connection, re-verified on every call, and the discipline for
 * replacing it.
 *
 * Retiring rather than closing is the part worth keeping in one place.
 * `getRunStore()` is synchronous, but a handler holds the store it returned
 * across awaits — `listRuns` reads the keys, awaits, then reads the page — and
 * two requests that arrive in one stdin chunk interleave at microtask
 * granularity. So closing a replaced connection here closes the one another
 * handler is about to use: its next read throws `ERR_INVALID_STATE`, which
 * reaches the client as a generic `STORE_READ_FAILED` naming nothing.
 *
 * Retiring instead costs one descriptor on an idle connection, and only when
 * the database is moved, replaced, or migrated under a running server. They are
 * closed together at shutdown.
 */
class StoreCache<T extends SchemaCheckedStore> {
  private entry: CachedStore<T> | null = null;
  private readonly retired = new Set<T>();

  constructor(
    private readonly open: (path: string) => T,
    private readonly whatFailed: string,
  ) {}

  /**
   * The store for the database the analyst is actually looking at.
   *
   * Each call re-resolves where the database should be and checks that the
   * cached connection is still looking at that file, at the schema this build
   * knows. Three things change under a long-lived server: the pointer file (the
   * dashboard moved its data), the file itself (the history was deleted and
   * recreated), and the schema (the dashboard migrated in place). A stat and a
   * pragma per tool call is microseconds against a query.
   *
   * What it does NOT do is treat not knowing as news. A pointer file that
   * cannot be read this instant, or a stat that fails, says nothing about where
   * the database went — so the open connection is left alone and only this call
   * fails. Discarding it meant a single unreadable `location.json` answered
   * `DB_NOT_CONFIGURED` ("Launch the QRE Dashboard once…") for a history that
   * was open and answering a moment earlier.
   */
  get(): T {
    const dbPath = resolveRunDatabasePath();
    if (!dbPath || dbPath.trim() === "") throw notConfigured();

    // Before constructing anything: an append store's `DatabaseSync` would
    // CREATE a file at a path nothing lives at.
    const identity = fileIdentity(dbPath);
    if (identity === null) throw notFound();

    if (this.entry !== null && !isSameFile(this.entry, dbPath, identity)) {
      this.retire();
    }

    if (this.entry !== null) {
      const recheck = recheckSchema(this.entry.store);
      switch (recheck.kind) {
        case "current":
          return this.entry.store;
        case "busy":
          // The dashboard is writing. The connection is fine; let the caller's
          // own statement wait it out and report DB_LOCKED if it has to.
          return this.entry.store;
        case "mismatch": {
          const { actual } = recheck;
          this.retire();
          throw describeOpenFailure(
            new RunStoreSchemaMismatchError(actual, DATABASE_SCHEMA_VERSION),
          );
        }
        case "broken":
          this.retire();
          break;
      }
    }

    let store: T;
    try {
      store = this.open(dbPath);
    } catch (error) {
      logError(this.whatFailed, error);
      throw describeOpenFailure(error);
    }

    this.entry = { store, path: dbPath, ...identity };
    return store;
  }

  /** Stop using the cached connection without closing it. */
  private retire(): void {
    if (this.entry === null) return;
    this.retired.add(this.entry.store);
    this.entry = null;
  }

  /** Close every connection this cache opened — the current one and any retired. */
  closeAll(): void {
    const open = [...this.retired, ...(this.entry === null ? [] : [this.entry.store])];
    this.retired.clear();
    this.entry = null;

    for (const store of open) {
      try {
        store.close();
      } catch (error) {
        logError("Error closing run store", error);
      }
    }
  }
}

const readCache = new StoreCache(
  (path) => new SqliteReadOnlyRunStore(path),
  "Failed to open the run store",
);

/**
 * Options the append store is constructed with. A test overrides them through
 * `resetRunStoreForTests` — the busy timeout and the sleep especially, because
 * proving the retry happened must not mean waiting out a real five seconds.
 */
let appendOptions: AppendRunStoreOptions = {};

let appendCache = new StoreCache(
  (path) => new SqliteAppendRunStore(path, appendOptions),
  "Failed to open the run store for appending",
);

/**
 * The read-only store the read tools use. Throws a typed StoreAccessError on
 * every failure.
 *
 * The schema version is verified on the connection the caller then uses, so
 * there is no window in which the dashboard migrates between the check and the
 * first read.
 */
export function getRunStore(): SqliteReadOnlyRunStore {
  return readCache.get();
}

/**
 * The append store `qre_run_estimate` saves through. Throws the same typed
 * StoreAccessError, so a caller forwards it the same way.
 *
 * A SECOND connection rather than a read-write one shared with the read tools:
 * a read tool must not be able to reach a `save` at all, and the only way to
 * keep that true under later edits is for the object it is handed not to have
 * one.
 */
export function getAppendStore(): SqliteAppendRunStore {
  return appendCache.get();
}

/**
 * Close every connection this process opened, of either kind. Called during
 * shutdown.
 */
export function closeRunStore(): void {
  readCache.closeAll();
  appendCache.closeAll();
}

/**
 * Drop the cached stores between tests.
 *
 * This closes the connections rather than just forgetting them: a test that
 * abandons an open handle and then deletes its temporary directory leaks a
 * descriptor on POSIX and fails outright on Windows.
 */
export function resetRunStoreForTests(
  options: { appendOptions?: AppendRunStoreOptions } = {},
): void {
  closeRunStore();
  appendOptions = options.appendOptions ?? {};
  // A fresh cache, so an option change cannot be shadowed by a connection the
  // previous options opened.
  appendCache = new StoreCache(
    (path) => new SqliteAppendRunStore(path, appendOptions),
    "Failed to open the run store for appending",
  );
}
