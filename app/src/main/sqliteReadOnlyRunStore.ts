/**
 * A run store that can only read.
 *
 * This exists because the MCP server is specified never to change the
 * dashboard's database — the design's CLOSED-1 rule keeps the dashboard as the
 * sole migration owner. Enforcing that by convention ("just don't call save")
 * leaves the guarantee one forgetful pull request away from being false, so it
 * is enforced structurally instead: the connection is opened `readOnly`, which
 * makes SQLite itself reject every write including the journal-mode pragma and
 * any migration DDL, and the class has no write methods to reach for.
 */

import { DatabaseSync } from "node:sqlite";

import type {
  ReadableRunStore,
  RunFilter,
  RunRecord,
} from "../shared/types.js";
import {
  DATABASE_SCHEMA_VERSION,
  selectAllRecords,
  selectRecordById,
  selectRecordsByFilter,
} from "./sqliteRunStoreReader.js";

/**
 * The database is at a schema version this build cannot read. Migrating is the
 * dashboard's job, so the only honest thing a read-only consumer can do is
 * refuse and say who to ask.
 */
export class RunStoreSchemaMismatchError extends Error {
  constructor(
    readonly actual: number,
    readonly expected: number,
  ) {
    super(
      `Run-store schema version ${actual} does not match the supported version ${expected}.`,
    );
    this.name = "RunStoreSchemaMismatchError";
  }
}

/**
 * A run store that can only read.
 *
 * The schema version is checked on the same connection the caller goes on to
 * use — a separate preflight connection would leave a window in which the
 * dashboard migrates between the check and the first query.
 */
export class SqliteReadOnlyRunStore implements ReadableRunStore {
  private readonly database: DatabaseSync;
  private closed = false;

  constructor(
    databasePath: string,
    expectedSchemaVersion: number = DATABASE_SCHEMA_VERSION,
  ) {
    // `readOnly` is the guarantee: SQLite answers every write on this
    // connection with SQLITE_READONLY, including the journal-mode pragma and
    // any migration DDL. The busy timeout matches the dashboard's own, so a
    // dashboard write in flight is waited out rather than reported as failure.
    this.database = new DatabaseSync(databasePath, {
      readOnly: true,
      timeout: 5_000,
    });

    try {
      const versionRow = this.database.prepare("PRAGMA user_version").get() as
        | { user_version?: unknown }
        | undefined;
      const actual = versionRow?.user_version;
      if (typeof actual !== "number") {
        throw new Error("Could not read the SQLite run-store schema version.");
      }
      if (actual !== expectedSchemaVersion) {
        throw new RunStoreSchemaMismatchError(actual, expectedSchemaVersion);
      }
    } catch (error) {
      this.database.close();
      throw error;
    }
  }

  async list(): Promise<RunRecord[]> {
    return selectAllRecords(this.database);
  }

  async get(id: string): Promise<RunRecord | null> {
    return selectRecordById(this.database, id);
  }

  async query(filter: RunFilter): Promise<RunRecord[]> {
    return selectRecordsByFilter(this.database, filter);
  }

  /** Close the underlying connection. Safe to call more than once. */
  close(): void {
    if (this.closed) return;
    this.database.close();
    this.closed = true;
  }
}
