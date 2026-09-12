// @vitest-environment node

/**
 * What a client learns about this server before it calls anything.
 *
 * The instructions and the draft-contract resource exist because an agent had
 * no way to know what a draft looks like: the tool's input schema is
 * deliberately loose, so a from-scratch draft was a guess corrected one field
 * per call.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import generationSchema from "../shared/contracts/runconfig-generation.schema.json" with { type: "json" };
import {
  READ_ONLY_SENTENCE,
  RUN_DRAFT_SCHEMA_URI,
  RUN_SENTENCE,
  createMcpServer,
} from "./createServer.js";
import { resetRunStoreForTests } from "./runStoreAccess.js";
import { withNoPublishedDatabase } from "./testing/noPublishedDatabase.js";

let client: Client;
let restoreEnvironment: () => void;

beforeEach(async () => {
  restoreEnvironment = withNoPublishedDatabase();
  resetRunStoreForTests();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  // `env: {}` rather than the process's own: a developer who exported
  // QRE_MCP_ALLOW_RUNS=1 to try the run tool would otherwise silently flip
  // every assertion in this file about the default surface.
  await createMcpServer({ env: {} }).connect(serverTransport);
  client = new Client({ name: "surface-test", version: "0.0.0" });
  await client.connect(clientTransport);
  await client.listTools();
});

afterEach(async () => {
  // Restore in a `finally`, and tolerate a client that was never assigned: a
  // `beforeEach` that throws after `withNoPublishedDatabase()` has redirected
  // HOME leaves `client` undefined, and a TypeError here would abort the
  // teardown and leave every later test in this file reading a temporary home.
  try {
    // Cast because TypeScript cannot see that a module-level `let` is unset
    // when `beforeEach` threw before assigning it.
    await (client as Client | undefined)?.close();
  } finally {
    resetRunStoreForTests();
    restoreEnvironment();
  }
});

describe("what the server says about itself", () => {
  it("tells the client where to start and whether anything here can act", () => {
    const instructions = client.getInstructions();

    expect(instructions).toMatch(/qre_list_runs/);
    expect(instructions).toMatch(/only source of run ids/i);
    expect(instructions).toMatch(/Nothing here runs an estimate/);
    expect(instructions).toContain(RUN_DRAFT_SCHEMA_URI);
  });

  it("serves the committed draft contract as a resource", async () => {
    const listed = await client.listResources();
    expect(listed.resources.map((resource) => resource.uri)).toContain(RUN_DRAFT_SCHEMA_URI);

    const read = await client.readResource({ uri: RUN_DRAFT_SCHEMA_URI });
    const [contents] = read.contents;
    expect(contents).toBeDefined();
    if (contents === undefined || !("text" in contents)) throw new Error("expected text contents");

    // Byte-for-byte the artifact the handler validates against, so a caller
    // that follows it cannot be refused on structure.
    expect(JSON.parse(contents.text)).toEqual(generationSchema);
  });

  it("points qre_validate_config's description at the draft's shape", async () => {
    const { tools } = await client.listTools();
    const validate = tools.find((tool) => tool.name === "qre_validate_config");

    expect(validate?.description).toMatch(/Every top-level key is required/);
    expect(validate?.description).toContain(RUN_DRAFT_SCHEMA_URI);
  });
});

describe("the run tool's registration", () => {
  /** A second client, against a server built with whatever environment. */
  async function connect(env: NodeJS.ProcessEnv) {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await createMcpServer({ env }).connect(serverTransport);
    const connected = new Client({ name: "surface-test", version: "0.0.0" });
    await connected.connect(clientTransport);
    return connected;
  }

  it("is not listed at all without the opt-in", async () => {
    const listed = await client.listTools();

    expect(listed.tools.map((tool) => tool.name)).not.toContain("qre_run_estimate");
  });

  it("is listed, and says it is not read-only, when the analyst enabled it", async () => {
    const enabled = await connect({ QRE_MCP_ALLOW_RUNS: "1" });
    try {
      const { tools } = await enabled.listTools();
      const run = tools.find((tool) => tool.name === "qre_run_estimate");

      expect(run).toBeDefined();
      expect(run?.annotations?.readOnlyHint).toBe(false);
      // An append-only tool: the client should not warn about data loss.
      expect(run?.annotations?.destructiveHint).toBe(false);
      expect(run?.description).toMatch(/DRAFT_INVALID/);
      expect(run?.description).toMatch(/RUN_BUSY/);
    } finally {
      await enabled.close();
    }
  });

  it("changes what the server says it can do, in both directions", async () => {
    expect(client.getInstructions()).toContain(READ_ONLY_SENTENCE);
    expect(client.getInstructions()).not.toContain("qre_run_estimate");

    const enabled = await connect({ QRE_MCP_ALLOW_RUNS: "1" });
    try {
      const instructions = enabled.getInstructions();
      expect(instructions).toContain(RUN_SENTENCE);
      // The claim that must not survive: a server that can run an estimate has
      // no business telling a model that nothing here runs one.
      expect(instructions).not.toContain(READ_ONLY_SENTENCE);
      expect(instructions).not.toMatch(/^Read-only access/);
      // Still true, and still worth saying in the same breath.
      expect(instructions).toMatch(/no tool that deletes or edits a run/);
    } finally {
      await enabled.close();
    }
  });
});
