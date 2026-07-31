import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { validateRunRecord } from "../shared/runRecordValidation.js";
import { RunRecordExistsError } from "../shared/runStore.js";
import {
  applicationKey,
  queryRunRecords,
  upgradeRunRecord,
  type MagicStateFactoryId,
  type RunFilter,
  type RunRecord,
  type RunStore,
} from "../shared/types.js";

const DATABASE_SCHEMA_VERSION = 2;

/**
 * The factory column holds a SET as of contract v1.2.0, encoded as the members
 * wrapped and joined by a delimiter: ["round_based","gsj24"] becomes
 * "|round_based|gsj24|". The leading/trailing bars make a containment test an
 * unambiguous substring match — "|gsj24|" cannot collide with a longer id the
 * way a bare "gsj24" could.
 */
const FACTORY_SET_DELIMITER = "|";

function encodeFactorySet(factories: readonly MagicStateFactoryId[]): string {
  return `${FACTORY_SET_DELIMITER}${factories.join(FACTORY_SET_DELIMITER)}${FACTORY_SET_DELIMITER}`;
}

const INITIAL_SCHEMA = `
  CREATE TABLE IF NOT EXISTS run_records (
    id TEXT PRIMARY KEY NOT NULL,
    schema_version TEXT NOT NULL,
    record_json TEXT NOT NULL,
    name TEXT NOT NULL,
    application TEXT NOT NULL,
    architecture TEXT NOT NULL,
    qec_code TEXT NOT NULL,
    magic_state_factory TEXT NOT NULL,
    qre_version TEXT NOT NULL,
    created_at TEXT NOT NULL,
    saved_at TEXT NOT NULL
  ) STRICT;

  CREATE INDEX IF NOT EXISTS run_records_name_idx
    ON run_records(name COLLATE NOCASE);
  CREATE INDEX IF NOT EXISTS run_records_application_idx
    ON run_records(application);
  CREATE INDEX IF NOT EXISTS run_records_architecture_idx
    ON run_records(architecture);
  CREATE INDEX IF NOT EXISTS run_records_qec_code_idx
    ON run_records(qec_code);
  CREATE INDEX IF NOT EXISTS run_records_magic_state_factory_idx
    ON run_records(magic_state_factory);
  CREATE INDEX IF NOT EXISTS run_records_qre_version_idx
    ON run_records(qre_version);
  CREATE INDEX IF NOT EXISTS run_records_newest_first_idx
    ON run_records(created_at DESC, saved_at DESC, id DESC);
`;

function prepareDatabasePath(databasePath: string): void {
  if (databasePath !== ":memory:") {
    mkdirSync(dirname(databasePath), { recursive: true });
  }
}

/**
 * Rows are stored verbatim as saved, so a row written under v1.1.0 still carries
 * the singular `magicStateFactory`. The upgrade happens HERE, at the read
 * boundary, so every consumer above sees exactly one shape and the stored JSON
 * is never rewritten in place.
 */
function readStoredRecord(row: Record<string, unknown>): RunRecord {
  const recordJson = row.record_json;
  if (typeof recordJson !== "string") {
    throw new Error("SQLite run record is missing its JSON payload.");
  }
  return upgradeRunRecord(JSON.parse(recordJson) as RunRecord);
}

function isPrimaryKeyConstraint(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("errcode" in error))
    return false;
  const { errcode } = error as { errcode?: unknown };
  return errcode === 1555 || errcode === 2067;
}

/**
 * Main-process SQLite implementation of the committed RunStore boundary.
 *
 * The complete RunRecord is stored as JSON for full-fidelity round trips. The
 * columns beside record_json are derived, indexed values used for ordering and
 * History queries; they do not extend or alter the PM-owned record contract.
 */
export class SqliteRunStore implements RunStore {
  private readonly database: DatabaseSync;
  private closed = false;

  constructor(databasePath: string) {
    prepareDatabasePath(databasePath);
    this.database = new DatabaseSync(databasePath, { timeout: 5_000 });

    try {
      this.migrate();
    } catch (error) {
      this.database.close();
      throw error;
    }
  }

  async save(record: RunRecord): Promise<void> {
    const existing = this.database
      .prepare("SELECT 1 FROM run_records WHERE id = ?")
      .get(record.id);
    if (existing !== undefined) throw new RunRecordExistsError(record.id);

    const validation = validateRunRecord(record);
    if (!validation.valid) {
      throw new Error(`Cannot save invalid RunRecord: ${validation.errors}`);
    }

    const insert = this.database.prepare(`
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
    `);

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
      if (isPrimaryKeyConstraint(error))
        throw new RunRecordExistsError(record.id);
      throw error;
    }
  }

  async list(): Promise<RunRecord[]> {
    const rows = this.database
      .prepare(
        `
        SELECT record_json
        FROM run_records
        ORDER BY created_at DESC, saved_at DESC, id DESC
      `,
      )
      .all();
    return rows.map(readStoredRecord);
  }

  async get(id: string): Promise<RunRecord | null> {
    const row = this.database
      .prepare("SELECT record_json FROM run_records WHERE id = ?")
      .get(id);
    return row === undefined ? null : readStoredRecord(row);
  }

  async delete(id: string): Promise<void> {
    this.database.prepare("DELETE FROM run_records WHERE id = ?").run(id);
  }

  async query(filter: RunFilter): Promise<RunRecord[]> {
    const predicates: string[] = [];
    const parameters: string[] = [];

    const addExactFilter = (
      column: string,
      value: string | undefined,
    ): void => {
      if (value === undefined) return;
      predicates.push(`${column} = ?`);
      parameters.push(value);
    };

    addExactFilter("application", filter.application);
    addExactFilter("architecture", filter.architecture);
    addExactFilter("qec_code", filter.qecCode);
    addExactFilter("qre_version", filter.qreVersion);

    // The factory column is a set, so this narrows by CONTAINMENT rather than
    // equality: a run that selected several factories matches on any of them.
    if (filter.magicStateFactory !== undefined) {
      predicates.push("magic_state_factory LIKE ?");
      parameters.push(`%${encodeFactorySet([filter.magicStateFactory])}%`);
    }

    const whereClause =
      predicates.length === 0 ? "" : `WHERE ${predicates.join(" AND ")}`;
    const rows = this.database
      .prepare(
        `
        SELECT record_json
        FROM run_records
        ${whereClause}
        ORDER BY created_at DESC, saved_at DESC, id DESC
      `,
      )
      .all(...parameters)
      .map(readStoredRecord);

    // Keep the committed helper as the final authority for name-search and
    // ordering semantics after SQLite narrows the indexed exact-match fields.
    return queryRunRecords(rows, filter);
  }

  /** Close the underlying connection during application shutdown or test cleanup. */
  close(): void {
    if (this.closed) return;
    this.database.close();
    this.closed = true;
  }

  private migrate(): void {
    const versionRow = this.database.prepare("PRAGMA user_version").get();
    const currentVersion = versionRow?.user_version;
    if (typeof currentVersion !== "number") {
      throw new Error("Could not read the SQLite run-store schema version.");
    }
    if (currentVersion > DATABASE_SCHEMA_VERSION) {
      throw new Error(
        `Run-store schema version ${currentVersion} is newer than supported version ${DATABASE_SCHEMA_VERSION}.`,
      );
    }
    if (currentVersion === DATABASE_SCHEMA_VERSION) return;

    this.database.exec("BEGIN IMMEDIATE");
    try {
      // v1: the base table. CREATE TABLE IF NOT EXISTS makes this safe to run
      // against an existing v1 database on the way to v2.
      this.database.exec(INITIAL_SCHEMA);

      if (currentVersion < 2) {
        // v2 (contract v1.2.0): magic_state_factory went from a single id to a
        // delimited SET. Existing rows hold a bare id, which the containment
        // LIKE would never match; re-encode them as one-element sets. Only the
        // derived column changes — record_json stays exactly as it was saved,
        // and readStoredRecord upgrades its shape on the way out.
        this.database.exec(
          `UPDATE run_records
             SET magic_state_factory =
               '${FACTORY_SET_DELIMITER}' || magic_state_factory || '${FACTORY_SET_DELIMITER}'
           WHERE magic_state_factory NOT LIKE '${FACTORY_SET_DELIMITER}%'`,
        );
      }

      this.database.exec(`PRAGMA user_version = ${DATABASE_SCHEMA_VERSION}`);
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}
