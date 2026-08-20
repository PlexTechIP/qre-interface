// @vitest-environment node
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "./createServer.js";
import { MCP_SERVER_NAME, MCP_SERVER_VERSION } from "./serverInfo.js";

describe("MCP server in-memory handshake", () => {
  it("should complete initialize handshake", async () => {
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    await createMcpServer().connect(serverTransport);

    const client = new Client({
      name: "qre-scaffold-test",
      version: "0.0.0",
    });
    await client.connect(clientTransport);

    const serverVersion = client.getServerVersion();
    expect(serverVersion).toEqual({
      name: MCP_SERVER_NAME,
      version: MCP_SERVER_VERSION,
    });

    const capabilities = client.getServerCapabilities();
    expect(capabilities).toBeDefined();
  });
});
