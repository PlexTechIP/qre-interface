// @vitest-environment node

/**
 * What the append store must NOT do.
 *
 * The read-only store's guarantee is enforced by SQLite; this one's is enforced
 * by absence, so the absences are what is tested: it does not migrate, it does
 * not create a database, it does not convert a journal mode. A test that only
 * checked "a saved record reads back" would pass just as happily for a class
 * that quietly ran the dashboard's migration first.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RunRecordExistsError } from "../shared/runStore.js";
import { buildRunRecord } from "../shared/testing/builders.js";
import { SqliteAppendRunStore } from "./sqliteAppendRunStore.js";
import { isSqliteBusy } from "./sqliteRunStoreWriter.js";
import { RunStoreSchemaMismatchError, SqliteReadOnlyRunStore } from "./sqliteReadOnlyRunStore.js";
import { SqliteRunStore } from "./sqliteRunStore.js";

let directory: string;
let databasePath: string;

function record(id: string) {
  return buildRunRecord({ config: { id } });
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "qre-append-test-"));
  databasePath = join(directory, "runs.sqlite");
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

/** Create the database the way the dashboard does, then let go of it. */
function createDashboardDatabase(): void {
  const store = new SqliteRunStore(databasePath);
  store.close();
}

describe("opening", () => {
  it("refuses a database at a schema it does not know, and changes nothing", () => {
    createDashboardDatabase();
    const raw = new DatabaseSync(databasePath);
    raw.exec("PRAGMA user_version = 99");
    const schemaBefore = raw
      .prepare("SELECT sql FROM sqlite_master ORDER BY name")
      .all();
    raw.close();

    expect(() => new SqliteAppendRunStore(databasePath)).toThrow(
      RunStoreSchemaMismatchError,
    );

    const after = new DatabaseSync(databasePath);
    try {
      expect(after.prepare("SELECT sql FROM sqlite_master ORDER BY name").all()).toEqual(
        schemaBefore,
      );
      // Not brought forward to the version this build wanted.
      expect(
        (after.prepare("PRAGMA user_version").get() as { user_version: number })
          .user_version,
      ).toBe(99);
    } finally {
      after.close();
    }
  });

  it("refuses an empty file rather than migrating it into a run store", () => {
    // A 0-byte file is a valid empty SQLite database at user_version 0. The
    // dashboard would migrate it; this must not, or a mis-set QRE_DB_PATH
    // becomes a second history nobody knows about.
    writeFileSync(databasePath, "");

    expect(() => new SqliteAppendRunStore(databasePath)).toThrow(
      RunStoreSchemaMismatchError,
    );
    expect(readFileSync(databasePath).length).toBe(0);
  });
});

describe("saving", () => {
  it("appends a record both the read-only and the read-write store then read", async () => {
    createDashboardDatabase();
    const saved = record("11111111-1111-4111-8111-111111111111");

    const append = new SqliteAppendRunStore(databasePath);
    try {
      await append.save(saved);
    } finally {
      append.close();
    }

    const readOnly = new SqliteReadOnlyRunStore(databasePath);
    try {
      expect(await readOnly.get(saved.id)).toEqual(saved);
    } finally {
      readOnly.close();
    }

    const readWrite = new SqliteRunStore(databasePath);
    try {
      expect(await readWrite.get(saved.id)).toEqual(saved);
    } finally {
      readWrite.close();
    }
  });

  it("refuses a duplicate id", async () => {
    createDashboardDatabase();
    const saved = record("22222222-2222-4222-8222-222222222222");

    const append = new SqliteAppendRunStore(databasePath);
    try {
      await append.save(saved);
      await expect(append.save(saved)).rejects.toThrow(RunRecordExistsError);
    } finally {
      append.close();
    }
  });

  it("leaves a rollback-journal database on its own journal mode", async () => {
    // The dashboard's store sets WAL; this one must not, because converting the
    // file is a change to the database the analyst did not ask for.
    const raw = new DatabaseSync(databasePath);
    raw.exec(`
      CREATE TABLE run_records (
        id TEXT PRIMARY KEY NOT NULL, schema_version TEXT NOT NULL,
        record_json TEXT NOT NULL, name TEXT NOT NULL, application TEXT NOT NULL,
        architecture TEXT NOT NULL, qec_code TEXT NOT NULL,
        magic_state_factory TEXT NOT NULL, qre_version TEXT NOT NULL,
        created_at TEXT NOT NULL, saved_at TEXT NOT NULL
      ) STRICT;
    `);
    raw.exec("PRAGMA journal_mode = delete");
    raw.exec("PRAGMA user_version = 2");
    raw.close();

    const append = new SqliteAppendRunStore(databasePath);
    try {
      await append.save(record("33333333-3333-4333-8333-333333333333"));
    } finally {
      append.close();
    }

    const after = new DatabaseSync(databasePath);
    try {
      const mode = after.prepare("PRAGMA journal_mode").get() as {
        journal_mode: string;
      };
      expect(mode.journal_mode).toBe("delete");
    } finally {
      after.close();
    }
  });
});

describe("a database another connection is holding", () => {
  it("retries after the busy timeout and succeeds when the lock clears", async () => {
    createDashboardDatabase();

    const blocker = new DatabaseSync(databasePath, { timeout: 5_000 });
    blocker.exec("BEGIN IMMEDIATE");
    blocker.exec(
      "INSERT INTO run_records (id, schema_version, record_json, name, application, architecture, qec_code, magic_state_factory, qre_version, created_at, saved_at) VALUES ('blocker','1.4.0','{}','n','a','gateBased','surface_code','|round_based|','v','t','t')",
    );

    // The sleep spy is what releases the lock, so the retry is the only thing
    // that can make this pass — and the test costs no wall-clock waiting.
    const sleep = vi.fn(async () => {
      blocker.exec("ROLLBACK");
    });

    const append = new SqliteAppendRunStore(databasePath, {
      busyTimeoutMs: 50,
      busyRetries: 2,
      retryDelayMs: () => 0,
      sleep,
    });
    try {
      await append.save(record("44444444-4444-4444-8444-444444444444"));
    } finally {
      append.close();
      blocker.close();
    }

    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("gives up after exactly the configured retries and reports the busy failure", async () => {
    createDashboardDatabase();

    const blocker = new DatabaseSync(databasePath, { timeout: 5_000 });
    blocker.exec("BEGIN IMMEDIATE");
    blocker.exec(
      "INSERT INTO run_records (id, schema_version, record_json, name, application, architecture, qec_code, magic_state_factory, qre_version, created_at, saved_at) VALUES ('blocker','1.4.0','{}','n','a','gateBased','surface_code','|round_based|','v','t','t')",
    );

    const sleep = vi.fn(async () => {});
    const append = new SqliteAppendRunStore(databasePath, {
      busyTimeoutMs: 50,
      busyRetries: 2,
      retryDelayMs: () => 0,
      sleep,
    });

    try {
      const failure = await append
        .save(record("55555555-5555-4555-8555-555555555555"))
        .then(
          () => null,
          (error: unknown) => error,
        );
      expect(isSqliteBusy(failure)).toBe(true);
    } finally {
      append.close();
      blocker.exec("ROLLBACK");
      blocker.close();
    }

    // Three attempts: the first and two retries.
    expect(sleep).toHaveBeenCalledTimes(2);
  });
});

describe("the module itself", () => {
  it("contains no DDL, no journal-mode pragma, and no schema-version write", () => {
    // The class's guarantee is made of what it does not do, and the cheapest
    // way to keep that true under edits is to read the source. A migration
    // added here would pass every behavioural test above.
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "sqliteAppendRunStore.ts"),
      "utf8",
    )
      .split("\n")
      .filter((line) => {
        const trimmed = line.trim();
        return !trimmed.startsWith("*") && !trimmed.startsWith("//") && !trimmed.startsWith("/*");
      })
      .join("\n");

    expect(source).not.toMatch(/CREATE|ALTER|DROP|journal_mode|PRAGMA user_version\s*=/i);
  });

  it("refuses a path with no database, leaving nothing usable behind", () => {
    // `new DatabaseSync(path)` without `readOnly` CREATES the file, which is
    // why the constructor cannot be the thing that protects a mistyped path —
    // it can only refuse to migrate what it finds. Keeping the file from being
    // created at all is `getAppendStore()`'s job, and it stats first.
    const missing = join(directory, "nothing-here.sqlite");

    expect(() => new SqliteAppendRunStore(missing)).toThrow(
      RunStoreSchemaMismatchError,
    );
    expect(existsSync(missing)).toBe(true);
    // Refused before any table was made, so nothing here is a run history.
    const raw = new DatabaseSync(missing);
    try {
      expect(raw.prepare("SELECT name FROM sqlite_master").all()).toEqual([]);
    } finally {
      raw.close();
    }
  });
});
