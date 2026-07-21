// @vitest-environment node

/**
 * Part D — Rerun reconstruction wired into the SQLite load path.
 *
 * `reconstructConfig` (contracts/types.ts) is already unit-tested against
 * `InMemoryRunStore` in `app/src/shared/runStore.test.ts`. This suite proves
 * the same guarantee holds through the real `SqliteRunStore`'s `get(id)` ->
 * `reconstructConfig` load path (`loadForRerun`), for every committed record
 * AND for a run captured live through `MockEngine` (not a static fixture),
 * end to end: engine -> save -> get -> reconstruct -> validate -> re-run.
 */

import { randomUUID } from "node:crypto";

import Ajv from "ajv";
import addFormats from "ajv-formats";
import { afterEach, describe, expect, it } from "vitest";

import runConfigSchema from "../shared/contracts/runconfig.schema.json";
import startingConfigFixture from "../shared/contracts/fixtures/runconfig.benchmark.json";
import { MockEngine } from "../shared/mockEngine.js";
import { MOCK_RUN_RECORDS } from "../shared/runRecordFixtures.js";
import {
  makeRunRecord,
  type RunConfig,
  type RunRecord,
} from "../shared/types.js";
import { loadForRerun, RunRecordNotFoundError } from "./rerun.js";
import { SqliteRunStore } from "./sqliteRunStore.js";

const R2 = "22222222-2222-4222-8222-222222222222"; // shors, litinski19 — exercises the coupling rules

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validateRunConfig = ajv.compile(runConfigSchema);

const stores: SqliteRunStore[] = [];

function openMemoryStore(): SqliteRunStore {
  const store = new SqliteRunStore(":memory:");
  stores.push(store);
  return store;
}

async function seed(store: SqliteRunStore): Promise<void> {
  for (const record of MOCK_RUN_RECORDS) await store.save(record);
}

function byId(id: string): RunRecord {
  const record = MOCK_RUN_RECORDS.find((candidate) => candidate.id === id);
  if (record === undefined) throw new Error(`Fixture ${id} is missing.`);
  return record;
}

afterEach(() => {
  for (const store of stores.splice(0)) store.close();
});

describe("loadForRerun — the get(id) -> reconstructConfig load path", () => {
  it("reconstructs a valid, re-runnable RunConfig from every committed record", async () => {
    const store = openMemoryStore();
    await seed(store);
    const engine = new MockEngine({ delayMs: 0 });

    for (const record of MOCK_RUN_RECORDS) {
      const stamp = { id: randomUUID(), createdAt: "2026-07-21T09:00:00Z" };
      const cfg = await loadForRerun(store, record.id, stamp);

      expect(cfg.id).toBe(stamp.id);
      expect(cfg.createdAt).toBe(stamp.createdAt);
      expect(validateRunConfig(cfg)).toBe(true);

      const result = await engine.run(cfg);
      expect(result.runId).toBe(cfg.id);
    }
  });

  it("preserves coupling/availability rules (Litinski19) through the SQLite load path", async () => {
    const store = openMemoryStore();
    await seed(store);
    const stamp = { id: randomUUID(), createdAt: "2026-07-21T09:05:00Z" };

    const cfg = await loadForRerun(store, R2, stamp);

    const { id: _oid, createdAt: _oc, ...restOriginal } = byId(R2).config;
    const { id: _nid, createdAt: _nc, ...restNew } = cfg;
    expect(restNew).toEqual(restOriginal);
  });

  it("throws RunRecordNotFoundError instead of reconstructing from nothing", async () => {
    const store = openMemoryStore();
    await expect(
      loadForRerun(store, "00000000-0000-4000-8000-000000000000", {
        id: randomUUID(),
        createdAt: "2026-07-21T09:00:00Z",
      }),
    ).rejects.toBeInstanceOf(RunRecordNotFoundError);
  });
});

describe("end-to-end with a live capture: engine -> save -> get -> reconstruct -> re-run -> save", () => {
  it("reruns a record captured through MockEngine, not a static fixture, through the real SQLite store", async () => {
    const store = openMemoryStore();
    const engine = new MockEngine({ delayMs: 0 });

    // 1. Capture a real run through the EstimatorService boundary.
    const startingConfig: RunConfig = {
      ...(startingConfigFixture as RunConfig),
      id: randomUUID(),
      createdAt: "2026-07-21T08:00:00Z",
    };
    const capturedResult = await engine.run(startingConfig);
    const capturedRecord = makeRunRecord(
      startingConfig,
      capturedResult,
      "2026-07-21T08:00:02Z",
    );
    await store.save(capturedRecord);

    // 2. Rerun: get(id) -> reconstructConfig through the load path.
    const rerunStamp = { id: randomUUID(), createdAt: "2026-07-21T09:00:00Z" };
    const rerunConfig = await loadForRerun(store, capturedRecord.id, rerunStamp);

    expect(rerunConfig.id).toBe(rerunStamp.id);
    expect(rerunConfig.createdAt).toBe(rerunStamp.createdAt);
    expect(validateRunConfig(rerunConfig)).toBe(true);

    // 3. Execute the reconstructed config through the same engine boundary.
    const rerunResult = await engine.run(rerunConfig);
    expect(rerunResult.runId).toBe(rerunConfig.id);

    // 4. Persist the new run as an additional immutable record; the original
    //    capture is untouched (Rerun makes a new record, never edits one).
    const rerunRecord = makeRunRecord(
      rerunConfig,
      rerunResult,
      "2026-07-21T09:00:02Z",
    );
    await store.save(rerunRecord);

    expect(await store.get(capturedRecord.id)).toEqual(capturedRecord);
    expect(await store.get(rerunRecord.id)).toEqual(rerunRecord);
    expect((await store.list()).map((record) => record.id)).toEqual([
      rerunRecord.id,
      capturedRecord.id,
    ]);
  });
});
