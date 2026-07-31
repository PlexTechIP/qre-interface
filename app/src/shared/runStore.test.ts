/**
 * Run-record contract: fixtures, store semantics, query/filter, immutability,
 * Rerun reconstruction, and a full end-to-end loop (record -> reconstruct ->
 * run -> record -> save -> query). Proves the artifacts are sufficient for
 * Team 1 (History UI) and Team 2 (SQLite store) to build against.
 */

import { describe, expect, it } from "vitest";

import {
  SAMPLE_RUN_RECORDS as MOCK_RUN_RECORDS,
  buildSuccessResult,
  fakeEstimator,
} from "./testing";
import { InMemoryRunStore, RunRecordExistsError } from "./runStore";
import { validateRunRecord } from "./runRecordValidation";
import {
  applicationKey,
  makeRunRecord,
  matchesRunFilter,
  reconstructConfig,
  type RunRecord,
} from "./types";
import { validateRunConfigSchema } from "../renderer/state/schemaValidation";

const R1 = "11111111-1111-4111-8111-111111111111"; // quantum-dynamics, gateBased, round_based, 1.29.1
const R2 = "22222222-2222-4222-8222-222222222222"; // shors, gateBased, litinski19, 1.29.1
const R3 = "33333333-3333-4333-8333-333333333333"; // grovers, gateBased, round_based, 1.28.0, sparse
const R4 = "44444444-4444-4444-8444-444444444444"; // phase, majorana, three_aux, 1.29.1
const R5 = "55555555-5555-4555-8555-555555555555"; // ekera, gateBased, FAILED, 1.29.1
const R6 = "66666666-6666-4666-8666-666666666666"; // shors, gateBased, round_based, 1.29.1
const R7 = "77777777-7777-4777-8777-777777777777"; // shors, majorana, three_aux, 1.29.1

/** newest-first by config.createdAt: R7(14:30) R6(14:00) R4(11:15) R2(10:30) R1(09:00) R5(08:00) R3(prev day). */
const NEWEST_FIRST = [R7, R6, R4, R2, R1, R5, R3];

const byId = (id: string): RunRecord => {
  const rec = MOCK_RUN_RECORDS.find((r) => r.id === id);
  if (!rec) throw new Error(`fixture ${id} missing`);
  return rec;
};

const seededStore = (): InMemoryRunStore => new InMemoryRunStore(MOCK_RUN_RECORDS);

describe("mock run-record fixtures", () => {
  it("ships exactly the seven documented records", () => {
    expect(MOCK_RUN_RECORDS).toHaveLength(7);
    expect(MOCK_RUN_RECORDS.map((r) => r.id).sort()).toEqual([R1, R2, R3, R4, R5, R6, R7]);
  });

  it("every fixture validates against the committed run-record schema", () => {
    for (const record of MOCK_RUN_RECORDS) {
      const { valid, errors } = validateRunRecord(record);
      expect(errors).toBe("");
      expect(valid).toBe(true);
    }
  });

  it("spans the full filter space (architectures, QEC, factories, QRE versions, statuses)", () => {
    const archs = new Set(MOCK_RUN_RECORDS.map((r) => r.config.architecture.type));
    const qecs = new Set(MOCK_RUN_RECORDS.map((r) => r.config.qecCode));
    const factories = new Set(MOCK_RUN_RECORDS.flatMap((r) => r.config.magicStateFactories));
    const versions = new Set(MOCK_RUN_RECORDS.map((r) => r.result.qreVersion));
    const statuses = new Set(MOCK_RUN_RECORDS.map((r) => r.result.status));
    expect(archs).toEqual(new Set(["gateBased", "majorana"]));
    expect(qecs).toEqual(new Set(["surface_code", "three_aux"]));
    expect(factories).toEqual(new Set(["round_based", "litinski19"]));
    expect(versions.size).toBeGreaterThanOrEqual(2);
    expect(statuses).toEqual(new Set(["succeeded", "failed"]));
  });

  it("rejects a schema-invalid record and an id/runId mismatch", () => {
    const good = structuredClone(byId(R1));
    // Break the schema: negative gate time.
    const badSchema = structuredClone(good);
    badSchema.config.architecture = { ...badSchema.config.architecture, type: "gateBased", gateTime: -1 } as never;
    expect(validateRunRecord(badSchema).valid).toBe(false);
    // Break the invariant: id no longer matches config.id/result.runId.
    const badId = structuredClone(good);
    badId.id = R2;
    expect(validateRunRecord(badId).valid).toBe(false);
  });
});

describe("InMemoryRunStore — list / get / delete", () => {
  it("list() returns every seeded record newest-first", async () => {
    const store = seededStore();
    const list = await store.list();
    expect(list.map((r) => r.id)).toEqual(NEWEST_FIRST);
  });

  it("get() returns a record by id and null for an unknown id", async () => {
    const store = seededStore();
    expect((await store.get(R1))?.id).toBe(R1);
    expect(await store.get("00000000-0000-4000-8000-000000000000")).toBeNull();
  });

  it("delete() removes exactly one record; deleting an unknown id is a no-op", async () => {
    const store = seededStore();
    await store.delete(R1);
    expect(await store.get(R1)).toBeNull();
    expect((await store.list()).map((r) => r.id)).toEqual([R7, R6, R4, R2, R5, R3]);
    await store.delete("00000000-0000-4000-8000-000000000000");
    expect(await store.list()).toHaveLength(6);
  });
});

describe("InMemoryRunStore — immutability (write-once)", () => {
  it("save() rejects a duplicate id", async () => {
    const store = seededStore();
    await expect(store.save(byId(R1))).rejects.toBeInstanceOf(RunRecordExistsError);
  });

  it("mutating a record returned by get()/list() cannot corrupt stored state", async () => {
    const store = seededStore();
    const got = await store.get(R1);
    got!.config.name = "HACKED";
    got!.savedAt = "1999-01-01T00:00:00Z";
    expect((await store.get(R1))?.config.name).toBe(byId(R1).config.name);
    const list = await store.list();
    list[0]!.savedAt = "1999-01-01T00:00:00Z";
    expect((await store.list())[0]?.savedAt).not.toBe("1999-01-01T00:00:00Z");
  });

  it("seeding with a duplicate id throws", () => {
    expect(() => new InMemoryRunStore([byId(R1), byId(R1)])).toThrow(RunRecordExistsError);
  });
});

describe("query / filter", () => {
  it("empty filter equals list() (all, newest-first)", async () => {
    const store = seededStore();
    expect((await store.query({})).map((r) => r.id)).toEqual(NEWEST_FIRST);
  });

  it("filters by each field the History surface exposes", async () => {
    const store = seededStore();
    expect((await store.query({ architecture: "majorana" })).map((r) => r.id)).toEqual([R7, R4]);
    expect((await store.query({ qecCode: "three_aux" })).map((r) => r.id)).toEqual([R7, R4]);
    expect((await store.query({ magicStateFactory: "litinski19" })).map((r) => r.id)).toEqual([R2]);
    expect((await store.query({ qreVersion: "qdk-qre-1.28.0" })).map((r) => r.id)).toEqual([R3]);
    expect((await store.query({ application: "quantum-dynamics" })).map((r) => r.id)).toEqual([R1]);
    expect((await store.query({ nameSearch: "GROVER" })).map((r) => r.id)).toEqual([R3]); // case-insensitive
    // The same-benchmark Shor's trio for the Comparison surface, newest-first.
    expect((await store.query({ application: "shors-factoring" })).map((r) => r.id)).toEqual([R7, R6, R2]);
  });

  it("combines filters (intersection), still newest-first", async () => {
    const store = seededStore();
    const got = await store.query({ architecture: "gateBased", qreVersion: "qdk-qre-1.29.1" });
    expect(got.map((r) => r.id)).toEqual([R6, R2, R1, R5]); // R3 is 1.28.0; R4, R7 are majorana
  });

  it("a whitespace-only name search does not constrain", () => {
    expect(matchesRunFilter(byId(R1), { nameSearch: "   " })).toBe(true);
  });

  it("applicationKey distinguishes benchmark ids and uploaded programs", () => {
    expect(applicationKey(byId(R1).config)).toBe("quantum-dynamics");
    const uploaded = structuredClone(byId(R1));
    uploaded.config.application = { type: "uploaded", filePath: "/tmp/prog.qs", format: "qsharp", addToLibrary: true };
    expect(applicationKey(uploaded.config)).toBe("uploaded:/tmp/prog.qs");
  });
});

describe("makeRunRecord", () => {
  it("assembles a record and keys it by config.id", () => {
    const { config, result } = byId(R1);
    const rec = makeRunRecord(config, result, "2026-07-20T00:00:00Z");
    expect(rec.id).toBe(config.id);
    expect(rec.savedAt).toBe("2026-07-20T00:00:00Z");
    expect(validateRunRecord(rec).valid).toBe(true);
  });

  it("throws when result.runId does not match config.id", () => {
    const { config } = byId(R1);
    const foreignResult = byId(R2).result;
    expect(() => makeRunRecord(config, foreignResult, "2026-07-20T00:00:00Z")).toThrow();
  });
});

describe("reconstructConfig (Rerun)", () => {
  const stamp = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", createdAt: "2026-07-20T12:00:00Z" };

  it("stamps a fresh id/createdAt and carries everything else forward", () => {
    const record = byId(R2); // litinski19 — exercises the coupling rules
    const cfg = reconstructConfig(record, stamp);
    expect(cfg.id).toBe(stamp.id);
    expect(cfg.createdAt).toBe(stamp.createdAt);
    const { id: _oid, createdAt: _oc, ...restOriginal } = record.config;
    const { id: _nid, createdAt: _nc, ...restNew } = cfg;
    expect(restNew).toEqual(restOriginal);
  });

  it("produces a config that validates against the frozen RunConfig schema for every record", () => {
    for (const record of MOCK_RUN_RECORDS) {
      const cfg = reconstructConfig(record, stamp);
      expect(validateRunConfigSchema(cfg).valid).toBe(true);
    }
  });
});

describe("end-to-end: record -> reconstruct -> run -> record -> save -> query", () => {
  it("reruns a saved record through the engine boundary and persists the new run", async () => {
    const store = seededStore();
    const engine = fakeEstimator(buildSuccessResult());

    // 1. Rerun: reconstruct a fresh config from a saved record.
    const cfg = reconstructConfig(byId(R1), {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      createdAt: "2026-07-21T09:00:00Z",
    });

    // 2. Execute it through the same EstimatorService the app uses.
    const result = await engine.run(cfg);
    expect(result.runId).toBe(cfg.id);

    // 3. Persist the new run as an immutable record.
    const record = makeRunRecord(cfg, result, "2026-07-21T09:00:03Z");
    expect(validateRunRecord(record).valid).toBe(true);
    await store.save(record);

    // 4. It is retrievable, queryable, and additive (the original still exists).
    expect(await store.get(cfg.id)).toEqual(record);
    expect(await store.list()).toHaveLength(8);
    expect((await store.query({ application: "quantum-dynamics" })).map((r) => r.id)).toContain(cfg.id);
    expect(await store.get(R1)).not.toBeNull(); // the original run is untouched
  });
});
