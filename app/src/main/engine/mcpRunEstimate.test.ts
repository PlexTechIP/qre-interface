// @vitest-environment node

/**
 * `qre_run_estimate` against the REAL engine.
 *
 * Every other test of the run tool fakes the estimator, which is right — they
 * are about the order around the engine. This one is about the seam none of
 * them touch: that the MCP server, running outside Electron, can actually find
 * the interpreter, spawn `estimate.py`, and get a frontier back, and that what
 * it saves is a record the read tools can then read.
 *
 * It lives under `engine/` so the `main-node` project excludes it, and it is
 * listed in `vitest.engine.config.ts` — the same place every other real-qdk
 * test is listed. Skipped without `QRE_AVAILABLE`, like its neighbours.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { createMcpServer } from "../../mcp/createServer.js";
import {
  resetEngineAccessForTests,
  setEstimatorForTests,
} from "../../mcp/engineAccess.js";
import { resetRunStoreForTests } from "../../mcp/runStoreAccess.js";
import { SqliteRunStore } from "../sqliteRunStore.js";
import { generatedDraftFromFormState } from "../../renderer/state/generatedDraft.js";
import { formStateFromRunConfig } from "../../renderer/state/formState.js";
import { buildSmallDynamicsConfig } from "../../shared/testing/builders.js";
import { resolvePythonBin } from "./pythonBin.js";

const QRE_AVAILABLE = process.env.QRE_AVAILABLE !== "0";

let directory: string;
let dbPath: string;
let client: Client;
const savedDbPath = process.env.QRE_DB_PATH;
const savedPythonBin = process.env.QRE_PYTHON_BIN;

interface RunEstimateOutput {
  run: {
    id: string;
    status: string;
    frontierSample: { physicalQubits: { value: number } } | null;
    frontierPoints: { physicalQubits: number; runtime: number }[];
  };
  frontier: { points: number } | null;
  saved: boolean;
  warning?: { code: string; message: string };
}

beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), "qre-mcp-real-engine-"));
  dbPath = join(directory, "run-history.sqlite");
  new SqliteRunStore(dbPath).close();

  process.env.QRE_DB_PATH = dbPath;
  // The server resolves this exactly as the dashboard does — which is the
  // point: a config the dashboard emits names this same interpreter.
  process.env.QRE_PYTHON_BIN = resolvePythonBin();

  resetRunStoreForTests();
  resetEngineAccessForTests();
  // No override: the real QreEngine is the subject.
  setEstimatorForTests(null);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createMcpServer({ env: { QRE_MCP_ALLOW_RUNS: "1" } }).connect(serverTransport);
  client = new Client({ name: "real-engine-test", version: "0.0.0" });
  await client.connect(clientTransport);
  await client.listTools();
});

afterAll(async () => {
  await client?.close();
  resetRunStoreForTests();
  resetEngineAccessForTests();
  if (savedDbPath === undefined) delete process.env.QRE_DB_PATH;
  else process.env.QRE_DB_PATH = savedDbPath;
  if (savedPythonBin === undefined) delete process.env.QRE_PYTHON_BIN;
  else process.env.QRE_PYTHON_BIN = savedPythonBin;
  rmSync(directory, { recursive: true, force: true });
});

describe.skipIf(!QRE_AVAILABLE)("qre_run_estimate against the real engine", () => {
  it(
    "runs a small quantum-dynamics estimate and saves a run the read tools see",
    async () => {
      const draft = generatedDraftFromFormState(
        formStateFromRunConfig(buildSmallDynamicsConfig()),
      );

      // The SDK client's default request timeout is 60 s, which a real
      // estimate can exceed. The tool itself blocks; this is the client half
      // of the same two-minute budget.
      const result = (await client.callTool(
        { name: "qre_run_estimate", arguments: { draft } },
        undefined,
        { timeout: 180_000 },
      )) as CallToolResult;

      expect(result.isError).toBeFalsy();
      const output = result.structuredContent as unknown as RunEstimateOutput;

      expect(output.run.status).toBe("succeeded");
      expect(output.saved).toBe(true);
      expect(output.warning).toBeUndefined();
      expect(output.frontier?.points ?? 0).toBeGreaterThan(0);
      // The full result, from the real engine: a representative row and the
      // curve, so the model can report the estimate without another call.
      expect(output.run.frontierSample?.physicalQubits.value ?? 0).toBeGreaterThan(0);
      expect(output.run.frontierPoints.length).toBeGreaterThan(0);

      // Read back through the read-only store's own tool, on its own
      // connection: the append really landed in the analyst's history.
      const read = (await client.callTool({
        name: "qre_get_run",
        arguments: { id: output.run.id },
      })) as CallToolResult;

      expect(read.isError).toBeFalsy();
      expect(read.structuredContent).toMatchObject({
        run: { id: output.run.id, status: "succeeded" },
      });
    },
    240_000,
  );
});
