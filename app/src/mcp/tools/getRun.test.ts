// @vitest-environment node
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { handleGetRun } from "./getRun.js";
import type { RunDetail } from "../projections.js";
import { createTempRunStore, seedTempRunStore, removeTempRunStore } from "../testing/tempRunStore.js";
import { resetRunStoreForTests, getRunStore } from "../runStoreAccess.js";
import { buildRunRecord } from "../../shared/testing/builders.js";

function asData(result: Awaited<ReturnType<typeof handleGetRun>>): { run: RunDetail } {
  expect(result.isError).toBeFalsy();
  return result.structuredContent as unknown as { run: RunDetail };
}

function asError(result: Awaited<ReturnType<typeof handleGetRun>>): { code: string; message: string } {
  expect(result.isError).toBe(true);
  return result.structuredContent as unknown as { code: string; message: string };
}

describe("qre_get_run tool", () => {
  let dbPath: string;
  let seededId: string;

  beforeEach(async () => {
    resetRunStoreForTests();

    const { dbPath: path, store } = await createTempRunStore();
    dbPath = path;

    const record = buildRunRecord({
      config: {
        name: "Test Run for Get",
        application: { type: "benchmark", benchmarkId: "quantum-dynamics" },
      },
    });
    seededId = record.id;

    await seedTempRunStore(store, [record]);
    store.close();

    process.env.QRE_DB_PATH = dbPath;
  });

  afterEach(() => {
    resetRunStoreForTests();
    removeTempRunStore(dbPath);
  });

  it("retrieves a run by ID", async () => {
    // Use the seeded record from beforeEach
    const allRecords = await getRunStore().list();
    const record = allRecords[0];
    expect(record).toBeDefined();
    if (!record) return;

    const data = asData(await handleGetRun({ id: record.id }));
    expect(data.run.id).toBe(record.id);
  });

  it("returns 404 for unknown ID", async () => {
    const err = asError(await handleGetRun({ id: "nonexistent-id-12345" }));
    expect(err.code).toBe("RUN_NOT_FOUND");
  });

  it("includes key run metadata", async () => {
    const data = asData(await handleGetRun({ id: seededId }));
    const run = data.run;

    expect(run).toHaveProperty("id");
    expect(run).toHaveProperty("name");
    expect(run).toHaveProperty("createdAt");
    expect(run).toHaveProperty("savedAt");
    expect(run).toHaveProperty("startedAt");
    expect(run).toHaveProperty("completedAt");
    expect(run).toHaveProperty("status");
    expect(run).toHaveProperty("architecture");
    expect(run).toHaveProperty("application");
    expect(run).toHaveProperty("qreVersion");
  });

  it("does NOT include result.raw field", async () => {
    const data = asData(await handleGetRun({ id: seededId }));

    const runJson = JSON.stringify(data.run);
    // The raw field should not be serialized
    expect(runJson).not.toContain("engineApi");
    expect(runJson).not.toContain('"raw"');
  });

  it("includes frontier sample and count", async () => {
    const data = asData(await handleGetRun({ id: seededId }));
    const run = data.run;

    expect(run).toHaveProperty("frontierSample");
    expect(run).toHaveProperty("frontierRowCount");
    expect(run.frontierRowCount).toBeGreaterThan(0);
    expect(run.frontierSample).toBeTruthy();
  });

  it("rejects empty ID", async () => {
    const err = asError(await handleGetRun({ id: "" }));
    expect(err.code).toBe("STORE_READ_FAILED");
  });

  it("fails gracefully when database is not configured", async () => {
    resetRunStoreForTests();
    delete process.env.QRE_DB_PATH;

    const err = asError(await handleGetRun({ id: "test-id" }));
    expect(err.code).toBe("DB_NOT_CONFIGURED");
  });
});
