// @vitest-environment node

/**
 * What every tool must be true of, whoever wrote it.
 *
 * These tests drive hostile text through the whole surface rather than through
 * one handler, because the defect they exist to prevent is a SIXTH tool being
 * added that forgets to escape, forgets to cap, or forwards an exception
 * message. If the guarantee lives below the handlers, adding a tool cannot
 * break it — and this file is what proves the guarantee is really down there.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { SqliteRunStore } from "../main/sqliteRunStore.js";
import { buildRunRecord } from "../shared/testing/builders.js";
import { createMcpServer } from "./createServer.js";
import { resetRunStoreForTests } from "./runStoreAccess.js";

const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);

/** A stored engine failure looks like this — Python stderr and all. */
const ENGINE_STDERR_MESSAGE =
  'Engine process exited with code 1. stderr: Traceback (most recent call last):\n' +
  '  File "/Users/analyst/qre/app/src/main/engine/python/.venv/lib/python3.13/site-packages/qsharp/estimator.py", line 44\n' +
  "RuntimeError: estimation failed. Inspect raw diagnostics and retry.";

const HOSTILE_NAME = `shor${ESC}[2J${BEL}2048`;

// C0 and DEL, minus the whitespace a JSON payload legitimately carries.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTER = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;

let directory: string;
let dbPath: string;
const savedDbPath = process.env.QRE_DB_PATH;

/** Every string anywhere in a value, however deeply nested. */
function everyString(value: unknown, found: string[] = []): string[] {
  if (typeof value === "string") found.push(value);
  else if (Array.isArray(value)) value.forEach((item) => everyString(item, found));
  else if (value && typeof value === "object") {
    Object.values(value).forEach((item) => everyString(item, found));
  }
  return found;
}

/**
 * A client in the state every real one is in: connected, and having already
 * listed the tools.
 *
 * The `listTools()` is load-bearing, not tidiness. The SDK's client only
 * validates a result against a tool's declared `outputSchema` once `tools/list`
 * has populated its validator cache, so a test client that skips it is checking
 * a configuration that does not occur in the field — and for a while that is
 * exactly what these tests did, while every error path was failing for real
 * clients with `-32602`.
 */
async function connectedClient(): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createMcpServer().connect(serverTransport);
  const client = new Client({ name: "boundary-test", version: "0.0.0" });
  await client.connect(clientTransport);
  await client.listTools();
  return client;
}

beforeEach(async () => {
  resetRunStoreForTests();
  directory = mkdtempSync(join(tmpdir(), "qre-boundary-"));
  dbPath = join(directory, "run-history.sqlite");

  const store = new SqliteRunStore(dbPath);
  await store.save(
    buildRunRecord({
      config: { id: "11111111-1111-4111-8111-111111111111", name: HOSTILE_NAME },
    }),
  );
  await store.save(
    buildRunRecord({
      config: {
        id: "22222222-2222-4222-8222-222222222222",
        name: BEL.repeat(500),
      },
      result: {
        status: "failed",
        error: { code: "ENGINE_CRASH", message: ENGINE_STDERR_MESSAGE },
        frontier: null,
      },
    }),
  );
  store.close();

  process.env.QRE_DB_PATH = dbPath;
});

afterEach(() => {
  resetRunStoreForTests();
  if (savedDbPath === undefined) delete process.env.QRE_DB_PATH;
  else process.env.QRE_DB_PATH = savedDbPath;
  rmSync(directory, { recursive: true, force: true });
});

/** Every call an untrusted client can make against the current surface. */
const CALLS: ReadonlyArray<{ name: string; arguments: Record<string, unknown> }> = [
  { name: "qre_list_benchmarks", arguments: {} },
  { name: "qre_list_runs", arguments: {} },
  { name: "qre_get_run", arguments: { id: "11111111-1111-4111-8111-111111111111" } },
  { name: "qre_get_run", arguments: { id: "22222222-2222-4222-8222-222222222222" } },
  { name: "qre_get_run", arguments: { id: `missing${ESC}[2J` } },
  { name: "qre_draft_from_run", arguments: { id: "11111111-1111-4111-8111-111111111111" } },
  { name: "qre_draft_from_run", arguments: { id: `missing${ESC}[2J` } },
];

describe("the tool boundary", () => {
  it("never lets a control character reach the client", async () => {
    const client = await connectedClient();

    for (const call of CALLS) {
      const result = await client.callTool(call);
      for (const text of everyString(result)) {
        expect(
          text,
          `${call.name} returned an unescaped control character`,
        ).not.toMatch(CONTROL_CHARACTER);
      }
    }
  });

  it("never lets a filesystem path reach the client", async () => {
    const client = await connectedClient();

    for (const call of CALLS) {
      const result = await client.callTool(call);
      for (const text of everyString(result)) {
        expect(text, `${call.name} leaked a path`).not.toContain("/Users/analyst");
        expect(text, `${call.name} leaked a venv path`).not.toContain(".venv");
        expect(text, `${call.name} leaked the database path`).not.toContain(directory);
      }
    }
  });

  it("holds its documented bound on a name made entirely of control characters", async () => {
    const client = await connectedClient();

    const result = (await client.callTool({
      name: "qre_get_run",
      arguments: { id: "22222222-2222-4222-8222-222222222222" },
    })) as unknown as { structuredContent: { run: { name: string } } };

    expect([...result.structuredContent.run.name].length).toBeLessThanOrEqual(200);
  });

  it("does not echo an unbounded id back at the caller", async () => {
    const client = await connectedClient();
    const huge = "a".repeat(5000);

    // Whether the schema rejects it or the handler reports it missing, the id
    // itself must not come back — it is the one string the caller controls.
    let texts: string[];
    try {
      texts = everyString(
        await client.callTool({ name: "qre_get_run", arguments: { id: huge } }),
      );
    } catch (error) {
      texts = [error instanceof Error ? error.message : String(error)];
    }

    for (const text of texts) {
      expect(text).not.toContain(huge);
      expect(text.length).toBeLessThan(1000);
    }
  });

  it("declares an output schema for every tool", async () => {
    const client = await connectedClient();

    const { tools } = await client.listTools();

    expect(tools.length).toBeGreaterThan(0);
    for (const tool of tools) {
      expect(tool.outputSchema, `${tool.name} has no outputSchema`).toBeDefined();
    }
  });

  it("returns structured content that conforms to those schemas", async () => {
    const client = await connectedClient();

    // The SDK validates structuredContent against the declared outputSchema and
    // raises a protocol error on a mismatch, so a drifted projection fails here.
    for (const call of CALLS) {
      const result = await client.callTool(call);
      expect(result, `${call.name} produced no result`).toBeDefined();
    }
  });
});
