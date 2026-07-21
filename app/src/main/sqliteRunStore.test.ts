// @vitest-environment node

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it } from "vitest";

import { MOCK_RUN_RECORDS } from "../shared/runRecordFixtures.js";
import { RunRecordExistsError } from "../shared/runStore.js";
import type { RunRecord } from "../shared/types.js";
import { SqliteRunStore } from "./sqliteRunStore.js";

const R1 = "11111111-1111-4111-8111-111111111111";
const NEWEST_FIRST = [
  "77777777-7777-4777-8777-777777777777",
  "66666666-6666-4666-8666-666666666666",
  "44444444-4444-4444-8444-444444444444",
  "22222222-2222-4222-8222-222222222222",
  R1,
  "55555555-5555-4555-8555-555555555555",
  "33333333-3333-4333-8333-333333333333",
];

const stores: SqliteRunStore[] = [];
const temporaryDirectories: string[] = [];

function fixture(id: string): RunRecord {
  const record = MOCK_RUN_RECORDS.find((candidate) => candidate.id === id);
  if (record === undefined) throw new Error(`Fixture ${id} is missing.`);
  return record;
}

function openMemoryStore(): SqliteRunStore {
  const store = new SqliteRunStore(":memory:");
  stores.push(store);
  return store;
}

function makeDatabasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), "qre-run-store-"));
  temporaryDirectories.push(directory);
  return join(directory, "nested", "run-history.sqlite");
}

afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("SqliteRunStore schema", () => {
  it("creates a file-backed database, schema, and every required index", () => {
    const databasePath = makeDatabasePath();
    const store = new SqliteRunStore(databasePath);
    store.close();

    expect(existsSync(databasePath)).toBe(true);

    const database = new DatabaseSync(databasePath, { readOnly: true });
    const version = database.prepare("PRAGMA user_version").get();
    const indexes = database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'run_records_%_idx'",
      )
      .all()
      .map((row) => row.name);
    database.close();

    expect(version?.user_version).toBe(1);
    expect(indexes).toEqual(
      expect.arrayContaining([
        "run_records_name_idx",
        "run_records_application_idx",
        "run_records_architecture_idx",
        "run_records_qec_code_idx",
        "run_records_magic_state_factory_idx",
        "run_records_qre_version_idx",
        "run_records_newest_first_idx",
      ]),
    );
  });

  it("reopens an existing database without losing records", async () => {
    const databasePath = makeDatabasePath();
    const first = new SqliteRunStore(databasePath);
    await first.save(fixture(R1));
    first.close();

    const reopened = new SqliteRunStore(databasePath);
    stores.push(reopened);
    expect(await reopened.get(R1)).toEqual(fixture(R1));
  });
});

describe("SqliteRunStore core operations", () => {
  it("saves and retrieves a complete record without changing it", async () => {
    const store = openMemoryStore();
    await store.save(fixture(R1));
    expect(await store.get(R1)).toEqual(fixture(R1));
  });

  it("rejects a duplicate id instead of overwriting the record", async () => {
    const store = openMemoryStore();
    await store.save(fixture(R1));
    const conflictingRecord = structuredClone(fixture(R1));
    conflictingRecord.config.name = "Attempted overwrite";

    await expect(store.save(conflictingRecord)).rejects.toBeInstanceOf(
      RunRecordExistsError,
    );
    expect(await store.get(R1)).toEqual(fixture(R1));
  });

  it("lists sequential saves newest-first", async () => {
    const store = openMemoryStore();
    for (const record of MOCK_RUN_RECORDS) await store.save(record);
    expect((await store.list()).map((record) => record.id)).toEqual(
      NEWEST_FIRST,
    );
  });

  it("returns null for an unknown id and treats deleting one as a no-op", async () => {
    const store = openMemoryStore();
    await store.save(fixture(R1));
    const unknownId = "00000000-0000-4000-8000-000000000000";
    expect(await store.get(unknownId)).toBeNull();
    await store.delete(unknownId);
    expect(await store.get(R1)).toEqual(fixture(R1));
  });

  it("deletes exactly the selected record", async () => {
    const store = openMemoryStore();
    await store.save(fixture(R1));
    await store.save(fixture(NEWEST_FIRST[0]!));
    await store.delete(R1);
    expect(await store.get(R1)).toBeNull();
    expect((await store.list()).map((record) => record.id)).toEqual([
      NEWEST_FIRST[0],
    ]);
  });

  it("returns fresh values so caller mutation cannot change stored data", async () => {
    const store = openMemoryStore();
    await store.save(fixture(R1));

    const firstRead = await store.get(R1);
    firstRead!.config.name = "Changed by caller";

    expect((await store.get(R1))?.config.name).toBe(fixture(R1).config.name);
  });

  it("supports indexed exact-match filters through the complete RunStore surface", async () => {
    const store = openMemoryStore();
    for (const record of MOCK_RUN_RECORDS) await store.save(record);
    expect(
      (
        await store.query({
          application: "shors-factoring",
          architecture: "majorana",
          qecCode: "three_aux",
          magicStateFactory: "round_based",
          qreVersion: "qdk-qre-1.29.1",
        })
      ).map((record) => record.id),
    ).toEqual([NEWEST_FIRST[0]]);
  });

  it("retains the canonical case-insensitive, trimmed name-search semantics", async () => {
    const store = openMemoryStore();
    for (const record of MOCK_RUN_RECORDS) await store.save(record);
    expect(
      (await store.query({ nameSearch: "  GROVER  " })).map(
        (record) => record.id,
      ),
    ).toEqual([NEWEST_FIRST[6]]);
  });
});
