// @vitest-environment node

/**
 * The shared insert, and the two error tests the callers branch on.
 *
 * `SqliteRunStore` and the MCP server's append-only store both go through
 * `insertRunRecord`, so what it refuses and how it reports a refusal is
 * behaviour two modules depend on rather than an implementation detail of
 * either.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { RunRecordExistsError } from "../shared/runStore.js";
import { buildRunRecord } from "../shared/testing/builders.js";
import { SqliteRunStore } from "./sqliteRunStore.js";
import {
  insertRunRecord,
  isPrimaryKeyConstraint,
  isSqliteBusy,
  sqlitePrimaryResultCode,
} from "./sqliteRunStoreWriter.js";

let directory: string;
let databasePath: string;
let store: SqliteRunStore;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "qre-writer-test-"));
  databasePath = join(directory, "runs.sqlite");
  store = new SqliteRunStore(databasePath);
});

afterEach(() => {
  store.close();
  rmSync(directory, { recursive: true, force: true });
});

describe("sqlitePrimaryResultCode", () => {
  it("reads the low byte of an extended result code", () => {
    expect(sqlitePrimaryResultCode({ errcode: 517 })).toBe(5);
    expect(sqlitePrimaryResultCode({ errcode: 5 })).toBe(5);
  });

  it("is null for anything that carries no numeric errcode", () => {
    expect(sqlitePrimaryResultCode(new Error("nope"))).toBeNull();
    expect(sqlitePrimaryResultCode({ errcode: "5" })).toBeNull();
    expect(sqlitePrimaryResultCode(undefined)).toBeNull();
  });
});

describe("isSqliteBusy", () => {
  it("is true for SQLITE_BUSY and its extended forms", () => {
    expect(isSqliteBusy({ errcode: 5 })).toBe(true);
    // SQLITE_BUSY_SNAPSHOT: the extended code whose low byte is 5. Comparing
    // the whole code against 5 would miss this one.
    expect(isSqliteBusy({ errcode: 261 })).toBe(true);
    expect(isSqliteBusy({ errcode: 6 })).toBe(true);
  });

  it("is false for a constraint failure, a cantopen, and a non-SQLite error", () => {
    expect(isSqliteBusy({ errcode: 1555 })).toBe(false);
    expect(isSqliteBusy({ errcode: 14 })).toBe(false);
    expect(isSqliteBusy(undefined)).toBe(false);
    expect(isSqliteBusy(new Error("boom"))).toBe(false);
  });
});

describe("isPrimaryKeyConstraint", () => {
  it("takes the two constraint codes an id collision arrives as", () => {
    expect(isPrimaryKeyConstraint({ errcode: 1555 })).toBe(true);
    expect(isPrimaryKeyConstraint({ errcode: 2067 })).toBe(true);
  });

  it("does not take another constraint that shares the same low byte", () => {
    // SQLITE_CONSTRAINT_NOTNULL — low byte 19, like a PK collision, and
    // absolutely not "this run is already saved".
    expect(isPrimaryKeyConstraint({ errcode: 1299 })).toBe(false);
  });
});

describe("insertRunRecord", () => {
  it("appends a record the store then reads back", async () => {
    const record = buildRunRecord({ config: { id: "11111111-1111-4111-8111-111111111111" } });
    const database = new DatabaseSync(databasePath, { timeout: 5_000 });
    try {
      insertRunRecord(database, record);
    } finally {
      database.close();
    }

    expect(await store.get(record.id)).toEqual(record);
  });

  it("refuses a duplicate id with RunRecordExistsError", async () => {
    const record = buildRunRecord({ config: { id: "22222222-2222-4222-8222-222222222222" } });
    await store.save(record);

    const database = new DatabaseSync(databasePath, { timeout: 5_000 });
    try {
      expect(() => insertRunRecord(database, record)).toThrow(RunRecordExistsError);
    } finally {
      database.close();
    }
  });

  it("never lets a record whose result names a different run reach the table", async () => {
    const record = buildRunRecord({ config: { id: "33333333-3333-4333-8333-333333333333" } });
    const mismatched = {
      ...record,
      result: { ...record.result, runId: "44444444-4444-4444-8444-444444444444" },
    };

    const database = new DatabaseSync(databasePath, { timeout: 5_000 });
    try {
      expect(() => insertRunRecord(database, mismatched)).toThrow(
        /Cannot save invalid RunRecord/,
      );
    } finally {
      database.close();
    }

    expect(await store.count()).toBe(0);
  });
});

describe("SqliteRunStore.dataVersion", () => {
  it("changes when another connection commits, and not for this one's own insert", async () => {
    const before = store.dataVersion();

    await store.save(
      buildRunRecord({ config: { id: "55555555-5555-4555-8555-555555555555" } }),
    );
    expect(store.dataVersion()).toBe(before);

    const other = new SqliteRunStore(databasePath);
    try {
      await other.save(
        buildRunRecord({ config: { id: "66666666-6666-4666-8666-666666666666" } }),
      );
    } finally {
      other.close();
    }

    expect(store.dataVersion()).not.toBe(before);
  });
});
