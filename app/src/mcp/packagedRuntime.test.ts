// @vitest-environment node

/**
 * The runtime a SHIPPED app would start this server with.
 *
 * Today the server is launched by a `node` binary that `mcp:config` finds on the
 * developer's machine. A packaged application has no such guarantee: there is no
 * checkout, no `npm run`, and `process.execPath` inside Electron is the app's own
 * binary rather than a node. Shipping therefore depends on Electron being able to
 * run this bundle directly, via `ELECTRON_RUN_AS_NODE=1` — which works because
 * Electron 43 embeds Node 24, the version `node:sqlite` needs.
 *
 * That is a load-bearing assumption for the release, and nothing else checks it:
 * every other test runs the server under plain node. If a future Electron bump
 * moved to a Node without `node:sqlite`, or the bundle grew an import Electron's
 * runtime does not provide, this is the test that would say so — rather than the
 * first analyst to install the packaged app.
 *
 * Skipped when the bundle has not been built, for the same reason as
 * `printClientConfig.test.ts`: `npm test` does not build, and a red test that
 * only means "build first" trains people to ignore it.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const APP_DIR = resolve(import.meta.dirname, "..", "..");
const BUNDLE = resolve(APP_DIR, "dist-electron", "mcp-server.mjs");
const ELECTRON = resolve(APP_DIR, "node_modules", ".bin", "electron");

const runnable = existsSync(BUNDLE) && existsSync(ELECTRON);

/**
 * Make Electron's binary present before anything reads its stdout.
 *
 * `node_modules/.bin/electron` is a shim: on the first run after a fresh
 * install it DOWNLOADS the real binary and narrates that to stdout —
 * `Downloading Electron binary...`. The handshake below asserts that every
 * line on stdout is a JSON-RPC frame, which is the whole point of it, and on a
 * cold `npm ci` the launcher's own chatter arrived on that stream before the
 * server had even started. The test failed for something the server did not do.
 *
 * So the download is provoked here, once, where its output is discarded. What
 * the assertion then sees is only what the bundle wrote.
 */
async function warmElectron(): Promise<void> {
  await new Promise<void>((done) => {
    const child = spawn(ELECTRON, ["--version"], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      stdio: "ignore",
    });
    child.on("error", () => done());
    child.on("exit", () => done());
  });
}

/** Speak just enough protocol to prove the server started and can answer. */
function handshake(command: string, args: string[]): Promise<string> {
  return new Promise((resolveOutcome, reject) => {
    const child = spawn(command, args, {
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        // No history needed: qre_list_benchmarks is the tool that answers
        // without one, which makes this a check of the RUNTIME and not of the
        // machine's data.
        QRE_DB_PATH: "",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`timed out; stderr: ${stderr.slice(0, 400)}`));
    }, 60_000);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("exit", () => {
      clearTimeout(timer);
      if (stderr.includes("ERR_UNKNOWN_BUILTIN_MODULE")) {
        reject(new Error(`this runtime lacks a builtin the server needs: ${stderr.slice(0, 300)}`));
        return;
      }
      resolveOutcome(stdout);
    });

    // A child that exits before draining stdin makes this write fail with
    // EPIPE, and an unhandled 'error' on the stream tears down the whole worker
    // with a stack trace — losing the `exit` handler's diagnostic, which is the
    // one that says WHICH builtin the runtime was missing.
    child.stdin.on("error", () => {});

    child.stdin.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "packaged-runtime-test", version: "0.0.0" },
        },
      })}\n` +
        `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n` +
        `${JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: { name: "qre_list_benchmarks", arguments: {} },
        })}\n`,
    );
    child.stdin.end();
  });
}

describe("the shipped bundle under Electron's own Node", () => {
  // Generous: this is a binary download on a cold install, not a unit of work.
  beforeAll(async () => {
    if (runnable) await warmElectron();
  }, 300_000);

  it.skipIf(!runnable)(
    "starts, handshakes, and answers a tool call",
    async () => {
      const stdout = await handshake(ELECTRON, [BUNDLE]);

      expect(stdout, "no initialize response").toContain('"serverInfo"');
      expect(stdout, "no answer to the tool call").toContain("shors-factoring");
      // stdout is the protocol stream and nothing else may share it.
      for (const frame of stdout.split("\n").filter((l) => l.trim().length > 0)) {
        expect(
          () => JSON.parse(frame) as unknown,
          `stdout carried a line that is not a JSON-RPC frame: ${frame.slice(0, 120)}`,
        ).not.toThrow();
      }
    },
    90_000,
  );

  it.skipIf(!runnable)("embeds a Node new enough for node:sqlite", async () => {
    // The concrete requirement behind the check above, stated so a failure says
    // WHY rather than only that a handshake did not happen.
    const versions = await new Promise<string>((resolveOutcome, reject) => {
      const child = spawn(ELECTRON, ["-e", "process.stdout.write(process.versions.node)"], {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
        stdio: ["ignore", "pipe", "ignore"],
      });
      let out = "";
      child.stdout.on("data", (c) => {
        out += String(c);
      });
      child.on("error", reject);
      child.on("exit", () => resolveOutcome(out));
    });

    expect(Number.parseInt(versions, 10)).toBeGreaterThanOrEqual(24);
  }, 60_000);
});
