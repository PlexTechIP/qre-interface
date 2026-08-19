// This import MUST be first because ESM evaluates all imports before the
// module body runs. The stdout guard installs itself at module scope, so any
// module that logs at import time will be caught. If bootstrap is imported
// later, those early imports will have already written to stdout and corrupted
// the protocol stream.
import { protocolStream } from "./bootstrap.js";

import { Writable } from "node:stream";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./createServer.js";
import { logInfo, logError } from "./logger.js";
import { MCP_SERVER_NAME, MCP_SERVER_VERSION } from "./serverInfo.js";

let serverInstance: ReturnType<typeof createMcpServer> | null = null;
let transportInstance: StdioServerTransport | null = null;

async function main(): Promise<void> {
  serverInstance = createMcpServer();
  // Cast protocolStream to Writable for compatibility with StdioServerTransport
  transportInstance = new StdioServerTransport(
    process.stdin,
    protocolStream as Writable
  );

  await serverInstance.connect(transportInstance);

  logInfo("mcp server ready", {
    name: MCP_SERVER_NAME,
    version: MCP_SERVER_VERSION,
  });
}

// Handle stdin end
process.stdin.once("end", () => {
  logInfo("stdin ended");
  process.exit(0);
});

// Handle process signals
process.on("SIGINT", () => {
  logInfo("received SIGINT");
  void transportInstance?.close();
  void serverInstance?.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  logInfo("received SIGTERM");
  void transportInstance?.close();
  void serverInstance?.close();
  process.exit(0);
});

// Handle uncaught exceptions
process.on("uncaughtException", (error: Error) => {
  logError("uncaught exception", error);
  process.exit(1);
});

// Handle unhandled rejections
process.on("unhandledRejection", (reason: unknown) => {
  logError("unhandled rejection", reason);
  process.exit(1);
});

// Start the server
main().catch((error: unknown) => {
  logError("mcp server failed to start", error);
  process.exit(1);
});
