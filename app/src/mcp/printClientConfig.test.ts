// @vitest-environment node

/**
 * The setup instructions have to be true, because nobody can check them.
 *
 * An analyst pastes what this prints and either the agent connects or it does
 * not; there is no intermediate state in which a wrong path is noticed. The two
 * properties worth holding are therefore that the database it names is the one
 * the SERVER will open — the same resolution, not a second copy of it — and that
 * the shell line survives the paths it will really be given, which on this
 * repository already include a space.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { resolveRunDatabasePath } from "../main/dataDir.js";
import {
  buildConfigReport,
  chooseNode,
  claudeCodeCommand,
  clientConfigJson,
} from "./printClientConfig.js";

let directory: string;
const savedDbPath = process.env.QRE_DB_PATH;
const savedPythonBin = process.env.QRE_PYTHON_BIN;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "qre-config-"));
  // An interpreter that exists on every machine. Agent runs are on by default,
  // so a checkout with no venv reports a problem — correctly — and the tests
  // below that assert "no problems" are about the database, not the venv.
  // CI has no venv (the unit-test job installs no Python), and this file went
  // red there the first time the default flipped while passing on every
  // developer machine that had run setup_venv.sh.
  process.env.QRE_PYTHON_BIN = process.execPath;
});

afterEach(() => {
  if (savedDbPath === undefined) delete process.env.QRE_DB_PATH;
  else process.env.QRE_DB_PATH = savedDbPath;
  if (savedPythonBin === undefined) delete process.env.QRE_PYTHON_BIN;
  else process.env.QRE_PYTHON_BIN = savedPythonBin;
  rmSync(directory, { recursive: true, force: true });
});

describe("the printed client configuration", () => {
  it("names the database the server itself would open", () => {
    const dbPath = join(directory, "run-history.sqlite");
    writeFileSync(dbPath, "");
    process.env.QRE_DB_PATH = dbPath;

    const report = buildConfigReport();

    // Not "equals the path we set" — equals what the SERVER resolves, so the
    // two cannot drift apart without this failing.
    expect(report.config.env.QRE_DB_PATH).toBe(resolveRunDatabasePath());
    expect(report.problems).toEqual([]);
  });

  it("points at the bundle npm run build:mcp produces", () => {
    const report = buildConfigReport();

    expect(report.config.args[0]).toMatch(/dist-electron\/mcp-server\.mjs$/);
    expect(report.config.command).toBe(process.execPath);
  });

  it("says to launch the dashboard when nothing has been published", () => {
    delete process.env.QRE_DB_PATH;
    // dataDir reads the pointer from the real home directory, so this only
    // asserts the shape of the answer when there is nothing to resolve.
    const report = buildConfigReport();

    if (report.databasePath === null) {
      expect(report.problems.join(" ")).toContain("QRE_DB_PATH");
      // Not "env is empty": the block also carries QRE_PYTHON_BIN when this
      // checkout has a venv, and that is unrelated to whether a database was
      // published. What must be absent is the database variable.
      expect(report.config.env).not.toHaveProperty("QRE_DB_PATH");
    }
  });

  it("reports a published path that is not on disk", () => {
    process.env.QRE_DB_PATH = join(directory, "absent", "run-history.sqlite");

    const report = buildConfigReport();

    expect(report.problems.join(" ")).toContain("does not exist on disk");
  });

  it("quotes a path containing a space so the shell keeps it as one argument", () => {
    const spaced = join(directory, "Microsoft Quantum", "run-history.sqlite");
    process.env.QRE_DB_PATH = spaced;

    const command = claudeCodeCommand(buildConfigReport().config);

    // The repository this ships from already has a space in its path, so an
    // unquoted line would break on the machine it was generated on.
    expect(command).toContain(`QRE_DB_PATH='${spaced}'`);
    expect(command).toMatch(/ -- '[^']+' '[^']+'$/);
  });

  it("names a node new enough to start the server", () => {
    // The pin is what the project promises; the printed command has to satisfy
    // it whatever node happens to be running the tests. The bug this replaces
    // emitted process.execPath unconditionally, so running `npm run mcp:config`
    // in a shell with an older default node produced a config that died with
    // ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite before any of our code ran.
    const manifest = JSON.parse(
      readFileSync(resolve(import.meta.dirname, "..", "..", "package.json"), "utf8"),
    ) as { engines: { node: string } };
    const required = Number.parseInt(manifest.engines.node, 10);

    const { choice } = chooseNode();

    expect(choice, `no node >= ${required} found on this machine`).not.toBeNull();
    expect(Number.parseInt((choice?.version ?? "v0").slice(1), 10)).toBeGreaterThanOrEqual(
      required,
    );
    expect(existsSync(choice?.path ?? "")).toBe(true);
  });

  it("keeps a substitution out of the blocking problems", () => {
    const dbPath = join(directory, "run-history.sqlite");
    writeFileSync(dbPath, "");
    process.env.QRE_DB_PATH = dbPath;

    const report = buildConfigReport();

    // Having found a working node is not something the reader has to act on,
    // and listing it under "before this will work" would say it is.
    if (report.node?.substituted) {
      expect(report.notes.join(" ")).toContain("node:sqlite");
      expect(report.problems).toEqual([]);
    }
  });

  it("emits a config block a client can parse", () => {
    const dbPath = join(directory, "run-history.sqlite");
    writeFileSync(dbPath, "");
    process.env.QRE_DB_PATH = dbPath;

    const parsed = JSON.parse(
      clientConfigJson(buildConfigReport().config),
    ) as {
      mcpServers: Record<string, { command: string; args: string[]; env: Record<string, string> }>;
    };

    const entry = parsed.mcpServers["qre-dashboard"];
    expect(entry).toBeDefined();
    expect(entry?.args).toHaveLength(1);
    expect(entry?.env.QRE_DB_PATH).toBe(dbPath);
  });
});

/**
 * The check the other tests cannot make: run what was printed.
 *
 * Every assertion above is about the SHAPE of the configuration, and the defect
 * that shipped was shaped perfectly — correct paths, correct JSON, and a node
 * that could not execute the file it was pointed at. Only starting it catches
 * that class of thing, so this starts it.
 *
 * Skipped when the bundle has not been built, because `npm test` does not build
 * and a red test that only means "run npm run build:mcp first" trains people to
 * ignore it.
 */
describe("the printed configuration, actually run", () => {
  const built = existsSync(buildConfigReport().config.args[0] ?? "");

  it.skipIf(!built)("starts a server that completes a handshake", async () => {
    const { config } = buildConfigReport();

    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: { PATH: process.env.PATH ?? "", ...config.env },
      stderr: "pipe",
    });
    const client = new Client({ name: "config-test", version: "0.0.0" });

    try {
      await client.connect(transport);
      const { tools } = await client.listTools();
      expect(tools.map((tool) => tool.name)).toContain("qre_list_runs");
    } finally {
      await client.close();
    }
  }, 30_000);
});

describe("agent runs in the emitted block", () => {
  it("are on by default, matching the dashboard's block", () => {
    const report = buildConfigReport();

    expect(report.allowRuns).toBe(true);
    expect(report.config.env.QRE_MCP_ALLOW_RUNS).toBe("1");
    expect(claudeCodeCommand(report.config)).toContain(
      "--env QRE_MCP_ALLOW_RUNS='1'",
    );
  });

  it("are left out of a read-only block", () => {
    const report = buildConfigReport({ allowRuns: false });

    expect(report.allowRuns).toBe(false);
    expect(report.config.env).not.toHaveProperty("QRE_MCP_ALLOW_RUNS");
    expect(claudeCodeCommand(report.config)).not.toContain("QRE_MCP_ALLOW_RUNS");
  });

  it("names the interpreter when there is one", () => {
    // `beforeEach` points QRE_PYTHON_BIN at an executable that exists.
    const report = buildConfigReport({ allowRuns: true });

    expect(report.pythonBin).toBe(process.execPath);
    expect(report.config.env.QRE_PYTHON_BIN).toBe(process.execPath);
    expect(report.problems.join(" ")).not.toMatch(/setup_venv\.sh/);
  });

  it("says what to run when there is no interpreter, and only when runs are on", () => {
    // Both branches on every machine, rather than whichever one the checkout
    // happens to be in: the block must not pretend an interpreter exists, and
    // must say what to run — but a read-only block has no interpreter to miss.
    process.env.QRE_PYTHON_BIN = join(directory, "no-such-python3");

    const enabled = buildConfigReport({ allowRuns: true });
    expect(enabled.pythonBin).toBeNull();
    expect(enabled.config.env).not.toHaveProperty("QRE_PYTHON_BIN");
    expect(enabled.problems.join(" ")).toMatch(/setup_venv\.sh/);

    const readOnly = buildConfigReport({ allowRuns: false });
    expect(readOnly.problems.join(" ")).not.toMatch(/setup_venv\.sh/);
  });
});
