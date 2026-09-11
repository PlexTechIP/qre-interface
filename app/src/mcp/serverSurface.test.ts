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
import { RUN_DRAFT_SCHEMA_URI, createMcpServer } from "./createServer.js";
import { resetRunStoreForTests } from "./runStoreAccess.js";
import { withNoPublishedDatabase } from "./testing/noPublishedDatabase.js";

let client: Client;
let restoreEnvironment: () => void;

beforeEach(async () => {
  restoreEnvironment = withNoPublishedDatabase();
  resetRunStoreForTests();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createMcpServer().connect(serverTransport);
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
  it("tells the client where to start and that nothing here can act", () => {
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
