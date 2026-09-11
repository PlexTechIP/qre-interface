/**
 * Print the MCP client configuration for this checkout.
 *
 * Connecting an agent to this server needs three absolute paths — the node
 * binary, the built bundle, and the run history — and getting any of them wrong
 * fails in a way that looks like the server being broken. Two of the three are
 * machine-specific, so they cannot be written into a README, and until this
 * existed the only instructions possible were "work out the paths yourself".
 *
 * So the paths are resolved here instead, by the same `resolveRunDatabasePath`
 * the server itself calls, which is what makes the printed block provably agree
 * with what the server will open. Anything that is not yet true — no build, no
 * database — is reported as the step to take rather than left to be discovered
 * at the first tool call.
 *
 * This is a CLI, NOT part of the server: it writes to stdout, which the server
 * reserves for the protocol stream. It must never appear on `server.ts`'s import
 * graph, and `importGraph.test.ts` fails if it ever does.
 *
 * Run with: `npm run mcp:config` (add `--json` for the bare config block).
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveRunDatabasePath } from "../main/dataDir.js";
import { MCP_SERVER_NAME } from "./serverInfo.js";

/** This file's directory, and the app root two levels above it. */
function appRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
}

/** The bundle `npm run build:mcp` produces. */
function resolveServerBundlePath(): string {
  return join(appRoot(), "dist-electron", "mcp-server.mjs");
}

/**
 * The node the server must run under, read from the one place it is pinned.
 *
 * Not a constant here: `engines.node` in package.json is what the project
 * actually promises, and a second copy of it in this file would keep printing a
 * configuration for the old requirement after someone moved the pin.
 */
function requiredNodeMajor(): number | null {
  try {
    const contents = readFileSync(join(appRoot(), "package.json"), "utf8");
    const parsed = JSON.parse(contents) as { engines?: { node?: unknown } };
    const pinned = parsed.engines?.node;
    if (typeof pinned !== "string") return null;
    const major = Number.parseInt(pinned.replace(/^\D+/, ""), 10);
    return Number.isNaN(major) ? null : major;
  } catch {
    return null;
  }
}

function majorOf(version: string): number {
  return Number.parseInt(version.replace(/^v/, ""), 10);
}

/**
 * Where nvm keeps its installs. Read as directory names rather than by running
 * each binary: the version is in the name, and spawning candidate interpreters
 * to interview them is both slower and a worse thing for a config printer to do.
 */
function nvmCandidates(): { path: string; version: string }[] {
  const root = join(homedir(), ".nvm", "versions", "node");
  let entries: string[];
  try {
    entries = readdirSync(root);
  } catch {
    return [];
  }

  return entries
    .filter((name) => /^v\d+\.\d+\.\d+$/.test(name))
    .map((name) => ({ path: join(root, name, "bin", "node"), version: name }))
    .filter((candidate) => existsSync(candidate.path))
    .sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));
}

export interface NodeChoice {
  path: string;
  version: string;
  /** True when the node running this script is not the one being recommended. */
  substituted: boolean;
}

/**
 * Pick a node the server can actually start under.
 *
 * `process.execPath` alone is wrong, and wrong in the way that matters: the
 * server imports `node:sqlite`, which is not a built-in before Node 24, so a
 * config naming an older interpreter produces
 * `ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite` at import time — before any of the
 * server's own code runs, so there is nothing to report a friendly error. The
 * client shows only a failed connection.
 *
 * That is not a hypothetical: this repository pins 24.18.0 while a machine's
 * default node is commonly older, so `npm run mcp:config` in an ordinary shell
 * hit it every time. So a suitable interpreter is looked for rather than
 * assumed, and if the one running this is not it, the one that is gets printed.
 */
export function chooseNode(): { choice: NodeChoice | null; requiredMajor: number | null } {
  const requiredMajor = requiredNodeMajor();
  const running: NodeChoice = {
    path: process.execPath,
    version: process.version,
    substituted: false,
  };

  if (requiredMajor === null) return { choice: running, requiredMajor };
  if (majorOf(process.version) >= requiredMajor) {
    return { choice: running, requiredMajor };
  }

  const suitable = nvmCandidates().find(
    (candidate) => majorOf(candidate.version) >= requiredMajor,
  );
  if (suitable === undefined) return { choice: null, requiredMajor };

  return {
    choice: { path: suitable.path, version: suitable.version, substituted: true },
    requiredMajor,
  };
}

/** Single-quote for a POSIX shell — the repository path may contain spaces. */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export interface ClientConfig {
  command: string;
  args: string[];
  env: Record<string, string>;
}

export interface ConfigReport {
  config: ClientConfig;
  /**
   * What is not yet true, in the order it should be fixed. A non-empty list
   * means the printed block will not work as it stands.
   */
  problems: string[];
  /**
   * Things resolved on the caller's behalf that they should still know about —
   * kept apart from `problems` because printing "nothing to do" under a heading
   * that says "before this will work" is a worse instruction than either.
   */
  notes: string[];
  databasePath: string | null;
  /** The interpreter the block names, and whether it is the one running now. */
  node: NodeChoice | null;
}

/**
 * Build the configuration block, and say what is missing.
 *
 * A missing database is reported but does not stop a block being printed: an
 * analyst who has not launched the dashboard yet should still be able to set the
 * agent up, and `qre_list_benchmarks` works without any history at all.
 */
export function buildConfigReport(): ConfigReport {
  const problems: string[] = [];
  const notes: string[] = [];

  const bundle = resolveServerBundlePath();
  if (!existsSync(bundle)) {
    problems.push(
      `The server bundle does not exist yet. Run \`npm run build:mcp\` in app/.`,
    );
  }

  const { choice: node, requiredMajor } = chooseNode();
  if (node === null) {
    problems.push(
      `The server needs Node ${requiredMajor} or newer — it imports ` +
        `node:sqlite, which older versions do not have — and no such Node was ` +
        `found on this machine. The node running this is ${process.version}. ` +
        `Install it (\`nvm install ${requiredMajor}\`) and run this again; the ` +
        `command below names an interpreter that cannot start the server.`,
    );
  } else if (node.substituted) {
    notes.push(
      `The node you ran this with (${process.version}) cannot start the ` +
        `server — it has no node:sqlite — so the block below names ` +
        `${node.version} instead. Nothing to do; this is already handled.`,
    );
  }

  const databasePath = resolveRunDatabasePath();
  if (databasePath === null) {
    problems.push(
      "No run history has been published yet, so the agent will only be able " +
        "to list benchmarks. Launch the QRE Interface once, then run this " +
        "again — or set QRE_DB_PATH to a database you already have.",
    );
  } else if (!existsSync(databasePath)) {
    problems.push(
      "The published run-history path does not exist on disk. Launch the QRE " +
        "Dashboard once to recreate it.",
    );
  }

  return {
    config: {
      command: node?.path ?? process.execPath,
      args: [bundle],
      env: databasePath === null ? {} : { QRE_DB_PATH: databasePath },
    },
    databasePath,
    node,
    problems,
    notes,
  };
}

/** The `claude mcp add` line, quoted so a path with a space survives it. */
export function claudeCodeCommand(config: ClientConfig): string {
  const env = Object.entries(config.env)
    .map(([key, value]) => `--env ${key}=${shellQuote(value)}`)
    .join(" ");
  const parts = [
    "claude mcp add",
    MCP_SERVER_NAME,
    env,
    "--",
    shellQuote(config.command),
    ...config.args.map(shellQuote),
  ].filter((part) => part.length > 0);
  return parts.join(" ");
}

/** The `mcpServers` entry, as Claude Desktop and most other clients take it. */
export function clientConfigJson(config: ClientConfig): string {
  return JSON.stringify(
    { mcpServers: { [MCP_SERVER_NAME]: config } },
    null,
    2,
  );
}

function render(report: ConfigReport): string {
  const { config } = report;
  const lines: string[] = [
    "",
    "QRE Interface — MCP server configuration",
    "",
    `  node          ${config.command}${report.node ? ` (${report.node.version})` : ""}`,
    `  server        ${config.args[0]}`,
    `  run history   ${report.databasePath ?? "(none published yet)"}`,
    "",
  ];

  if (report.problems.length > 0) {
    lines.push("Before this will work:");
    for (const problem of report.problems) lines.push(`  ! ${problem}`);
    lines.push("");
  }

  if (report.notes.length > 0) {
    lines.push("Worth knowing:");
    for (const note of report.notes) lines.push(`  - ${note}`);
    lines.push("");
  }

  lines.push(
    "Claude Code — run this once, from anywhere:",
    "",
    `  ${claudeCodeCommand(config)}`,
    "",
    "Claude Desktop — merge into claude_desktop_config.json:",
    "",
    ...clientConfigJson(config)
      .split("\n")
      .map((line) => `  ${line}`),
    "",
    "Then ask: \"what QRE runs do I have saved?\"",
    "",
  );

  return lines.join("\n");
}

/** Entry point. `--json` prints only the config block, for piping. */
function main(): void {
  const report = buildConfigReport();
  const jsonOnly = process.argv.includes("--json");

  if (jsonOnly) {
    process.stdout.write(`${clientConfigJson(report.config)}\n`);
  } else {
    process.stdout.write(render(report));
  }

  // Problems go to stderr so `--json` stays pipeable, and the exit code lets a
  // script tell "here is your config" from "this will not work yet".
  if (report.problems.length > 0) {
    if (jsonOnly) {
      for (const problem of report.problems) {
        process.stderr.write(`warning: ${problem}\n`);
      }
    }
    process.exitCode = 1;
  }
}

// Only when run directly, so the exported builders stay importable from tests.
if (process.argv[1] !== undefined &&
    resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
