// @vitest-environment node
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { handleListRuns, type ListRunsInput, type ListRunsOutput } from "./listRuns.js";
import { createTempRunStore, seedTempRunStore, removeTempRunStore } from "../testing/tempRunStore.js";
import { resetRunStoreForTests } from "../runStoreAccess.js";
import { buildRunRecord } from "../../shared/testing/builders.js";
import type { RunRecord } from "../../shared/types.js";
import { DatabaseSync } from "node:sqlite";

function asData(result: Awaited<ReturnType<typeof handleListRuns>>): ListRunsOutput {
  expect(result.isError).toBeFalsy();
  return result.structuredContent as unknown as ListRunsOutput;
}

function asError(result: Awaited<ReturnType<typeof handleListRuns>>): { code: string; message: string } {
  expect(result.isError).toBe(true);
  return result.structuredContent as unknown as { code: string; message: string };
}

describe("qre_list_runs tool", () => {
  let dbPath: string;
  let testRecords: RunRecord[];

  beforeEach(async () => {
    resetRunStoreForTests();

    const { dbPath: path, store } = await createTempRunStore();
    dbPath = path;

    // Create diverse test records with unique IDs
    testRecords = [
      buildRunRecord({
        config: {
          id: "aaaaaaaa-aaaa-4aaa-baaa-aaaaaaaaaaaa",
          name: "Shor Benchmark Run",
          application: { type: "benchmark", benchmarkId: "shors-factoring" },
          architecture: { type: "gateBased", errorRate: 0.0001, gateTime: 50, measurementTime: 100 },
          qecCode: "surface_code",
          magicStateFactories: ["round_based"],
        },
        savedAt: "2026-08-01T10:00:00Z",
      }),
      buildRunRecord({
        config: {
          id: "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",
          name: "Quantum Dynamics Majorana",
          application: { type: "benchmark", benchmarkId: "quantum-dynamics" },
          architecture: { type: "majorana", errorRate: 0.00001, operationTime: 1000 },
          qecCode: "three_aux",
          magicStateFactories: ["round_based"],
        },
        savedAt: "2026-08-01T11:00:00Z",
      }),
      buildRunRecord({
        config: {
          id: "cccccccc-cccc-4ccc-cccc-cccccccccccc",
          name: "Manual Counts Test",
          application: { type: "manualCounts", numQubits: 100, tCount: 1000, rotationCount: 500, rotationDepth: 250, cczCount: 100, ccixCount: 50, measurementCount: 100 },
          architecture: { type: "gateBased", errorRate: 0.0001, gateTime: 50, measurementTime: 100 },
          qecCode: "surface_code",
          magicStateFactories: ["round_based"],
        },
        savedAt: "2026-08-01T12:00:00Z",
      }),
      buildRunRecord({
        config: {
          id: "dddddddd-dddd-4ddd-dddd-dddddddddddd",
          name: "Very Long Run Name That Should Be Capped At Two Hundred Unicode Code Points If It Exceeds That Limit But This One Just Barely Does Not Exceed It Yet So Lets Add More Text Here To Actually Make It Exceed The Limit And Then It",
          application: { type: "benchmark", benchmarkId: "grovers-search" },
          architecture: { type: "neutralAtom", rydbergTime: 500, rydbergError: 0.001, singleQubitTime: 1000, singleQubitError: 0.0001, measurementTime: 10000, measurementError: 0.0001, handoffTime: 0, atomSpacing: 3.0, maxVelocity: 0.25, maxAcceleration: 5000.0, surfaceCodeOneQubitTimeFactor: 1, surfaceCodeTwoQubitTimeFactor: 1 },
          qecCode: "low_move_surface_code",
          magicStateFactories: ["round_based"],
        },
        savedAt: "2026-08-01T13:00:00Z",
      }),
    ];

    await seedTempRunStore(store, testRecords);
    store.close();

    // Point to the temp database
    process.env.QRE_DB_PATH = dbPath;
  });

  afterEach(() => {
    resetRunStoreForTests();
    removeTempRunStore(dbPath);
  });

  it("returns runs with default limit", async () => {
    const data = asData(await handleListRuns({}));

    expect(Array.isArray(data.runs)).toBe(true);
    expect(data.runs.length).toBeLessThanOrEqual(25);
    expect(typeof data.totalMatched).toBe("number");
  });

  it("respects the limit parameter", async () => {
    const data = asData(await handleListRuns({ limit: 2 }));

    expect(data.runs.length).toBe(2);
    expect(data.nextCursor).toBeDefined();
  });

  it("rejects out-of-range limits", async () => {
    asError(await handleListRuns({ limit: 0 }));

    const dataTooHigh = asData(await handleListRuns({ limit: 200 }));
    expect(dataTooHigh.runs.length).toBeLessThanOrEqual(100);
  });

  it("filters by application type", async () => {
    const data = asData(
      await handleListRuns({
        limit: 100,
        filter: { applicationType: "benchmark" },
      }),
    );

    const benchmarkRuns = data.runs.filter((r) => r.application.type === "benchmark");
    expect(benchmarkRuns.length).toBe(data.runs.length);
  });

  it("filters by benchmark ID", async () => {
    const data = asData(
      await handleListRuns({
        limit: 100,
        filter: { applicationType: "benchmark", benchmarkId: "shors-factoring" },
      }),
    );

    for (const run of data.runs) {
      expect(run.application.type).toBe("benchmark");
      if (run.application.type === "benchmark") {
        expect(run.application.benchmarkId).toBe("shors-factoring");
      }
    }
  });

  it("filters by architecture", async () => {
    const data = asData(
      await handleListRuns({
        limit: 100,
        filter: { architecture: "majorana" },
      }),
    );

    for (const run of data.runs) {
      expect(run.architecture).toBe("majorana");
    }
  });

  it("performs pagination with cursor", async () => {
    const page1 = asData(await handleListRuns({ limit: 2 }));
    expect(page1.runs.length).toBe(2);
    expect(page1.nextCursor).toBeDefined();

    const page2 = asData(await handleListRuns({ limit: 2, cursor: page1.nextCursor }));
    expect(page2.runs.length).toBeGreaterThan(0);

    // Ensure no overlap
    const page1Ids = new Set(page1.runs.map((r) => r.id));
    for (const run of page2.runs) {
      expect(page1Ids.has(run.id)).toBe(false);
    }
  });

  it("allows iterating through all pages", async () => {
    const allIds = new Set<string>();
    let cursor: string | undefined;

    for (;;) {
      const input: ListRunsInput = cursor !== undefined ? { limit: 2, cursor } : { limit: 2 };
      const data = asData(await handleListRuns(input));

      for (const run of data.runs) {
        expect(allIds.has(run.id)).toBe(false); // No duplicates
        allIds.add(run.id);
      }

      if (data.nextCursor === undefined) break;
      cursor = data.nextCursor;
    }

    expect(allIds.size).toBe(testRecords.length);
  });

  it("rejects malformed cursors", async () => {
    const err = asError(
      await handleListRuns({
        cursor: "not-valid-base64url!!!",
      }),
    );
    expect(err.code).toBe("INVALID_CURSOR");
  });

  it("caps long run names", async () => {
    const data = asData(await handleListRuns({ limit: 100 }));

    for (const run of data.runs) {
      // Names should be capped at 200 code points
      expect(run.name.length).toBeLessThanOrEqual(201); // 200 + ellipsis char
    }
  });

  it("performs case-insensitive name search", async () => {
    const data = asData(
      await handleListRuns({
        limit: 100,
        filter: { nameSearch: "QUANTUM" },
      }),
    );

    expect(data.runs.length).toBeGreaterThan(0);
    for (const run of data.runs) {
      expect(run.name.toLowerCase()).toContain("quantum");
    }
  });

  it("returns totalMatched count", async () => {
    const data = asData(await handleListRuns({ limit: 2 }));

    expect(typeof data.totalMatched).toBe("number");
    expect(data.totalMatched).toBe(testRecords.length);
  });

  it("omits nextCursor when no more results", async () => {
    const data = asData(await handleListRuns({ limit: 100 }));

    expect(data.runs.length).toBe(testRecords.length);
    expect(data.nextCursor).toBeUndefined();
    expect("nextCursor" in data).toBe(false);
  });


  it("applies a benchmarkId filter on its own", async () => {
    // benchmarkId and applicationType are independent optional fields, so this
    // is a legal call — and it used to match every run in the store.
    const data = asData(
      await handleListRuns({ filter: { benchmarkId: "no-such-benchmark" } }),
    );

    expect(data.totalMatched).toBe(0);
    expect(data.runs).toHaveLength(0);
  });

  it("returns only the named benchmark when filtering by id alone", async () => {
    const data = asData(
      await handleListRuns({ filter: { benchmarkId: "shors-factoring" } }),
    );

    expect(data.runs.map((run) => run.name)).toEqual(["Shor Benchmark Run"]);
  });

  it("still supports the coarse applicationType filter on its own", async () => {
    const benchmarks = asData(
      await handleListRuns({ filter: { applicationType: "benchmark" } }),
    );
    const manual = asData(
      await handleListRuns({ filter: { applicationType: "manualCounts" } }),
    );

    expect(benchmarks.totalMatched).toBe(3);
    expect(manual.runs.map((run) => run.name)).toEqual(["Manual Counts Test"]);
  });

  it("matches nothing when the two application filters contradict each other", async () => {
    const data = asData(
      await handleListRuns({
        filter: { applicationType: "manualCounts", benchmarkId: "shors-factoring" },
      }),
    );

    expect(data.totalMatched).toBe(0);
  });

  it("reports a cursor whose run is gone instead of restarting", async () => {
    const staleCursor = Buffer.from(
      JSON.stringify([
        "2020-01-01T00:00:00.000Z",
        "2020-01-01T00:00:00.000Z",
        "deleted-run",
      ]),
      "utf8",
    ).toString("base64url");

    const err = asError(await handleListRuns({ limit: 2, cursor: staleCursor }));

    expect(err.code).toBe("INVALID_CURSOR");
  });

  it("is not brought down by an unreadable record outside the requested page", async () => {
    // A record saved by a future build validates against a contract this one
    // does not know. Only the page being returned should be validated, so a
    // bad record further down the history must not fail the whole call.
    const database = new DatabaseSync(dbPath);
    const row = database.prepare("SELECT * FROM run_records LIMIT 1").get() as {
      record_json: string;
      name: string;
      application: string;
      architecture: string;
      qec_code: string;
      magic_state_factory: string;
      qre_version: string;
    };
    const future = JSON.parse(row.record_json) as Record<string, unknown>;
    future.schemaVersion = "99.0.0";
    future.id = "ffffffff-ffff-4fff-bfff-ffffffffffff";
    database
      .prepare(
        `INSERT INTO run_records (id, schema_version, record_json, name, application,
           architecture, qec_code, magic_state_factory, qre_version, created_at, saved_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "ffffffff-ffff-4fff-bfff-ffffffffffff",
        "99.0.0",
        JSON.stringify(future),
        row.name,
        row.application,
        row.architecture,
        row.qec_code,
        row.magic_state_factory,
        row.qre_version,
        "1999-01-01T00:00:00Z",
        "1999-01-01T00:00:00Z",
      );
    database.close();

    const data = asData(await handleListRuns({ limit: 2 }));

    expect(data.runs).toHaveLength(2);
  });

  it("cannot be used to probe for uploaded file paths", async () => {
    // `applicationKey` renders an uploaded run as `uploaded:<absolute path>`.
    // Passing that form as a benchmarkId used to reach the store filter, which
    // turned this tool into an oracle for testing whether a given file on the
    // analyst's disk had ever been run.
    const { dbPath: probePath, store } = await createTempRunStore();
    await seedTempRunStore(store, [
      buildRunRecord({
        config: {
          id: "99999999-9999-4999-b999-999999999999",
          name: "Uploaded",
          application: {
            type: "uploaded",
            filePath: "/Users/analyst/secret-program.qs",
            format: "qsharp",
            addToLibrary: false,
          },
        },
      }),
    ]);
    store.close();
    resetRunStoreForTests();
    process.env.QRE_DB_PATH = probePath;

    try {
      const hit = asData(
        await handleListRuns({
          filter: { benchmarkId: "uploaded:/Users/analyst/secret-program.qs" },
        }),
      );
      const miss = asData(
        await handleListRuns({
          filter: { benchmarkId: "uploaded:/Users/analyst/no-such-file.qs" },
        }),
      );

      // Indistinguishable: the tool must not answer questions about paths.
      expect(hit.totalMatched).toBe(0);
      expect(miss.totalMatched).toBe(0);
    } finally {
      resetRunStoreForTests();
      removeTempRunStore(probePath);
      process.env.QRE_DB_PATH = dbPath;
    }
  });

  it("fails gracefully when database is not configured", async () => {
    resetRunStoreForTests();
    delete process.env.QRE_DB_PATH;

    const err = asError(await handleListRuns({}));
    expect(err.code).toBe("DB_NOT_CONFIGURED");
  });
});
