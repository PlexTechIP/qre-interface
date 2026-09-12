// @vitest-environment node

/**
 * The tool that acts, driven through a real client.
 *
 * Through a client rather than by calling the handler, because half of what
 * this tool promises is about the shape that reaches the caller: a failure with
 * no `structuredContent` (the SDK's client validates that field against the
 * SUCCESS schema and rejects the whole result otherwise), and a success the
 * declared `outputSchema` accepts.
 *
 * The estimator is faked in every test here. What the real engine does is
 * `qreEngine.test.ts`'s subject and `mcpRunEstimate.test.ts`'s; what this file
 * is about is the order around it — what is refused before anything spawns,
 * what happens to a result the history will not take, and what is written down.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { SqliteReadOnlyRunStore } from "../../main/sqliteReadOnlyRunStore.js";
import { SqliteRunStore } from "../../main/sqliteRunStore.js";
import { buildFailedResult, buildRunConfig, buildRunResult } from "../../shared/testing/builders.js";
import { fakeEstimator } from "../../shared/testing/fakeEstimator.js";
import { generatedDraftFromFormState } from "../../renderer/state/generatedDraft.js";
import { formStateFromRunConfig } from "../../renderer/state/formState.js";
import { createMcpServer } from "../createServer.js";
import { resetEngineAccessForTests, setEstimatorForTests } from "../engineAccess.js";
import type { RunDetail } from "../projections.js";
import { RunGate } from "../runBudget.js";
import { resetRunStoreForTests } from "../runStoreAccess.js";
import { readToolFailure } from "../toolResult.js";
import type { EstimatorService, RunSummary } from "../../shared/types.js";
import type { GeneratedRunDraft } from "../../shared/agentTypes.js";

let directory: string;
let dbPath: string;
let client: Client;
const savedDbPath = process.env.QRE_DB_PATH;

const DRAFT = (): GeneratedRunDraft =>
  generatedDraftFromFormState(
    formStateFromRunConfig(
      buildRunConfig({
        name: "agent run",
        application: { type: "benchmark", benchmarkId: "shors-factoring" },
      }),
    ),
  );

interface RunEstimateOutput {
  run: RunDetail;
  frontier: RunSummary["frontier"];
  saved: boolean;
  warning?: { code: string; message: string };
}

async function connect(): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createMcpServer({ env: { QRE_MCP_ALLOW_RUNS: "1" } }).connect(serverTransport);
  const connected = new Client({ name: "run-test", version: "9.9.9" });
  await connected.connect(clientTransport);
  // Load-bearing: this is what populates the SDK client's output-schema
  // validator, and therefore what a real client does.
  await connected.listTools();
  return connected;
}

function callRun(
  draft: unknown,
  on: Client = client,
): Promise<CallToolResult> {
  return on.callTool({
    name: "qre_run_estimate",
    arguments: { draft },
  }) as Promise<CallToolResult>;
}

function successOf(result: CallToolResult): RunEstimateOutput {
  expect(result.isError).toBeFalsy();
  return result.structuredContent as unknown as RunEstimateOutput;
}

/** An estimator that records how many times it was asked to run. */
function countingEstimator(
  inner: Pick<EstimatorService, "run">,
): Pick<EstimatorService, "run"> & { calls: () => number } {
  let calls = 0;
  return {
    async run(config) {
      calls += 1;
      return inner.run(config);
    },
    calls: () => calls,
  };
}

async function countRows(): Promise<number> {
  const store = new SqliteReadOnlyRunStore(dbPath);
  try {
    return (await store.list()).length;
  } finally {
    store.close();
  }
}

beforeEach(async () => {
  resetRunStoreForTests();
  resetEngineAccessForTests();
  directory = mkdtempSync(join(tmpdir(), "qre-run-estimate-"));
  dbPath = join(directory, "run-history.sqlite");

  const store = new SqliteRunStore(dbPath);
  store.close();

  process.env.QRE_DB_PATH = dbPath;
  setEstimatorForTests(fakeEstimator(buildRunResult()));
  client = await connect();
});

afterEach(async () => {
  await client.close();
  resetRunStoreForTests();
  resetEngineAccessForTests();
  if (savedDbPath === undefined) delete process.env.QRE_DB_PATH;
  else process.env.QRE_DB_PATH = savedDbPath;
  rmSync(directory, { recursive: true, force: true });
});

describe("a run that works", () => {
  it("returns the run, saves it, and stamps identity the model never touched", async () => {
    const before = Date.now();
    const output = successOf(await callRun(DRAFT()));

    expect(output.saved).toBe(true);
    expect(output.run.status).toBe("succeeded");
    expect(output.frontier).not.toBeNull();

    // The run IN FULL, so the model can report it without a second call: the
    // settings it ran with, the representative row with every metric, and the
    // curve. The first live test came back with two numbers because the
    // summary was all this carried.
    expect(output.run.settings.maxError).toBe(DRAFT().maxError);
    expect(typeof output.run.frontierSample?.physicalQubits.value).toBe("number");
    expect(typeof output.run.frontierSample?.codeDistance.value).toBe("number");
    expect(output.run.frontierPoints).toHaveLength(output.run.frontierRowCount ?? -1);
    expect(output.run.frontierPointsOmitted).toBe(0);

    const store = new SqliteReadOnlyRunStore(dbPath);
    try {
      const record = await store.get(output.run.id);
      expect(record).not.toBeNull();
      if (record === null) throw new Error("expected a saved record");

      // `model_assisted` and NO `model` key: the server knows which client is
      // calling, never which model is behind it, and a guess would be a wrong
      // answer in a field analysts filter on.
      expect(record.config.provenance).toEqual({ authoredBy: "model_assisted" });
      expect(Object.keys(record.config.provenance ?? {})).toEqual(["authoredBy"]);

      // Minted by the server at execution, not taken from the draft.
      expect(record.config.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      expect(Date.parse(record.config.createdAt)).toBeGreaterThanOrEqual(before);
      expect(Date.parse(record.config.createdAt)).toBeLessThanOrEqual(
        Date.parse(record.savedAt),
      );
    } finally {
      store.close();
    }
  });

  it("saves a FAILED estimate as a normal result rather than as an error", async () => {
    // A failure of the estimate is a finding, and the dashboard saves it. Only
    // a failure of the TOOL is an error.
    setEstimatorForTests(fakeEstimator(buildFailedResult()));

    const output = successOf(await callRun(DRAFT()));

    expect(output.run.status).toBe("failed");
    expect(output.run.error).not.toBeNull();
    expect(output.frontier).toBeNull();
    expect(output.run.frontierPoints).toEqual([]);
    expect(output.saved).toBe(true);
    expect(await countRows()).toBe(1);
  });

  it("round-trips: the saved run drafts back to what was submitted", async () => {
    const submitted = DRAFT();
    const output = successOf(await callRun(submitted));

    const drafted = (await client.callTool({
      name: "qre_draft_from_run",
      arguments: { id: output.run.id },
    })) as CallToolResult;

    expect((drafted.structuredContent as { draft: GeneratedRunDraft }).draft).toEqual(
      submitted,
    );
  });
});

describe("a draft that would not run", () => {
  it("refuses it without starting anything, and hands back the field list", async () => {
    const estimator = countingEstimator(fakeEstimator(buildRunResult()));
    setEstimatorForTests(estimator);

    const result = await callRun({ hello: "world" });

    expect(result.isError).toBe(true);
    const failure = readToolFailure(result);
    expect(failure?.code).toBe("DRAFT_INVALID");
    const errors = (failure?.details as { errors: { field: string }[] }).errors;
    expect(errors[0]?.field).toBeDefined();
    // No structuredContent on a failure: the SDK client validates that field
    // against the SUCCESS schema and would reject the whole result.
    expect(result.structuredContent).toBeUndefined();

    expect(estimator.calls()).toBe(0);
    expect(await countRows()).toBe(0);
  });

  it("refuses a draft the pipeline would silently change", async () => {
    // The same refusal `qre_validate_config` reports: running a draft the
    // adapters would repair means running something the caller did not ask for.
    const estimator = countingEstimator(fakeEstimator(buildRunResult()));
    setEstimatorForTests(estimator);

    const result = await callRun({ ...DRAFT(), magicStateFactories: [] });

    expect(readToolFailure(result)?.code).toBe("DRAFT_INVALID");
    expect(estimator.calls()).toBe(0);
  });
});

describe("a machine that cannot run an estimate", () => {
  it("says so before the queue, naming the variable to set", async () => {
    setEstimatorForTests(null);
    const savedPythonBin = process.env.QRE_PYTHON_BIN;
    // A real file that is not executable, so the check under test is the X_OK
    // one rather than a missing path.
    process.env.QRE_PYTHON_BIN = dbPath;

    try {
      const failure = readToolFailure(await callRun(DRAFT()));
      expect(failure?.code).toBe("ENGINE_NOT_CONFIGURED");
      expect(failure?.message).toMatch(/QRE_PYTHON_BIN/);
    } finally {
      if (savedPythonBin === undefined) delete process.env.QRE_PYTHON_BIN;
      else process.env.QRE_PYTHON_BIN = savedPythonBin;
    }
  });
});

describe("more than one call at a time", () => {
  it("runs one, queues one, and refuses the third", async () => {
    setEstimatorForTests(fakeEstimator(buildRunResult(), { delayMs: 200 }));

    const results = await Promise.all([
      callRun(DRAFT()),
      callRun(DRAFT()),
      callRun(DRAFT()),
    ]);

    const codes = results.map((result) => readToolFailure(result)?.code);
    expect(codes.filter((code) => code === "RUN_BUSY")).toHaveLength(1);
    expect(results.filter((result) => !result.isError)).toHaveLength(2);
    // The refused one really was refused: two rows, not three.
    expect(await countRows()).toBe(2);
  });

  it("refuses once the rate budget is spent", async () => {
    resetEngineAccessForTests({ gate: new RunGate({ maxPerMinute: 2 }) });
    setEstimatorForTests(fakeEstimator(buildRunResult()));

    await callRun(DRAFT());
    await callRun(DRAFT());
    const third = await callRun(DRAFT());

    const failure = readToolFailure(third);
    expect(failure?.code).toBe("RUN_BUDGET_EXCEEDED");
    expect(await countRows()).toBe(2);
  });
});

describe("a history that will not take the run", () => {
  it("never discards a finished estimate: saved false, with a warning", async () => {
    resetRunStoreForTests({
      appendOptions: { busyTimeoutMs: 50, busyRetries: 2, sleep: async () => {} },
    });
    setEstimatorForTests(fakeEstimator(buildRunResult()));

    // Another connection holding the write lock, as the dashboard would.
    const blocker = new DatabaseSync(dbPath, { timeout: 5_000 });
    blocker.exec("BEGIN IMMEDIATE");
    blocker.exec(
      "INSERT INTO run_records (id, schema_version, record_json, name, application, architecture, qec_code, magic_state_factory, qre_version, created_at, saved_at) VALUES ('blocker','1.4.0','{}','n','a','gateBased','surface_code','|round_based|','v','t','t')",
    );

    let output: RunEstimateOutput;
    try {
      const result = await callRun(DRAFT());
      // Not an error: the analyst's laptop really did spend the time, and this
      // reply is the only copy of what it found.
      expect(result.isError).toBeFalsy();
      output = successOf(result);
    } finally {
      blocker.exec("ROLLBACK");
      blocker.close();
    }

    expect(output.saved).toBe(false);
    expect(output.warning?.code).toBe("DB_LOCKED");
    expect(output.run.id).toBeTruthy();
    expect(output.run.status).toBe("succeeded");

    // The warning's code is what the log records for a run that finished and
    // could not be saved — the field is typed to carry it, not cast into it.
    const entry = JSON.parse(
      readFileSync(join(directory, "mcp-invocations.jsonl"), "utf8").trimEnd(),
    ) as Record<string, unknown>;
    expect(entry).toMatchObject({
      status: "succeeded",
      saved: false,
      code: "DB_LOCKED",
      runId: output.run.id,
    });
  });

  it("refuses before running when the database is at an unknown schema", async () => {
    const raw = new DatabaseSync(dbPath);
    raw.exec("PRAGMA user_version = 99");
    raw.close();
    resetRunStoreForTests();

    const estimator = countingEstimator(fakeEstimator(buildRunResult()));
    setEstimatorForTests(estimator);

    const failure = readToolFailure(await callRun(DRAFT()));

    expect(failure?.code).toBe("DB_SCHEMA_MISMATCH");
    // The point of the preflight: two minutes are not spent on a database that
    // was never going to accept the row.
    expect(estimator.calls()).toBe(0);
  });
});

describe("the invocation log", () => {
  it("records the call beside the database, naming the client and the gate", async () => {
    const output = successOf(await callRun(DRAFT()));

    const logPath = join(directory, "mcp-invocations.jsonl");
    expect(existsSync(logPath)).toBe(true);

    const lines = readFileSync(logPath, "utf8").trimEnd().split("\n");
    const entry = JSON.parse(lines[lines.length - 1] ?? "") as Record<string, unknown>;

    expect(entry).toMatchObject({
      tool: "qre_run_estimate",
      client: { name: "run-test", version: "9.9.9" },
      gate: "env_opt_in",
      consent: "not_elicited",
      status: "succeeded",
      saved: true,
      runId: output.run.id,
    });
    // The draft itself is never written down — only a fingerprint of it.
    expect(JSON.stringify(entry)).not.toContain("agent run");
    expect(entry.argsDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("records a refusal, which History cannot show", async () => {
    await callRun({ hello: "world" });

    const logPath = join(directory, "mcp-invocations.jsonl");
    const entry = JSON.parse(
      readFileSync(logPath, "utf8").trimEnd().split("\n")[0] ?? "",
    ) as Record<string, unknown>;

    expect(entry).toMatchObject({
      status: "refused",
      code: "DRAFT_INVALID",
      saved: false,
      runId: null,
    });
  });
});

describe("shutting down mid-run", () => {
  it("does not persist a failure the analyst caused by quitting", async () => {
    const { stopEngineForShutdown } = await import("../engineAccess.js");
    setEstimatorForTests({
      async run(config) {
        // The server begins shutting down while the engine is working; a
        // SIGKILLed child would report ENGINE_CRASH.
        stopEngineForShutdown();
        return fakeEstimator(buildFailedResult()).run(config);
      },
    });

    const failure = readToolFailure(await callRun(DRAFT()));

    expect(failure?.code).toBe("RUN_FAILED");
    expect(await countRows()).toBe(0);
  });

  it("still names the run that burned the time, in the log", async () => {
    // A run that reached the engine and was then discarded must not be
    // recorded as though it never started: `runId: null` in an audit log is
    // indistinguishable from a call that was refused up front.
    const { stopEngineForShutdown } = await import("../engineAccess.js");
    setEstimatorForTests({
      async run(config) {
        stopEngineForShutdown();
        return fakeEstimator(buildRunResult()).run(config);
      },
    });

    await callRun(DRAFT());

    const entry = JSON.parse(
      readFileSync(join(directory, "mcp-invocations.jsonl"), "utf8")
        .trimEnd()
        .split("\n")[0] ?? "",
    ) as Record<string, unknown>;

    expect(entry.code).toBe("RUN_FAILED");
    expect(entry.runId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("never spawns for a queued call once shutdown has begun", async () => {
    /*
     * The orphan case. A run holding the slot is killed by
     * `stopEngineForShutdown()`, releases, and hands the slot to the call
     * queued behind it. If that call goes on to spawn, its Python child is one
     * `killLiveEngineProcesses()` has already swept past: it outlives the
     * two-second shutdown grace, is reparented when the process exits, and runs
     * a full estimate with nothing left to stop it.
     *
     * The property is therefore about the ESTIMATOR CALL COUNT, not about the
     * result: the second call must be refused before it reaches the engine.
     */
    const { stopEngineForShutdown } = await import("../engineAccess.js");
    let calls = 0;
    setEstimatorForTests({
      async run(config) {
        calls += 1;
        if (calls === 1) {
          // Long enough for the second call to be admitted and queued behind
          // this one before the server starts going away.
          await new Promise((resolve) => setTimeout(resolve, 100));
          stopEngineForShutdown();
        }
        return fakeEstimator(buildRunResult()).run(config);
      },
    });

    const [first, second] = await Promise.all([callRun(DRAFT()), callRun(DRAFT())]);

    expect(calls).toBe(1);
    expect(readToolFailure(first)?.code).toBe("RUN_FAILED");
    expect(readToolFailure(second)?.code).toBe("RUN_FAILED");
    // The two refusals are distinguishable, because they mean different
    // things: one run was stopped, the other was never begun.
    expect(readToolFailure(first)?.message).toMatch(/the run was stopped/);
    expect(readToolFailure(second)?.message).toMatch(/nothing was started/);
    expect(await countRows()).toBe(0);
  });
});

describe("a hostile draft name", () => {
  it("is sanitised in the result and kept verbatim in the record", async () => {
    const ESC = String.fromCharCode(27);
    const name = `shor${ESC}[2J 2048`;

    const output = successOf(await callRun({ ...DRAFT(), name }));

    // Escaped on the way out, because an agent's context is a place a terminal
    // escape sequence is an injection vector.
    expect(output.run.name).not.toContain(ESC);
    expect(output.run.name).toContain("\\x1b");

    const store = new SqliteReadOnlyRunStore(dbPath);
    try {
      const record = await store.get(output.run.id);
      // The store holds what the analyst will see in the dashboard, unaltered.
      expect(record?.config.name).toBe(name);
    } finally {
      store.close();
    }
  });
});

describe("when runs are not enabled", () => {
  it("has no tool to call at all", async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await createMcpServer({ env: {} }).connect(serverTransport);
    const readOnly = new Client({ name: "read-only-test", version: "0.0.0" });
    await readOnly.connect(clientTransport);
    await readOnly.listTools();

    try {
      const { tools } = await readOnly.listTools();
      expect(tools.map((tool) => tool.name)).not.toContain("qre_run_estimate");

      // And calling it anyway is answered by the SDK as "no such tool", which
      // is the honest answer: there is no handler to refuse.
      const result = await callRun(DRAFT(), readOnly);
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result.content)).toMatch(/not found/i);
    } finally {
      await readOnly.close();
    }
  });
});
