/**
 * A run store that can only append.
 *
 * It opens read-write for one statement; it never migrates. That is CLOSED-1
 * reworded rather than abandoned: the rule was "the MCP server never changes
 * the dashboard's database", and it is now "the server may APPEND a run, and
 * only when the schema is already the one it knows". Migration stays the
 * dashboard's, exclusively.
 *
 * `SqliteReadOnlyRunStore` got that guarantee for free — SQLite refuses every
 * write on a `readOnly` connection, so there was nothing to enforce. This
 * connection can write, so the guarantee has to be built out of what the class
 * does NOT do, and each of those is checked by a test rather than promised
 * here:
 *
 *  - no `prepareDatabasePath`, so a wrong path cannot create a file or a
 *    directory (the caller stats first; see `runStoreAccess.ts`);
 *  - no `journal_mode` pragma, so an existing rollback-journal database is not
 *    silently converted to WAL behind the dashboard's back;
 *  - no DDL and no `PRAGMA user_version =`, so a database at an unknown schema
 *    is refused rather than "helpfully" brought forward;
 *  - the insert itself is `sqliteRunStoreWriter.ts`, a module with no DDL in it
 *    at all.
 *
 * The schema check runs on the connection the caller then writes on, so there
 * is no window in which the dashboard migrates between the check and the
 * INSERT.
 */

import { DatabaseSync } from "node:sqlite";

import { RunStoreSchemaMismatchError } from "./sqliteReadOnlyRunStore.js";
import { DATABASE_SCHEMA_VERSION } from "./sqliteRunStoreReader.js";
import { insertRunRecord, isSqliteBusy } from "./sqliteRunStoreWriter.js";
import type { RunRecord } from "../shared/types.js";

export interface AppendRunStoreOptions {
  /** The schema this build knows how to write. Anything else is refused. */
  expectedSchemaVersion?: number;
  /** How long SQLite itself waits for the write lock before reporting busy. */
  busyTimeoutMs?: number;
  /** How many times to try again AFTER that timeout has already elapsed. */
  busyRetries?: number;
  /**
   * Backoff before each retry. Jittered by default: two agents saving at the
   * same moment that both waited exactly 150 ms would collide again.
   */
  retryDelayMs?: (attempt: number) => number;
  /** Injected so a test can prove the retry happened without spending the wait. */
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_BUSY_TIMEOUT_MS = 5_000;
const DEFAULT_BUSY_RETRIES = 2;

function defaultRetryDelayMs(): number {
  return 150 + Math.random() * 250;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class SqliteAppendRunStore {
  private readonly database: DatabaseSync;
  private readonly expectedSchemaVersion: number;
  private readonly busyRetries: number;
  private readonly retryDelayMs: (attempt: number) => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private closed = false;

  constructor(databasePath: string, options: AppendRunStoreOptions = {}) {
    this.expectedSchemaVersion =
      options.expectedSchemaVersion ?? DATABASE_SCHEMA_VERSION;
    this.busyRetries = options.busyRetries ?? DEFAULT_BUSY_RETRIES;
    this.retryDelayMs = options.retryDelayMs ?? defaultRetryDelayMs;
    this.sleep = options.sleep ?? defaultSleep;

    // Read-write, because appending is the whole point — but with no path
    // preparation, so this cannot bring a database into existence. The busy
    // timeout matches the dashboard's, so a dashboard write in flight is
    // waited out rather than reported as failure.
    this.database = new DatabaseSync(databasePath, {
      timeout: options.busyTimeoutMs ?? DEFAULT_BUSY_TIMEOUT_MS,
    });

    try {
      const actual = this.schemaVersion();
      if (actual !== this.expectedSchemaVersion) {
        throw new RunStoreSchemaMismatchError(actual, this.expectedSchemaVersion);
      }
    } catch (error) {
      this.database.close();
      throw error;
    }
  }

  /**
   * Append one record, waiting out a database the dashboard is holding.
   *
   * SQLite's own busy timeout has already elapsed by the time a busy error
   * arrives here, so these retries are for the case that timeout does not
   * cover: a writer that holds the lock across several transactions in a row,
   * where each individual wait times out but a fresh attempt shortly after
   * succeeds. Everything else — a constraint, an invalid record, a closed
   * connection — is rethrown unchanged for the caller to classify.
   */
  async save(record: RunRecord): Promise<void> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        insertRunRecord(this.database, record);
        return;
      } catch (error) {
        if (!isSqliteBusy(error) || attempt >= this.busyRetries) throw error;
        await this.sleep(this.retryDelayMs(attempt));
      }
    }
  }

  /** The schema version the database reports NOW, on this connection. */
  schemaVersion(): number {
    const row = this.database.prepare("PRAGMA user_version").get() as
      | { user_version?: unknown }
      | undefined;
    const actual = row?.user_version;
    if (typeof actual !== "number") {
      throw new Error("Could not read the SQLite run-store schema version.");
    }
    return actual;
  }

  /** Close the underlying connection. Safe to call more than once. */
  close(): void {
    if (this.closed) return;
    this.database.close();
    this.closed = true;
  }
}
