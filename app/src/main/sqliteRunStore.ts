import { DatabaseSync } from "node:sqlite";

import { validateRunRecord } from "../shared/runRecordValidation.js";
import { prepareDatabasePath } from "./databaseFile.js";
import { RunRecordExistsError } from "../shared/runStore.js";
import {
  DATABASE_SCHEMA_VERSION,
  FACTORY_SET_DELIMITER,
  encodeFactorySet,
  selectAllRecords,
  selectRecordById,
  selectRecordsByFilter,
} from "./sqliteRunStoreReader.js";
import {
  applicationKey,
  type RunFilter,
  type RunRecord,
  type RunStore,
} from "../shared/types.js";

export { DATABASE_SCHEMA_VERSION };

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
      this.database.exec("PRAGMA journal_mode = WAL");
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
    return selectAllRecords(this.database);
  }

  async get(id: string): Promise<RunRecord | null> {
    return selectRecordById(this.database, id);
  }

  async delete(id: string): Promise<void> {
    this.database.prepare("DELETE FROM run_records WHERE id = ?").run(id);
  }

  async query(filter: RunFilter): Promise<RunRecord[]> {
    return selectRecordsByFilter(this.database, filter);
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
