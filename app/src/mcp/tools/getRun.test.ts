// @vitest-environment node
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { handleGetRun } from "./getRun.js";
import { readToolFailure } from "../toolResult.js";
import { withNoPublishedDatabase } from "../testing/noPublishedDatabase.js";
import type { RunDetail } from "../projections.js";
import { createTempRunStore, seedTempRunStore, removeTempRunStore } from "../testing/tempRunStore.js";
import { resetRunStoreForTests, getRunStore } from "../runStoreAccess.js";
import { buildFrontierRow, buildRunRecord } from "../../shared/testing/builders.js";
import type { FieldMetric, FrontierRow } from "../../shared/types.js";

function asData(result: Awaited<ReturnType<typeof handleGetRun>>): { run: RunDetail } {
  expect(result.isError).toBeFalsy();
  return result.structuredContent as unknown as { run: RunDetail };
}

function asError(result: Awaited<ReturnType<typeof handleGetRun>>): { code: string; message: string } {
  expect(result.isError).toBe(true);
  // A failure carries its code and message in the text block, never in
  // `structuredContent` — see `toolFailure` for why.
  const failure = readToolFailure(result);
  expect(failure, "failure result was not in the documented shape").not.toBeNull();
  return failure as { code: string; message: string };
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
    // Deleting QRE_DB_PATH is only half of the resolution — the
    // dashboard's published pointer is the other half, and on a machine
    // where the app has been launched this read the real history.
    const restore = withNoPublishedDatabase();

    try {
      const err = asError(await handleGetRun({ id: "test-id" }));
      expect(err.code).toBe("DB_NOT_CONFIGURED");
    } finally {
      restore();
    }
  });
});

describe("qre_get_run output bounds", () => {
  let dbPath: string;
  let runId: string;
  const savedDbPath = process.env.QRE_DB_PATH;

  /** A frontier row like an engine that reports a great many extra metrics. */
  function floodedFrontierRow(): FrontierRow {
    const additional: Record<string, FieldMetric> = {};
    for (let index = 0; index < 500; index += 1) {
      additional[`engineMetric${index}`] = {
        value: index,
        unit: "qubits",
        display: "x".repeat(5000),
      };
    }
    return buildFrontierRow({
      additional,
      factories: {
        value: Array.from({ length: 400 }, (_unused, index) => ({
          stateType: `T${index}`,
          copies: index,
        })),
        unit: "factories",
        display: "y".repeat(5000),
      },
    });
  }

  beforeEach(async () => {
    resetRunStoreForTests();
    const { dbPath: path, store } = await createTempRunStore();
    dbPath = path;

    const record = buildRunRecord({
      config: { id: "eeeeeeee-eeee-4eee-beee-eeeeeeeeeeee", name: "Flooded" },
      result: { frontier: [floodedFrontierRow(), buildFrontierRow()] },
    });
    runId = record.id;

    await seedTempRunStore(store, [record]);
    store.close();
    process.env.QRE_DB_PATH = dbPath;
  });

  afterEach(() => {
    resetRunStoreForTests();
    if (savedDbPath === undefined) delete process.env.QRE_DB_PATH;
    else process.env.QRE_DB_PATH = savedDbPath;
    removeTempRunStore(dbPath);
  });

  it("returns the run rather than refusing it", async () => {
    // Refusing made the run permanently unreadable over MCP, and said the data
    // "has been truncated" when nothing had been truncated and nothing returned.
    const data = asData(await handleGetRun({ id: runId }));

    expect(data.run.id).toBe(runId);
    expect(data.run.frontierRowCount).toBe(2);
  });

  it("bounds the response", async () => {
    const data = asData(await handleGetRun({ id: runId }));

    expect(JSON.stringify(data).length).toBeLessThan(65536);
  });

  it("says how much of the frontier sample it left out", async () => {
    const data = asData(await handleGetRun({ id: runId }));

    expect(data.run.frontierSampleOmitted).toBeGreaterThan(0);
  });

  it("does not let two long metric names collapse into one", async () => {
    resetRunStoreForTests();
    const { dbPath: collidePath, store } = await createTempRunStore();
    const shared = "engineMetric".repeat(20);
    const record = buildRunRecord({
      config: { id: "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb", name: "Collide" },
      result: {
        frontier: [
          buildFrontierRow({
            additional: {
              [`${shared}AAA`]: { value: 1, unit: "", display: "one" },
              [`${shared}BBB`]: { value: 2, unit: "", display: "two" },
            },
          }),
        ],
      },
    });
    await seedTempRunStore(store, [record]);
    store.close();
    process.env.QRE_DB_PATH = collidePath;

    try {
      const data = asData(await handleGetRun({ id: record.id }));
      const kept = Object.keys(data.run.frontierSample?.additional ?? {});

      // One name may be dropped for being too long, but a value must never be
      // served under a name that belongs to a different metric.
      expect(kept.length + data.run.frontierSampleOmitted).toBe(2);
    } finally {
      resetRunStoreForTests();
      removeTempRunStore(collidePath);
    }
  });

  it("counts a value it could not represent as omitted", async () => {
    resetRunStoreForTests();
    const { dbPath: nestedPath, store } = await createTempRunStore();
    const record = buildRunRecord({
      config: { id: "cccccccc-cccc-4ccc-bccc-cccccccccccc", name: "Nested" },
      result: {
        frontier: [
          buildFrontierRow({
            additional: {
              breakdown: {
                value: [{ deep: true }],
                unit: "",
                display: "structured",
              },
            },
          }),
        ],
      },
    });
    await seedTempRunStore(store, [record]);
    store.close();
    process.env.QRE_DB_PATH = nestedPath;

    try {
      const data = asData(await handleGetRun({ id: record.id }));

      // Flattening a structured value to null is data loss, and the count is
      // what tells the agent it happened.
      expect(data.run.frontierSample?.additional?.breakdown?.value).toBeNull();
      expect(data.run.frontierSampleOmitted).toBeGreaterThan(0);
    } finally {
      resetRunStoreForTests();
      removeTempRunStore(nestedPath);
    }
  });

  it("leaves an ordinary run's frontier sample intact", async () => {
    resetRunStoreForTests();
    const { dbPath: otherPath, store } = await createTempRunStore();
    const record = buildRunRecord({
      config: { id: "dddddddd-dddd-4ddd-bddd-dddddddddddd", name: "Ordinary" },
    });
    await seedTempRunStore(store, [record]);
    store.close();
    process.env.QRE_DB_PATH = otherPath;

    try {
      const data = asData(await handleGetRun({ id: record.id }));

      expect(data.run.frontierSampleOmitted).toBe(0);
      expect(Object.keys(data.run.frontierSample?.additional ?? {})).toEqual([
        "physicalFactoryQubits",
      ]);
    } finally {
      resetRunStoreForTests();
      removeTempRunStore(otherPath);
    }
  });
});
