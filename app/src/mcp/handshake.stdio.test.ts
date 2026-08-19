// @vitest-environment node
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { cwd } from "node:process";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { LATEST_PROTOCOL_VERSION, SUPPORTED_PROTOCOL_VERSIONS } from "@modelcontextprotocol/sdk/types.js";
import { MCP_SERVER_NAME, MCP_SERVER_VERSION } from "./serverInfo.js";

describe("MCP server stdio handshake", () => {
  // C1 — raw pipe, protocol purity
  it("should communicate over stdio with valid JSON-RPC protocol", async () => {
    const appDir = resolve(cwd());
    const child = spawn("tsx", ["src/mcp/server.ts"], {
      cwd: appDir,
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Collect stdout
    const stdoutChunks: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => {
      stdoutChunks.push(chunk);
    });

    // Collect stderr for verification
    const stderrChunks: Buffer[] = [];
    child.stderr.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error("Test timeout"));
      }, 30000); // 30 second timeout

      // Send initialize message
      child.stdin.write(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: LATEST_PROTOCOL_VERSION,
            capabilities: {},
            clientInfo: {
              name: "qre-scaffold-test",
              version: "0.0.0",
            },
          },
        }) + "\n"
      );

      // Send initialized notification
      child.stdin.write(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "notifications/initialized",
        }) + "\n"
      );

      // Give server time to respond
      setTimeout(() => {
        child.stdin.end();

        // Wait a bit for the child to exit
        setTimeout(() => {
          clearTimeout(timeout);

          try {
            // Verify all non-empty stdout lines are valid JSON
            const stdoutText = Buffer.concat(stdoutChunks).toString();
            const lines = stdoutText
              .split("\n")
              .filter((line) => line.trim().length > 0);

            expect(lines.length).toBeGreaterThan(0);

            for (const line of lines) {
              const parsed = JSON.parse(line);
              expect(parsed.jsonrpc).toBe("2.0");
            }

            // Verify id-1 response has correct server info
            const initResponse = lines.find((line) => {
              const parsed = JSON.parse(line);
              return parsed.id === 1;
            });
            expect(initResponse).toBeDefined();

            const initData = JSON.parse(initResponse!);
            expect(initData.result.serverInfo.name).toBe(MCP_SERVER_NAME);
            expect(initData.result.serverInfo.version).toBe(MCP_SERVER_VERSION);
            expect(initData.result.capabilities).toBeDefined();
            expect(SUPPORTED_PROTOCOL_VERSIONS).toContain(
              initData.result.protocolVersion
            );

            // Verify stderr has something (the startup log)
            const stderrText = Buffer.concat(stderrChunks).toString();
            expect(stderrText.length).toBeGreaterThan(0);

            resolve();
          } catch (error) {
            reject(error);
          }
        }, 500);
      }, 1000);
    });
  });

  // C2 — SDK client over stdio
  it("should handshake via SDK client over stdio", async () => {
    const appDir = resolve(cwd());

    const transport = new StdioClientTransport({
      command: "tsx",
      args: ["src/mcp/server.ts"],
      cwd: appDir,
      stderr: "pipe",
    });

    const client = new Client({
      name: "qre-scaffold-test",
      version: "0.0.0",
    });

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Test timeout"));
      }, 30000); // 30 second timeout

      client
        .connect(transport)
        .then(() => {
          const serverVersion = client.getServerVersion();
          expect(serverVersion).toEqual({
            name: MCP_SERVER_NAME,
            version: MCP_SERVER_VERSION,
          });

          clearTimeout(timeout);
          resolve();
        })
        .catch((error) => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  });

  // C3 (optional) — test with built bundle
  it.skipIf(!existsSync(resolve(cwd(), "dist-electron/mcp-server.mjs")))(
    "should work with built mcp-server.mjs bundle",
    async () => {
      const appDir = resolve(cwd());
      const bundlePath = resolve(appDir, "dist-electron/mcp-server.mjs");

      const child = spawn("node", [bundlePath], {
        cwd: appDir,
        stdio: ["pipe", "pipe", "pipe"],
      });

      // Collect stdout
      const stdoutChunks: Buffer[] = [];
      child.stdout.on("data", (chunk: Buffer) => {
        stdoutChunks.push(chunk);
      });

      return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          child.kill();
          reject(new Error("Test timeout"));
        }, 30000);

        // Send initialize
        child.stdin.write(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
              protocolVersion: LATEST_PROTOCOL_VERSION,
              capabilities: {},
              clientInfo: {
                name: "qre-scaffold-test",
                version: "0.0.0",
              },
            },
          }) + "\n"
        );

        setTimeout(() => {
          child.stdin.end();

          setTimeout(() => {
            clearTimeout(timeout);

            try {
              const stdoutText = Buffer.concat(stdoutChunks).toString();
              const lines = stdoutText
                .split("\n")
                .filter((line) => line.trim().length > 0);

              expect(lines.length).toBeGreaterThan(0);

              const initResponse = lines.find((line) => {
                const parsed = JSON.parse(line);
                return parsed.id === 1;
              });
              expect(initResponse).toBeDefined();

              resolve();
            } catch (error) {
              reject(error);
            }
          }, 500);
        }, 1000);
      });
    }
  );
});
