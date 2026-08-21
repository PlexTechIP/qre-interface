// @vitest-environment node

/**
 * The server as a client actually meets it: a separate process on a pipe.
 *
 * These waited on fixed sleeps — 1500ms for the child to boot Node, load the
 * SDK and answer. That is ample on an idle machine and not ample on a loaded
 * one, so once CI started running them (it built after testing, so the bundle
 * cases had never run at all) they would have flaked. Worse, a timeout reported
 * `expected 0 to be greater than 0` and threw the child's stderr away, which
 * says nothing about what went wrong.
 *
 * They now wait for the response itself and surface stderr on failure.
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cwd } from "node:process";
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";
import { MCP_SERVER_NAME, MCP_SERVER_VERSION } from "./serverInfo.js";

const APP_DIR = resolve(cwd());
const BUNDLE_PATH = resolve(APP_DIR, "dist-electron/mcp-server.mjs");
const BUNDLE_BUILT = existsSync(BUNDLE_PATH);

function initializeRequest(id: number): string {
  return `${JSON.stringify({
    jsonrpc: "2.0",
    id,
    method: "initialize",
    params: {
      protocolVersion: LATEST_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "qre-scaffold-test", version: "0.0.0" },
    },
  })}\n`;
}

/**
 * Send requests to a freshly spawned server and resolve as soon as `until` is
 * satisfied by the lines it has written to stdout.
 *
 * Waiting on the answer rather than on the clock is what makes this reliable
 * under load; the timeout is only a backstop, and it reports stderr so a
 * failure says what the server actually did.
 */
async function talkToServer(options: {
  command: string;
  args: string[];
  requests: string[];
  env?: NodeJS.ProcessEnv;
  until: (lines: string[]) => boolean;
  timeoutMs?: number;
}): Promise<{ lines: string[]; stderr: string }> {
  const child = spawn(options.command, options.args, {
    cwd: APP_DIR,
    stdio: ["pipe", "pipe", "pipe"],
    ...(options.env ? { env: options.env } : {}),
  });

  let stdout = "";
  let stderr = "";
  const linesSoFar = (): string[] =>
    stdout.split("\n").filter((line) => line.trim().length > 0);

  return new Promise((settle, fail) => {
    const finish = (error?: Error): void => {
      clearTimeout(timer);
      child.kill();
      if (error) fail(error);
      else settle({ lines: linesSoFar(), stderr });
    };

    const timer = setTimeout(() => {
      finish(
        new Error(
          `server did not answer in ${String(options.timeoutMs ?? 20000)}ms.\n` +
            `stdout: ${JSON.stringify(stdout.slice(0, 500))}\n` +
            `stderr: ${stderr.slice(0, 500)}`,
        ),
      );
    }, options.timeoutMs ?? 20000);

    child.on("error", (error) => finish(error));
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      if (options.until(linesSoFar())) finish();
    });

    for (const request of options.requests) child.stdin.write(request);
  });
}

/** Resolve once a JSON-RPC response with this id has arrived. */
const answered =
  (id: number) =>
  (lines: string[]): boolean =>
    lines.some((line) => {
      try {
        return (JSON.parse(line) as { id?: unknown }).id === id;
      } catch {
        return false;
      }
    });

describe("MCP server stdio handshake", () => {
  it("puts only JSON-RPC on stdout, and its logs on stderr", async () => {
    const { lines, stderr } = await talkToServer({
      command: "tsx",
      args: ["src/mcp/server.ts"],
      requests: [initializeRequest(1)],
      until: answered(1),
    });

    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(() => JSON.parse(line) as unknown).not.toThrow();
    }
    // The server is not silent — it logs readiness — and none of it is on stdout.
    expect(stderr).toContain("mcp server ready");
  });

  it("completes an initialize handshake", async () => {
    const { lines } = await talkToServer({
      command: "tsx",
      args: ["src/mcp/server.ts"],
      requests: [initializeRequest(1)],
      until: answered(1),
    });

    const response = lines
      .map((line) => JSON.parse(line) as { id?: number; result?: unknown })
      .find((message) => message.id === 1);

    expect(response?.result).toMatchObject({
      serverInfo: { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
    });
  });

  it("handshakes with a real SDK client over stdio", async () => {
    const transport = new StdioClientTransport({
      command: "tsx",
      args: ["src/mcp/server.ts"],
      cwd: APP_DIR,
      stderr: "pipe",
    });
    const client = new Client({ name: "qre-scaffold-test", version: "0.0.0" });

    await client.connect(transport);

    expect(client.getServerVersion()).toEqual({
      name: MCP_SERVER_NAME,
      version: MCP_SERVER_VERSION,
    });
    await client.close();
  }, 30000);
});

/**
 * The source graph is what we reason about; the bundle is what ships. Vite
 * externalises dependencies and inlines first-party code, so these are separate
 * claims — a guard over `src/` cannot see a package pulled in at build time.
 *
 * These run only after a build. CI builds before it tests so they always run
 * there; locally they skip until `npm run build:mcp` has been done once.
 */
describe("the built MCP bundle", () => {
  it.skipIf(!BUNDLE_BUILT)("answers over stdio", async () => {
    const { lines } = await talkToServer({
      command: "node",
      args: [BUNDLE_PATH],
      requests: [initializeRequest(1)],
      until: answered(1),
    });

    const response = lines
      .map((line) => JSON.parse(line) as { id?: number; result?: unknown })
      .find((message) => message.id === 1);

    expect(response?.result).toMatchObject({
      serverInfo: { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
    });
  });

  it.skipIf(!BUNDLE_BUILT)("imports nothing from electron", () => {
    const bundle = readFileSync(BUNDLE_PATH, "utf8");

    expect(bundle).not.toMatch(/from\s*["']electron["']/);
    expect(bundle).not.toMatch(/require\(\s*["']electron["']\s*\)/);
  });

  it.skipIf(!BUNDLE_BUILT)("writes only JSON-RPC to stdout", async () => {
    // Not a grep for console.log: the only claim that matters is what actually
    // reaches fd 1, whoever wrote it and whenever they were evaluated.
    const { lines } = await talkToServer({
      command: "node",
      args: [BUNDLE_PATH],
      requests: [initializeRequest(1)],
      until: answered(1),
      env: { ...process.env, QRE_DB_PATH: "" },
    });

    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(
        () => JSON.parse(line) as unknown,
        `non-JSON on stdout: ${line.slice(0, 120)}`,
      ).not.toThrow();
    }
  });
});
