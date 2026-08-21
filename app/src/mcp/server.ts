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
import { closeRunStore } from "./runStoreAccess.js";
import { flushStream, shutdown } from "./shutdown.js";

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

/** Everything the shutdown sequence needs, resolved at the moment it runs. */
function shutdownDependencies() {
  return {
    server: serverInstance,
    transport: transportInstance,
    closeStore: closeRunStore,
    flush: () => flushStream(protocolStream),
    exit: (code: number) => process.exit(code),
  };
}

function leave(code: number, why: string): void {
  logInfo(why);
  void shutdown(code, shutdownDependencies());
}

// The client closed its end of the pipe. Finish what is in flight and drain
// before leaving; see shutdown.ts for why the order matters.
process.stdin.once("end", () => leave(0, "stdin ended"));

process.on("SIGINT", () => leave(0, "received SIGINT"));
process.on("SIGTERM", () => leave(0, "received SIGTERM"));

process.on("uncaughtException", (error: Error) => {
  logError("uncaught exception", error);
  leave(1, "shutting down after an uncaught exception");
});

process.on("unhandledRejection", (reason: unknown) => {
  logError("unhandled rejection", reason);
  leave(1, "shutting down after an unhandled rejection");
});

// Start the server
main().catch((error: unknown) => {
  logError("mcp server failed to start", error);
  leave(1, "shutting down after a failed start");
});
