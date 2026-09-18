// @vitest-environment node

/**
 * What the registered input schemas refuse before a handler runs, and the one
 * bound a handler applies itself.
 *
 * These exist because caller-supplied text with no maximum reaches a handler at
 * whatever size the transport allows — a ten-megabyte name search, a draft the
 * size of the buffer — and every other caller-supplied string here was already
 * bounded.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { FAKE_GENERATED_DRAFT } from "../shared/testing/fakeAgentService.js";
import { createMcpServer } from "./createServer.js";
import { resetRunStoreForTests } from "./runStoreAccess.js";
import { withNoPublishedDatabase } from "./testing/noPublishedDatabase.js";

let client: Client;
let restoreEnvironment: () => void;

beforeEach(async () => {
  restoreEnvironment = withNoPublishedDatabase();
  resetRunStoreForTests();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createMcpServer().connect(serverTransport);
  client = new Client({ name: "bounds-test", version: "0.0.0" });
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

/**
 * The SDK answers an input-schema failure with an `isError` result whose text
 * names the field, before any handler runs — so these never reach the store.
 */
async function refusedInput(args: Record<string, unknown>): Promise<string> {
  const result = (await client.callTool({ name: "qre_list_runs", arguments: args })) as CallToolResult;
  expect(result.isError).toBe(true);
  const [first] = result.content;
  if (first === undefined || first.type !== "text") throw new Error("expected a text block");
  expect(first.text).toMatch(/Input validation error/);
  return first.text;
}

describe("what the input schemas refuse", () => {
  it("rejects a name search longer than the input bound", async () => {
    const text = await refusedInput({ filter: { nameSearch: "x".repeat(501) } });

    expect(text).toMatch(/nameSearch/);
  });

  /**
   * The bound is on input size, not on the 200-code-point cap applied to a
   * name on the way OUT: the search runs against the stored name, which no
   * schema bounds, and zod counts UTF-16 units where that cap counts code
   * points — so a 200-emoji name was returned in full and then refused as the
   * search term that would have found it.
   */
  it("accepts a search as long as a name the list tool returns in full", async () => {
    const astralName = "\u{1F680}".repeat(200);
    expect(astralName.length).toBe(400);

    const result = (await client.callTool({
      name: "qre_list_runs",
      arguments: { filter: { nameSearch: astralName } },
    })) as CallToolResult;

    // No history is configured here, so reaching the handler is the assertion.
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("DB_NOT_CONFIGURED"),
    });
  });

  it("rejects an oversized benchmark id and qre version", async () => {
    expect(await refusedInput({ filter: { benchmarkId: "b".repeat(101) } })).toMatch(/benchmarkId/);
    expect(await refusedInput({ filter: { qreVersion: "v".repeat(101) } })).toMatch(/qreVersion/);
  });

  it("still accepts a search at the bound", async () => {
    // No database is configured, so the answer is DB_NOT_CONFIGURED — the
    // point is that the request reached the handler at all.
    const result = (await client.callTool({
      name: "qre_list_runs",
      arguments: { filter: { nameSearch: "x".repeat(500) } },
    })) as CallToolResult;

    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("DB_NOT_CONFIGURED"),
    });
  });
});

async function validate(draft: unknown): Promise<CallToolResult> {
  return (await client.callTool({
    name: "qre_validate_config",
    arguments: { draft },
  })) as CallToolResult;
}

describe("qre_validate_config's own size bound", () => {
  it("refuses a draft too large to be one, as an ordinary invalid result", async () => {
    const result = await validate({
      ...structuredClone(FAKE_GENERATED_DRAFT),
      surplus: "x".repeat(40_000),
    });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({
      valid: false,
      errors: [{ field: "draft", source: "structure", message: expect.stringMatching(/too large/) }],
    });
  });

  /**
   * The bound is on WORK, and `name` is the one field no schema bounds — so
   * measuring it refused a draft `qre_draft_from_run` had just produced from a
   * run with a very long name, which the tool's own description says it takes.
   */
  it("does not count the name, which nothing bounds", async () => {
    const result = await validate({
      ...structuredClone(FAKE_GENERATED_DRAFT),
      name: "n".repeat(40_000),
    });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ valid: true, errors: [] });
  });

  /**
   * `JSON.stringify` recurses, so measuring the draft used to throw on a value
   * nested a few thousand deep — while `JSON.parse` on the way in accepted it
   * and zod's loose object never looked inside. An invalid draft became an
   * `isError` failure, which is the one thing this tool promises not to do.
   */
  it("answers a draft nested too deeply as an invalid result, not an error", async () => {
    let nested: unknown[] = [];
    for (let depth = 0; depth < 15_000; depth += 1) nested = [nested];

    const result = await validate({ ...structuredClone(FAKE_GENERATED_DRAFT), surplus: nested });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({
      valid: false,
      errors: [
        {
          field: "draft",
          source: "structure",
          message: expect.stringMatching(/nested too deeply/),
        },
      ],
    });
  });

  /**
   * A structural reason enumerates a contract, so it gets more room than a
   * per-field complaint. At 500 characters a 593-character reason arrived
   * ending in an ellipsis with two of the six parameter variants missing.
   */
  it("reports a long structural reason whole", async () => {
    const draft: Record<string, unknown> = structuredClone(FAKE_GENERATED_DRAFT);
    delete draft["application"];
    draft["parameters"] = {};

    const result = await validate(draft);

    const [error] = (result.structuredContent as { errors: { message: string }[] }).errors;
    expect(error?.message).toMatch(/parameters must be one of:/);
    expect(error?.message).toMatch(/\{none\}/);
    expect(error?.message).not.toMatch(/…/);
  });

  it("accepts a draft of ordinary size", async () => {
    const result = (await client.callTool({
      name: "qre_validate_config",
      arguments: { draft: structuredClone(FAKE_GENERATED_DRAFT) },
    })) as CallToolResult;

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ valid: true, errors: [] });
  });
});
