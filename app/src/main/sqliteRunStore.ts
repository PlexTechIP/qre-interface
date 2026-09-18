import { DatabaseSync } from "node:sqlite";

import { prepareDatabasePath } from "./databaseFile.js";
import { insertRunRecord } from "./sqliteRunStoreWriter.js";
import {
  DATABASE_SCHEMA_VERSION,
  FACTORY_SET_DELIMITER,
  countRecords,
  selectAllRecords,
  selectRecordById,
  selectRecordsByFilter,
} from "./sqliteRunStoreReader.js";
import {
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
    // The statement itself lives in `sqliteRunStoreWriter.ts`, shared with the
    // MCP server's append-only store so that both write the same row the same
    // way — and so that the module holding the INSERT is one that provably
    // cannot migrate.
    insertRunRecord(this.database, record);
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

  /**
   * How many runs are saved. Not part of `RunStore`: the History surface
   * always wants the records, and this exists for the caller that asked
   * `list().length > 0` and paid for every record to learn a boolean.
   */
  async count(): Promise<number> {
    return countRecords(this.database);
  }

  /**
   * SQLite's `data_version`, which changes when ANOTHER connection commits to
   * this database and never when this one does.
   *
   * That asymmetry is exactly the signal the History watcher needs. `fs.watch`
   * on the database file is unreliable under WAL — a commit lands in the -wal
   * file and the main file's mtime may not move at all — and polling the row
   * count cannot tell a delete-then-insert from no change. This is one pragma
   * on an open connection.
   */
  dataVersion(): number {
    const row = this.database.prepare("PRAGMA data_version").get() as
      | { data_version?: unknown }
      | undefined;
    const version = row?.data_version;
    if (typeof version !== "number") {
      throw new Error("Could not read the SQLite run-store data version.");
    }
    return version;
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
