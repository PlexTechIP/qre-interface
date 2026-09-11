// @vitest-environment node

/**
 * `selectRecordKeysByFilter` promises the same set, in the same order, as
 * `selectRecordsByFilter` — it just does not read the records to say so. That
 * equivalence is the whole of its correctness, and it is held here rather than
 * assumed: the name search and the ordering are re-stated over key columns,
 * and a restatement is exactly the kind of copy that drifts.
 */

import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildRunRecord } from "../shared/testing/builders.js";
import type { RunFilter, RunRecord } from "../shared/types.js";
import { SqliteRunStore } from "./sqliteRunStore.js";
import {
  compareRunKeysNewestFirst,
  countRecords,
  selectRecordKeysByFilter,
  selectRecordsByFilter,
  selectRecordsByIds,
  type RunKey,
} from "./sqliteRunStoreReader.js";

let directory: string;
let database: DatabaseSync | undefined;

/** The read-only handle the fixture opened, or a clear failure if it did not. */
function db(): DatabaseSync {
  if (database === undefined) throw new Error("the fixture database was not opened");
  return database;
}

const RECORDS: RunRecord[] = [
  buildRunRecord({
    config: {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "Ekerå-Håstad RSA-2048",
      createdAt: "2026-08-01T10:00:00.000Z",
      application: { type: "benchmark", benchmarkId: "ekera-hastad-factoring" },
    },
    savedAt: "2026-08-01T10:00:01.000Z",
  }),
  buildRunRecord({
    config: {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      name: "ising 10x10",
      createdAt: "2026-08-01T10:00:00.000Z",
      application: { type: "benchmark", benchmarkId: "quantum-dynamics" },
      architecture: { type: "majorana", errorRate: 0.00001, operationTime: 1000 },
      qecCode: "three_aux",
    },
    // Same launch time as the first: the tie-break is what this row is for.
    savedAt: "2026-08-01T10:00:02.000Z",
  }),
  buildRunRecord({
    config: {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      name: "Bell state · demo",
      createdAt: "2026-07-30T09:00:00.000Z",
      application: {
        type: "uploaded",
        filePath: "/Users/jane/bell.qasm",
        format: "openqasm",
        addToLibrary: false,
      },
    },
    savedAt: "2026-07-30T09:00:01.000Z",
  }),
  buildRunRecord({
    config: {
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      name: "  Ising  manual  ",
      createdAt: "2026-08-02T12:00:00.000Z",
      application: {
        type: "manualCounts",
        numQubits: 10,
        tCount: 1,
        rotationCount: 1,
        rotationDepth: 1,
        cczCount: 0,
        ccixCount: 0,
        measurementCount: 1,
      },
      magicStateFactories: ["round_based", "gsj24"],
    },
    savedAt: "2026-08-02T12:00:01.000Z",
  }),
];

beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), "qre-keys-"));
  const dbPath = join(directory, "runs.sqlite");
  const store = new SqliteRunStore(dbPath);
  try {
    // Inserted out of order on purpose; the order the reader returns must not
    // be the order the rows went in.
    for (const record of [RECORDS[2], RECORDS[0], RECORDS[3], RECORDS[1]]) {
      if (record) await store.save(record);
    }
  } finally {
    // Closed even when a record fails to save. Leaking the write handle left
    // the temporary directory undeletable, and the reported failure was the
    // teardown rather than the seeding that actually broke.
    store.close();
  }
  database = new DatabaseSync(dbPath, { readOnly: true });
});

afterEach(() => {
  const open = database;
  database = undefined;
  try {
    open?.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

const FILTERS: RunFilter[] = [
  {},
  { nameSearch: "ising" },
  { nameSearch: "HÅSTAD" },
  { nameSearch: "   " },
  { nameSearch: "no such run" },
  { architecture: "majorana" },
  { qecCode: "surface_code" },
  { magicStateFactory: "gsj24" },
  { applications: ["quantum-dynamics", "ekera-hastad-factoring"] },
  { applications: [] },
  { application: "manual-counts" },
  { nameSearch: "ising", architecture: "gateBased" },
];

describe("selectRecordKeysByFilter", () => {
  it.each(FILTERS.map((filter) => [JSON.stringify(filter), filter] as const))(
    "agrees with selectRecordsByFilter for %s",
    (_label, filter) => {
      const keys = selectRecordKeysByFilter(db(), filter);
      const records = selectRecordsByFilter(db(), filter);

      expect(keys.map((key) => key.id)).toEqual(records.map((record) => record.id));
      for (const [index, key] of keys.entries()) {
        const record = records[index];
        expect(key).toEqual({
          id: record?.id,
          name: record?.config.name,
          application: expect.any(String),
          createdAt: record?.config.createdAt,
          savedAt: record?.savedAt,
        });
      }
    },
  );

  it("carries the application key, including an upload's path, exactly as indexed", () => {
    const keys = selectRecordKeysByFilter(db(), {});

    expect(keys.map((key) => key.application).sort()).toEqual([
      "ekera-hastad-factoring",
      "manual-counts",
      "quantum-dynamics",
      "uploaded:/Users/jane/bell.qasm",
    ]);
  });
});

describe("compareRunKeysNewestFirst", () => {
  it("orders by launch time, then save time, then id, each descending", () => {
    const key = (id: string, createdAt: string, savedAt: string): RunKey => ({
      id,
      name: "",
      application: "",
      createdAt,
      savedAt,
    });
    const shuffled = [
      key("b", "2026-01-01T00:00:00Z", "2026-01-01T00:00:02Z"),
      key("a", "2026-01-02T00:00:00Z", "2026-01-02T00:00:01Z"),
      key("c", "2026-01-01T00:00:00Z", "2026-01-01T00:00:02Z"),
      key("d", "2026-01-01T00:00:00Z", "2026-01-01T00:00:01Z"),
    ];

    expect([...shuffled].sort(compareRunKeysNewestFirst).map((entry) => entry.id)).toEqual([
      "a",
      "c",
      "b",
      "d",
    ]);
  });
});

describe("selectRecordsByIds", () => {
  it("returns records in the order asked, skipping ids that have no record", () => {
    const records = selectRecordsByIds(db(), [
      "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      "no-such-run",
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    ]);

    expect(records.map((record) => record.config.name)).toEqual([
      "  Ising  manual  ",
      "Ekerå-Håstad RSA-2048",
    ]);
  });

  it("returns nothing for no ids without touching the database", () => {
    expect(selectRecordsByIds(db(), [])).toEqual([]);
  });
});

describe("countRecords", () => {
  it("counts without listing", () => {
    expect(countRecords(db())).toBe(4);
  });
});
