// @vitest-environment node

/**
 * What an agent actually sees when a tool fails.
 *
 * These tests exist because of a defect that every unit test passed through:
 * `toolFailure` used to put `{ code, message }` in `structuredContent`, and
 * each tool declares an `outputSchema` describing its SUCCESS payload. The SDK's
 * CLIENT validates `structuredContent` against that schema whenever the field is
 * present — it does not exempt `isError` results, and its validator cache is
 * filled by the `tools/list` every client issues on connect. So each failure was
 * rejected before the caller saw it, and an analyst who asked for a run that did
 * not exist got:
 *
 *     MCP error -32602: Structured content does not match the tool's output
 *     schema: data must have required property 'run'
 *
 * rather than "No run found with ID: …". The messages telling someone to launch
 * the dashboard, or to list again without a cursor, were unreachable in every
 * client that had listed tools — which is all of them.
 *
 * The unit tests missed it because they call handlers directly, and
 * `toolBoundary.test.ts` missed it because its client never called
 * `listTools()`. So the check that matters is the one below: drive each
 * allowlisted code through a client in the state a real client is in, and
 * require a readable failure rather than a thrown protocol error.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { SqliteRunStore } from "../main/sqliteRunStore.js";
import { buildRunRecord } from "../shared/testing/builders.js";
import { createMcpServer } from "./createServer.js";
import { resetRunStoreForTests } from "./runStoreAccess.js";
import { readToolFailure } from "./toolResult.js";
import { withNoPublishedDatabase } from "./testing/noPublishedDatabase.js";

const SEEDED_ID = "11111111-1111-4111-8111-111111111111";

let directory: string;
let dbPath: string;
const savedDbPath = process.env.QRE_DB_PATH;

/**
 * A client that has listed tools, because that is what populates the SDK's
 * output-schema validator and therefore what a real client does.
 */
async function connectedClient(): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createMcpServer().connect(serverTransport);
  const client = new Client({ name: "error-path-test", version: "0.0.0" });
  await client.connect(clientTransport);
  await client.listTools();
  return client;
}

/**
 * Call a tool and insist the failure arrived as a RESULT.
 *
 * A throw here is the defect this file is about: the SDK turns a rejected
 * result into an exception carrying its own schema-validation text, and the
 * handler's message is gone.
 */
async function failureFrom(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<{ code: string; message: string }> {
  let result: CallToolResult;
  try {
    result = (await client.callTool({ name, arguments: args })) as CallToolResult;
  } catch (error) {
    throw new Error(
      `${name} threw instead of returning a failure result: ` +
        `${error instanceof Error ? error.message : String(error)}`,
    );
  }

  expect(result.isError, `${name} did not report a failure`).toBe(true);
  const failure = readToolFailure(result);
  expect(failure, `${name} failure was not in the documented shape`).not.toBeNull();
  return failure as { code: string; message: string };
}

beforeEach(async () => {
  resetRunStoreForTests();
  directory = mkdtempSync(join(tmpdir(), "qre-error-paths-"));
  dbPath = join(directory, "run-history.sqlite");

  const store = new SqliteRunStore(dbPath);
  await store.save(buildRunRecord({ config: { id: SEEDED_ID } }));
  store.close();

  process.env.QRE_DB_PATH = dbPath;
});

afterEach(() => {
  resetRunStoreForTests();
  if (savedDbPath === undefined) delete process.env.QRE_DB_PATH;
  else process.env.QRE_DB_PATH = savedDbPath;
  rmSync(directory, { recursive: true, force: true });
});

describe("a failure reaching a client that has listed tools", () => {
  it("reports a missing run rather than a schema-validation error", async () => {
    const client = await connectedClient();

    const failure = await failureFrom(client, "qre_get_run", { id: "no-such-run" });

    expect(failure.code).toBe("RUN_NOT_FOUND");
    expect(failure.message).toContain("no-such-run");
  });

  it("reports a missing run from qre_draft_from_run too", async () => {
    const client = await connectedClient();

    const failure = await failureFrom(client, "qre_draft_from_run", {
      id: "no-such-run",
    });

    expect(failure.code).toBe("RUN_NOT_FOUND");
  });

  it("reports a malformed cursor", async () => {
    const client = await connectedClient();

    const failure = await failureFrom(client, "qre_list_runs", {
      cursor: "not-a-cursor",
    });

    expect(failure.code).toBe("INVALID_CURSOR");
  });

  it("reports a cursor that no longer points at anything", async () => {
    const client = await connectedClient();
    const stale = Buffer.from(
      JSON.stringify(["2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z", "gone"]),
    ).toString("base64url");

    const failure = await failureFrom(client, "qre_list_runs", { cursor: stale });

    expect(failure.code).toBe("INVALID_CURSOR");
    // The point of this message is that the agent stops paging and starts over.
    expect(failure.message).toContain("without a cursor");
  });

  it("delivers the message that tells an analyst to launch the dashboard", async () => {
    // Deleting QRE_DB_PATH is only half of it: the dashboard's published
    // pointer is the other half, so on a machine where the app has been
    // launched this used to read the developer's real run history.
    const restore = withNoPublishedDatabase();
    try {
      const client = await connectedClient();

      const failure = await failureFrom(client, "qre_list_runs", {});

      expect(failure.code).toBe("DB_NOT_CONFIGURED");
      expect(failure.message).toContain("QRE_DB_PATH");
    } finally {
      restore();
    }
  });

  it("reports a database that is not where it was said to be", async () => {
    process.env.QRE_DB_PATH = join(directory, "absent", "run-history.sqlite");
    const client = await connectedClient();

    const failure = await failureFrom(client, "qre_list_runs", {});

    expect(failure.code).toBe("DB_NOT_FOUND");
  });

  it("reports a database this build cannot read, and says who migrates it", async () => {
    const bump = new DatabaseSync(dbPath);
    bump.exec("PRAGMA user_version = 99");
    bump.close();
    const client = await connectedClient();

    const failure = await failureFrom(client, "qre_list_runs", {});

    expect(failure.code).toBe("DB_SCHEMA_MISMATCH");
    expect(failure.message).toContain("QRE Dashboard");
  });

  it("reports a run that cannot become a draft", async () => {
    resetRunStoreForTests();
    const store = new SqliteRunStore(dbPath);
    const uploaded = buildRunRecord({
      config: {
        id: "22222222-2222-4222-8222-222222222222",
        application: {
          type: "uploaded",
          filePath: "/Users/analyst/programs/shor.qs",
          format: "qsharp",
          addToLibrary: false,
        },
      },
    });
    await store.save(uploaded);
    store.close();

    const client = await connectedClient();
    const failure = await failureFrom(client, "qre_draft_from_run", {
      id: uploaded.id,
    });

    expect(failure.code).toBe("DRAFT_UNSUPPORTED");
    // The refusal explains itself without naming the analyst's file.
    expect(failure.message).not.toContain("/Users/analyst");
  });

  it("still carries no filesystem path and no control character", async () => {
    // eslint-disable-next-line no-control-regex
    const CONTROL_CHARACTER = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;
    const client = await connectedClient();

    const failure = await failureFrom(client, "qre_get_run", {
      id: `missing${String.fromCharCode(27)}[2J/Users/analyst/secret/file`,
    });

    expect(failure.message).not.toMatch(CONTROL_CHARACTER);
    expect(failure.message).not.toContain("/Users/analyst");
  });
});

describe("an invalid draft", () => {
  it("stays a successful result, not a failure", async () => {
    const client = await connectedClient();

    // The whole point of qre_validate_config is that an agent can read what is
    // wrong and try again, so this must not travel as a tool error.
    const result = (await client.callTool({
      name: "qre_validate_config",
      arguments: { draft: { nonsense: true } },
    })) as CallToolResult;

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ valid: false });
  });
});
