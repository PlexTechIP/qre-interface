// @vitest-environment node

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it } from "vitest";

import { MOCK_RUN_RECORDS } from "../shared/runRecordFixtures.js";
import { InMemoryRunStore, RunRecordExistsError } from "../shared/runStore.js";
import {
  makeRunRecord,
  type RunFilter,
  type RunRecord,
} from "../shared/types.js";
import { SqliteRunStore } from "./sqliteRunStore.js";

const R1 = "11111111-1111-4111-8111-111111111111";
const R2 = "22222222-2222-4222-8222-222222222222";
const R3 = "33333333-3333-4333-8333-333333333333";
const R4 = "44444444-4444-4444-8444-444444444444";
const R5 = "55555555-5555-4555-8555-555555555555";
const R6 = "66666666-6666-4666-8666-666666666666";
const R7 = "77777777-7777-4777-8777-777777777777";
const NEWEST_FIRST = [R7, R6, R4, R2, R1, R5, R3];

const QUERY_CASES: readonly { label: string; filter: RunFilter }[] = [
  { label: "empty filter", filter: {} },
  { label: "whitespace-only name", filter: { nameSearch: "   " } },
  {
    label: "case-insensitive trimmed name",
    filter: { nameSearch: "  GROVER  " },
  },
  { label: "application", filter: { application: "shors-factoring" } },
  { label: "architecture", filter: { architecture: "majorana" } },
  { label: "QEC code", filter: { qecCode: "three_aux" } },
  { label: "magic-state factory", filter: { magicStateFactory: "litinski19" } },
  {
    label: "authoritative QRE version",
    filter: { qreVersion: "qdk-qre-1.28.0" },
  },
  {
    label: "combined intersection",
    filter: {
      application: "shors-factoring",
      architecture: "gateBased",
      qecCode: "surface_code",
      magicStateFactory: "round_based",
      qreVersion: "qdk-qre-1.29.1",
    },
  },
  { label: "no matches", filter: { application: "not-a-real-application" } },
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

async function seed(store: SqliteRunStore): Promise<void> {
  for (const record of MOCK_RUN_RECORDS) await store.save(record);
}

function mintFromFixture(
  sourceId: string,
  id: string,
  createdAt: string,
  savedAt: string,
): RunRecord {
  const source = fixture(sourceId);
  const config = structuredClone(source.config);
  config.id = id;
  config.createdAt = createdAt;
  const result = structuredClone(source.result);
  result.runId = id;
  return makeRunRecord(config, result, savedAt);
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

describe("Part C — immutable records", () => {
  it("persists a record minted by makeRunRecord and isolates it from later input mutation", async () => {
    const store = openMemoryStore();
    const source = fixture(R1);
    const config = structuredClone(source.config);
    const result = structuredClone(source.result);
    const record = makeRunRecord(config, result, source.savedAt);
    const expected = structuredClone(record);

    expect(record.id).toBe(config.id);
    expect(record.id).toBe(result.runId);
    await store.save(record);

    config.name = "Mutated after save";
    result.qreVersion = "mutated-after-save";
    result.raw!.tampered = true;

    expect(await store.get(record.id)).toEqual(expected);
  });

  it("rejects schema-invalid and identity-mismatched records before they reach disk", async () => {
    const store = openMemoryStore();
    const mismatched = structuredClone(fixture(R1));
    mismatched.id = "88888888-8888-4888-8888-888888888888";

    await expect(store.save(mismatched)).rejects.toThrow(
      /id\/config\.id\/result\.runId mismatch/,
    );

    const invalidConfig = mintFromFixture(
      R1,
      "99999999-9999-4999-8999-999999999999",
      "2026-07-17T09:00:00Z",
      "2026-07-17T09:00:05Z",
    );
    invalidConfig.config.maxError = 0;

    await expect(store.save(invalidConfig)).rejects.toThrow(
      /Cannot save invalid RunRecord/,
    );
    expect(await store.list()).toEqual([]);
  });

  it("keeps an original immutable while accepting a newly minted record with a fresh id", async () => {
    const store = openMemoryStore();
    const original = fixture(R1);
    const fresh = mintFromFixture(
      R1,
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "2026-07-17T10:00:00Z",
      "2026-07-17T10:00:05Z",
    );

    await store.save(original);
    await expect(store.save(original)).rejects.toBeInstanceOf(
      RunRecordExistsError,
    );
    await store.save(fresh);

    expect(await store.get(original.id)).toEqual(original);
    expect(await store.get(fresh.id)).toEqual(fresh);
    expect((await store.list()).map((record) => record.id)).toEqual([
      fresh.id,
      original.id,
    ]);
  });
});

describe("Part C — full-fidelity and edge-case persistence", () => {
  it("round-trips every committed record and its raw payload through a file-backed database", async () => {
    const databasePath = makeDatabasePath();
    const first = new SqliteRunStore(databasePath);
    await seed(first);
    first.close();

    const inspection = new DatabaseSync(databasePath, { readOnly: true });
    expect(inspection.prepare("PRAGMA integrity_check").get()).toEqual({
      integrity_check: "ok",
    });
    inspection.close();

    const reopened = new SqliteRunStore(databasePath);
    stores.push(reopened);

    for (const expected of MOCK_RUN_RECORDS) {
      const actual = await reopened.get(expected.id);
      expect(actual).toEqual(expected);
      expect(JSON.stringify(actual)).toBe(JSON.stringify(expected));
      expect(JSON.stringify(actual?.result.raw)).toBe(
        JSON.stringify(expected.result.raw),
      );
    }
    expect((await reopened.list()).map((record) => record.id)).toEqual(
      NEWEST_FIRST,
    );
  });

  it("persists a failed run intact instead of treating it as missing data", async () => {
    const store = openMemoryStore();
    const failed = fixture(R5);
    await store.save(failed);

    const actual = await store.get(R5);
    expect(actual).toEqual(failed);
    expect(actual?.result.status).toBe("failed");
    expect(actual?.result.frontier).toBeNull();
    expect(actual?.result.error).toEqual(failed.result.error);
    expect(actual?.result.raw).toEqual(failed.result.raw);
  });

  it("preserves a null raw payload when a failed engine produced no output", async () => {
    const store = openMemoryStore();
    const failedWithoutOutput = mintFromFixture(
      R5,
      "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      "2026-07-17T09:30:00Z",
      "2026-07-17T09:30:05Z",
    );
    failedWithoutOutput.result.raw = null;
    await store.save(failedWithoutOutput);

    expect((await store.get(failedWithoutOutput.id))?.result.raw).toBeNull();
  });

  it("preserves an opaque nested raw payload without pruning or reshaping it", async () => {
    const store = openMemoryStore();
    const record = mintFromFixture(
      R1,
      "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      "2026-07-17T09:45:00Z",
      "2026-07-17T09:45:05Z",
    );
    record.result.raw = {
      engine: "future-qre",
      nested: {
        flags: [true, false, null],
        measurements: [
          { name: "logical", value: 0 },
          { name: "physical", value: 42.5 },
        ],
      },
      unknownEngineField: "must survive",
    };
    const expectedRaw = structuredClone(record.result.raw);
    await store.save(record);

    expect((await store.get(record.id))?.result.raw).toEqual(expectedRaw);
  });

  it("preserves forward-compatible fields on the complete RunResult", async () => {
    const store = openMemoryStore();
    const record = mintFromFixture(
      R1,
      "ffffffff-ffff-4fff-8fff-ffffffffffff",
      "2026-07-17T09:50:00Z",
      "2026-07-17T09:50:05Z",
    ) as RunRecord & {
      result: RunRecord["result"] & { futureEngineMetadata: unknown };
    };
    record.result.futureEngineMetadata = {
      producer: "future-qre",
      retained: true,
    };
    await store.save(record);

    const actual = (await store.get(record.id)) as typeof record;
    expect(actual.result.futureEngineMetadata).toEqual(
      record.result.futureEngineMetadata,
    );
    expect(actual).toEqual(record);
  });

  it("persists a sparse one-row run including legitimate zero values", async () => {
    const store = openMemoryStore();
    const sparse = fixture(R3);
    await store.save(sparse);

    const actual = await store.get(R3);
    expect(actual).toEqual(sparse);
    expect(actual?.result.frontier).toHaveLength(1);
    expect(actual?.result.frontier?.[0]?.runtime.value).toBe(0);
    expect(actual?.result.frontier?.[0]?.totalError.value).toBe(0);
    expect(actual?.result.frontier?.[0]?.factories.value).toEqual([]);
  });

  it("isolates get, list, and query results from stored state", async () => {
    const store = openMemoryStore();
    await store.save(fixture(R1));

    const fromGet = await store.get(R1);
    const fromList = await store.list();
    const fromQuery = await store.query({ application: "quantum-dynamics" });
    fromGet!.config.name = "Changed through get";
    fromList[0]!.savedAt = "1999-01-01T00:00:00Z";
    fromQuery[0]!.result.raw!.tampered = true;

    expect(await store.get(R1)).toEqual(fixture(R1));
  });
});

describe("Part C — query parity and deterministic ordering", () => {
  it.each(QUERY_CASES)(
    "matches InMemoryRunStore for $label",
    async ({ filter }) => {
      const sqlite = openMemoryStore();
      const reference = new InMemoryRunStore(MOCK_RUN_RECORDS);
      await seed(sqlite);

      expect(await sqlite.query(filter)).toEqual(await reference.query(filter));
    },
  );

  it("filters uploaded applications by their canonical uploaded:path key", async () => {
    const store = openMemoryStore();
    const uploaded = mintFromFixture(
      R1,
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      "2026-07-17T11:00:00Z",
      "2026-07-17T11:00:05Z",
    );
    uploaded.config.application = {
      type: "uploaded",
      filePath: "/analyst/programs/custom.qs",
      format: "qsharp",
      addToLibrary: true,
    };
    await store.save(uploaded);

    expect(
      (
        await store.query({
          application: "uploaded:/analyst/programs/custom.qs",
        })
      ).map((record) => record.id),
    ).toEqual([uploaded.id]);
  });

  it("filters QRE version from the authoritative result rather than the informational config", async () => {
    const store = openMemoryStore();
    const record = mintFromFixture(
      R1,
      "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      "2026-07-17T12:00:00Z",
      "2026-07-17T12:00:05Z",
    );
    record.config.qreVersion = "informational-config-version";
    await store.save(record);

    expect(
      (await store.query({ qreVersion: record.result.qreVersion })).map(
        (match) => match.id,
      ),
    ).toEqual([record.id]);
    expect(
      await store.query({ qreVersion: "informational-config-version" }),
    ).toEqual([]);
  });

  it("orders equal launch times by savedAt and then id, all descending", async () => {
    const store = openMemoryStore();
    const createdAt = "2026-07-17T13:00:00Z";
    const earlierSave = mintFromFixture(
      R1,
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      createdAt,
      "2026-07-17T13:00:01Z",
    );
    const lowerId = mintFromFixture(
      R1,
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      createdAt,
      "2026-07-17T13:00:02Z",
    );
    const higherId = mintFromFixture(
      R1,
      "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      createdAt,
      "2026-07-17T13:00:02Z",
    );

    await store.save(earlierSave);
    await store.save(lowerId);
    await store.save(higherId);

    const expected = [higherId.id, lowerId.id, earlierSave.id];
    expect((await store.list()).map((record) => record.id)).toEqual(expected);
    expect((await store.query({})).map((record) => record.id)).toEqual(
      expected,
    );
  });
});
