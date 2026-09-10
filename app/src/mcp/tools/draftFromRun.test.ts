// @vitest-environment node
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { handleDraftFromRun } from "./draftFromRun.js";
import { readToolFailure } from "../toolResult.js";
import { withNoPublishedDatabase } from "../testing/noPublishedDatabase.js";
import type { GeneratedRunDraft } from "../../shared/agentTypes.js";
import { createTempRunStore, seedTempRunStore, removeTempRunStore } from "../testing/tempRunStore.js";
import { resetRunStoreForTests } from "../runStoreAccess.js";
import { buildRunRecord } from "../../shared/testing/builders.js";

function asData(result: Awaited<ReturnType<typeof handleDraftFromRun>>): { draft: GeneratedRunDraft } {
  expect(result.isError).toBeFalsy();
  return result.structuredContent as unknown as { draft: GeneratedRunDraft };
}

function asError(result: Awaited<ReturnType<typeof handleDraftFromRun>>): { code: string; message: string } {
  expect(result.isError).toBe(true);
  // A failure carries its code and message in the text block, never in
  // `structuredContent` — see `toolFailure` for why.
  const failure = readToolFailure(result);
  expect(failure, "failure result was not in the documented shape").not.toBeNull();
  return failure as { code: string; message: string };
}

describe("qre_draft_from_run tool", () => {
  let dbPath: string;

  beforeEach(async () => {
    resetRunStoreForTests();

    const { dbPath: path, store } = await createTempRunStore();
    dbPath = path;

    store.close();
    process.env.QRE_DB_PATH = dbPath;
  });

  afterEach(() => {
    resetRunStoreForTests();
    removeTempRunStore(dbPath);
  });

  it("converts a benchmark run to a draft", async () => {
    resetRunStoreForTests();

    const { dbPath: testDbPath, store } = await createTempRunStore();
    const record = buildRunRecord({
      config: {
        name: "Benchmark Test",
        application: { type: "benchmark", benchmarkId: "quantum-dynamics" },
        architecture: {
          type: "gateBased",
          errorRate: 0.0001,
          gateTime: 50,
          measurementTime: 100,
        },
        magicStateFactories: ["round_based"],
        maxError: 0.5,
      },
    });

    await seedTempRunStore(store, [record]);
    store.close();

    process.env.QRE_DB_PATH = testDbPath;
    const data = asData(await handleDraftFromRun({ id: record.id }));
    const draft = data.draft;
    expect(draft.name).toBe("Benchmark Test");
    expect(draft.application.type).toBe("benchmark");
    expect(draft.architecture.type).toBe("gateBased");
    expect(draft.magicStateFactories).toContain("round_based");
    expect(draft.maxError).toBe(0.5);
  });

  it("converts a manual counts run to a draft", async () => {
    resetRunStoreForTests();

    const { dbPath: testDbPath, store } = await createTempRunStore();
    const record = buildRunRecord({
      config: {
        name: "Manual Run",
        application: {
          type: "manualCounts",
          numQubits: 50,
          tCount: 100,
          rotationCount: 200,
          rotationDepth: 50,
          cczCount: 10,
          ccixCount: 5,
          measurementCount: 50,
        },
        architecture: {
          type: "gateBased",
          errorRate: 0.0001,
          gateTime: 50,
          measurementTime: 100,
        },
      },
    });

    await seedTempRunStore(store, [record]);
    store.close();

    process.env.QRE_DB_PATH = testDbPath;
    const data = asData(await handleDraftFromRun({ id: record.id }));
    expect(data.draft.application.type).toBe("manualCounts");
  });

  it("refuses to draft from an uploaded application", async () => {
    resetRunStoreForTests();

    const { dbPath: testDbPath, store } = await createTempRunStore();
    const record = buildRunRecord({
      config: {
        name: "Uploaded Run",
        application: {
          type: "uploaded",
          filePath: "/path/to/program.qs",
          format: "qsharp",
          addToLibrary: false,
        },
      },
    });

    await seedTempRunStore(store, [record]);
    store.close();

    process.env.QRE_DB_PATH = testDbPath;
    const err = asError(await handleDraftFromRun({ id: record.id }));
    expect(err.code).toBe("DRAFT_UNSUPPORTED");
    expect(err.message.toLowerCase()).toContain("upload");
  });

  it("includes hyperparameters for benchmark runs", async () => {
    resetRunStoreForTests();

    const { dbPath: testDbPath, store } = await createTempRunStore();
    const record = buildRunRecord({
      config: {
        application: { type: "benchmark", benchmarkId: "quantum-dynamics" },
        parameters: {
          latticeN1: 3,
          latticeN2: 3,
          totalTime: 9.0,
        },
      },
    });

    await seedTempRunStore(store, [record]);
    store.close();

    process.env.QRE_DB_PATH = testDbPath;
    const data = asData(await handleDraftFromRun({ id: record.id }));
    expect(data.draft.parameters).toBeDefined();
    expect(data.draft.parameters.latticeN1).toBe(3);
  });

  it("marks a manual counts run as carrying no benchmark parameters", async () => {
    resetRunStoreForTests();

    const { dbPath: testDbPath, store } = await createTempRunStore();
    const record = buildRunRecord({
      config: {
        application: {
          type: "manualCounts",
          numQubits: 50,
          tCount: 100,
          rotationCount: 200,
          rotationDepth: 50,
          cczCount: 10,
          ccixCount: 5,
          measurementCount: 50,
        },
      },
    });

    await seedTempRunStore(store, [record]);
    store.close();

    process.env.QRE_DB_PATH = testDbPath;
    const data = asData(await handleDraftFromRun({ id: record.id }));
    // The contract models `parameters` as one variant per benchmark plus a
    // `none` variant; an empty object matches no variant at all.
    expect(data.draft.parameters).toEqual({ none: true });
  });

  it("ensures draft has no identity fields", async () => {
    resetRunStoreForTests();

    const { dbPath: testDbPath, store } = await createTempRunStore();
    const record = buildRunRecord();

    await seedTempRunStore(store, [record]);
    store.close();

    process.env.QRE_DB_PATH = testDbPath;
    const data = asData(await handleDraftFromRun({ id: record.id }));
    const draft = data.draft as Record<string, unknown>;
    expect(draft).not.toHaveProperty("id");
    expect(draft).not.toHaveProperty("createdAt");
    expect(draft).not.toHaveProperty("qecCode");
    expect(draft).not.toHaveProperty("provenance");
  });

  it("returns 404 for unknown ID", async () => {
    const err = asError(await handleDraftFromRun({ id: "nonexistent-id" }));
    expect(err.code).toBe("RUN_NOT_FOUND");
  });

  it("rejects empty ID", async () => {
    const err = asError(await handleDraftFromRun({ id: "" }));
    expect(err.code).toBe("STORE_READ_FAILED");
  });

  it("fails gracefully when database is not configured", async () => {
    resetRunStoreForTests();
    // Deleting QRE_DB_PATH is only half of the resolution — the
    // dashboard's published pointer is the other half, and on a machine
    // where the app has been launched this read the real history.
    const restore = withNoPublishedDatabase();

    try {
      const err = asError(await handleDraftFromRun({ id: "test-id" }));
      expect(err.code).toBe("DB_NOT_CONFIGURED");
    } finally {
      restore();
    }
  });
});
