/**
 * The one statement that appends a run, and the error tests that go with it.
 *
 * This exists because two stores now insert the same row. `SqliteRunStore` is
 * the dashboard's: it migrates, it deletes, it owns the file. The MCP server's
 * `SqliteAppendRunStore` may do exactly one of those things — append — and
 * proving that by reading it is only possible if the insert lives somewhere
 * that cannot migrate. So this module holds the INSERT and nothing else: no
 * DDL, no `PRAGMA user_version =`, no transaction, and deliberately no import
 * of `databaseFile.ts` (which creates directories) so that a caller cannot
 * reach a filesystem side effect through it.
 *
 * The column list is the store's, not the record contract's: `record_json` is
 * the full-fidelity value and the ten columns beside it are derived, indexed
 * copies used for ordering and History queries.
 */

import type { DatabaseSync } from "node:sqlite";

import { validateRunRecord } from "../shared/runRecordValidation.js";
import { RunRecordExistsError } from "../shared/runStore.js";
import { encodeFactorySet } from "./sqliteRunStoreReader.js";
import { applicationKey, type RunRecord } from "../shared/types.js";

/**
 * SQLite reports an EXTENDED result code — SQLITE_BUSY_SNAPSHOT is 517, not 5 —
 * and the low byte carries the primary code a caller can act on. Comparing the
 * extended code directly is how a busy database gets mistaken for an unknown
 * failure on exactly the platforms that report the extended form.
 */
export function sqlitePrimaryResultCode(error: unknown): number | null {
  if (typeof error !== "object" || error === null || !("errcode" in error)) {
    return null;
  }
  const { errcode } = error as { errcode?: unknown };
  return typeof errcode === "number" ? errcode & 0xff : null;
}

const SQLITE_BUSY = 5;
const SQLITE_LOCKED = 6;

/**
 * The two constraint codes an id collision can arrive as.
 *
 * 1555 is SQLITE_CONSTRAINT_PRIMARYKEY and 2067 is SQLITE_CONSTRAINT_UNIQUE;
 * which one comes back depends on how the column was declared, so both are
 * checked. These are compared WHOLE rather than by low byte: the low byte of
 * both is 19 (SQLITE_CONSTRAINT), which every other constraint failure — a NOT
 * NULL, a STRICT type mismatch — also carries, and reporting one of those as
 * "a run with this id already exists" would be a lie the caller acts on.
 */
export function isPrimaryKeyConstraint(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("errcode" in error))
    return false;
  const { errcode } = error as { errcode?: unknown };
  return errcode === 1555 || errcode === 2067;
}

/**
 * A failure that says "not now" rather than "not ever": another connection
 * holds the write lock and SQLite already waited out the busy timeout.
 */
export function isSqliteBusy(error: unknown): boolean {
  const code = sqlitePrimaryResultCode(error);
  return code === SQLITE_BUSY || code === SQLITE_LOCKED;
}

const INSERT_RUN_RECORD = `
      INSERT INTO run_records (
        id,
        schema_version,
        record_json,
        name,
        application,
        architecture,
        qec_code,
        magic_state_factory,
        qre_version,
        created_at,
        saved_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

/**
 * Append one record: refuse a duplicate, refuse an invalid record, insert.
 *
 * The duplicate `SELECT` is not redundant with the primary-key catch below. It
 * is what makes "this id is already saved" the answer even when the record is
 * ALSO invalid — validating first would report the record's shape for a call
 * whose real problem is that it is a repeat.
 */
export function insertRunRecord(
  database: DatabaseSync,
  record: RunRecord,
): void {
  const existing = database
    .prepare("SELECT 1 FROM run_records WHERE id = ?")
    .get(record.id);
  if (existing !== undefined) throw new RunRecordExistsError(record.id);

  const validation = validateRunRecord(record);
  if (!validation.valid) {
    throw new Error(`Cannot save invalid RunRecord: ${validation.errors}`);
  }

  const insert = database.prepare(INSERT_RUN_RECORD);

  try {
    insert.run(
      record.id,
      record.schemaVersion,
      JSON.stringify(record),
      record.config.name,
      applicationKey(record.config),
      record.config.architecture.type,
      record.config.qecCode,
      encodeFactorySet(record.config.magicStateFactories),
      record.result.qreVersion,
      record.config.createdAt,
      record.savedAt,
    );
  } catch (error) {
    if (isPrimaryKeyConstraint(error)) throw new RunRecordExistsError(record.id);
    throw error;
  }
}
