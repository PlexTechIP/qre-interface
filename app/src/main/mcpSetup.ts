/**
 * How to point an MCP client at THIS install.
 *
 * An MCP client launches a server as a subprocess, so it needs absolute paths
 * and gets no shell: no `PATH`, no `npm run`, no working directory it can rely
 * on. Three of those paths are machine-specific — the executable, the server
 * bundle, and the run database — which is exactly why this cannot be a page in
 * the README, and why the design named the dashboard as the thing that emits
 * it. The dashboard is the only process that knows all three.
 *
 * `npm run mcp:config` answers the same question for a developer, from a
 * checkout. It cannot answer it for a downloaded app: it resolves the bundle
 * relative to `src/mcp/`, which is not shipped, and there is no npm to run it
 * with. This module is that path's counterpart on the other side of packaging.
 *
 * The command is the app's OWN executable with `ELECTRON_RUN_AS_NODE=1`, not a
 * node from the machine. Electron embeds a Node — currently 24, which is what
 * `node:sqlite` needs — so a release ships its own runtime and does not care
 * what the analyst has installed, or whether they have node at all.
 * `packagedRuntime.test.ts` is what holds that.
 */

import { existsSync } from "node:fs";
import { sep } from "node:path";

import type { McpClientEntry, McpSetup } from "../shared/appInfoTypes.js";

/** The name the server registers under; also the client's key for it. */
const SERVER_NAME = "qre-dashboard";

export interface McpSetupInputs {
  /** `process.execPath` — the app binary when packaged, Electron in dev. */
  readonly executablePath: string;
  /** Absolute path to `mcp-server.mjs` as this install laid it down. */
  readonly serverBundlePath: string;
  /** The run database this process actually opened. */
  readonly runDatabasePath: string;
  /**
   * Whether that database holds any runs.
   *
   * Not `existsSync(runDatabasePath)`, which is what this asked first and could
   * never be false: SQLite creates the file when the store opens it, and main
   * opens the store before it builds this. A first launch therefore has a real
   * but EMPTY database — precisely the case the note exists for, and the one
   * file existence cannot see.
   */
  readonly hasSavedRuns: boolean;
  /**
   * The interpreter this install resolved for the engine.
   *
   * Always written into the emitted env, never left to the server's own
   * default. `resolvePythonBin`'s fallback is relative to the module's own
   * directory, which is correct when the server runs from source under tsx and
   * wrong for the packaged bundle — where `mcp-server.mjs` sits beside a copied
   * `python/` with no `.venv` in it. The dashboard is the process that knows
   * the real answer, so it says it rather than hoping.
   */
  readonly pythonBinPath: string;
  /**
   * Whether the block should let connected agents run estimates.
   *
   * This is what the analyst's checkbox produces. It adds one environment
   * variable; it changes nothing in this process, and it takes effect only when
   * a client next starts the server with the emitted configuration.
   */
  readonly allowRuns: boolean;
  /** Injected so this is testable without touching a real filesystem. */
  readonly exists?: (target: string) => boolean;
}

/** The directory segment that marks a path as living inside an asar archive. */
const ASAR_DIRECTORY = `app.asar${sep}`;

/**
 * The bundle path a subprocess can actually execute.
 *
 * An asar is an archive, and its members have no inode — `spawn` on one fails
 * with ENOENT. Electron patches `fs` to READ inside archives, so `existsSync`
 * answers true for exactly the path that cannot be launched: the check meant to
 * catch a broken install is the one thing that cannot see this. Packaging is
 * expected to unpack the bundle (`asarUnpack`), which puts a real file beside
 * the archive in `app.asar.unpacked`; that is what a client must be pointed at.
 *
 * So the archive is detected by name rather than by asking the filesystem, and
 * the unpacked twin is preferred when it is there. When it is not, the caller
 * is told — because the alternative is emitting a path that looks right,
 * passes every check, and fails at the client with `CONNECTION_CLOSED`.
 */
function spawnableBundle(
  bundlePath: string,
  exists: (target: string) => boolean,
): { readonly path: string; readonly trappedInArchive: boolean } {
  if (!bundlePath.includes(ASAR_DIRECTORY)) {
    return { path: bundlePath, trappedInArchive: false };
  }

  const unpacked = bundlePath.replace(ASAR_DIRECTORY, `app.asar.unpacked${sep}`);
  if (exists(unpacked)) return { path: unpacked, trappedInArchive: false };

  return { path: bundlePath, trappedInArchive: true };
}

/** Single-quote for a POSIX shell — an install path routinely has spaces. */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * `<program> mcp add <name> --env K=V -- <command> <args…>`.
 *
 * Claude Code and Codex take the same shape, verified against both CLIs, so
 * this is one builder rather than two that could drift.
 */
function addCommand(program: string, entry: McpClientEntry): string {
  const env = Object.entries(entry.env)
    .map(([key, value]) => `--env ${key}=${shellQuote(value)}`)
    .join(" ");
  return [
    `${program} mcp add`,
    SERVER_NAME,
    env,
    "--",
    shellQuote(entry.command),
    ...entry.args.map(shellQuote),
  ]
    .filter((part) => part.length > 0)
    .join(" ");
}

/**
 * How long Codex lets one tool call run. Its default is 60 seconds; an
 * estimate routinely takes longer, plus queue time behind another run.
 */
const CODEX_TOOL_TIMEOUT_SEC = 600;

/**
 * The Codex one-liner: `codex mcp add …`, then the timeout.
 *
 * `codex mcp add` has no flag for `tool_timeout_sec` (checked against
 * codex-cli 0.137.0: `-c key=value` is a runtime override, and passing it made
 * the add fail validation rather than persist anything). It also REWRITES the
 * table on a repeat add and drops any key it does not know — so the timeout
 * has to be applied after every add, not once. The second command inserts the
 * line directly under the table header, and only when it is not already there,
 * so running the whole thing again is safe. Codex reads the result back as
 * `tool_timeout_sec: 600` in `codex mcp get`.
 *
 * POSIX only, like the single-quoted `add` in front of it; Windows users have
 * the TOML block, which carries the same line.
 */
/**
 * An optional standing instruction for Codex, offered as a copyable block.
 *
 * Codex does not list a custom MCP server's tools to the model; it exposes a
 * `tool_search` and lets the model look them up, and it does not show the
 * server's own `instructions` either. So a session asked to "run a trapped
 * ion Shor's estimate" saw no reason to search, and answered from the web —
 * while the same session used the tools correctly once told "use the qre
 * MCP", and went straight to them unprompted when these lines were in
 * `AGENTS.md`. Checked against codex-cli 0.154.0.
 *
 * Offered, not applied: the emitted command does not touch `AGENTS.md`, because
 * that file is the analyst's own standing instructions to Codex and a setup
 * command writing into it is a step too far. Saying "use the qre-dashboard
 * MCP" in the prompt is the alternative, and it works.
 */
const CODEX_AGENTS_LINES: readonly string[] = [
  `## QRE Interface (${SERVER_NAME} MCP server)`,
  "For any request to run, estimate, size or compare quantum resource " +
    "estimates - Shor factoring, Ekera-Hastad factoring, Grover search, phase " +
    "estimation, quantum dynamics, on hardware such as trapped ion, " +
    "superconducting, Majorana or neutral atom - use the qre-dashboard MCP " +
    "tools: qre_list_benchmarks, qre_list_runs, qre_get_run, " +
    "qre_draft_from_run, qre_validate_config, qre_run_estimate. Search your " +
    "tools for them if they are not listed. Do not search the web for " +
    "published estimates and do not write your own estimator. Trapped ion and " +
    "superconducting are both the gateBased architecture with different gate " +
    "and measurement times.",
];

/**
 * The Codex one-liner: `codex mcp add …`, then the timeout.
 *
 * `codex mcp add` has no flag for `tool_timeout_sec` (checked against
 * codex-cli 0.137.0: `-c key=value` is a runtime override, and passing it made
 * the add fail validation rather than persist anything). It also REWRITES the
 * table on a repeat add and drops any key it does not know — so the timeout
 * has to be applied after every add, not once. The second command inserts the
 * line directly under the table header, and only when it is not already there,
 * so running the whole thing again is safe. Codex reads the result back as
 * `tool_timeout_sec: 600` in `codex mcp get`.
 *
 * POSIX only, like the single-quoted `add` in front of it; Windows users have
 * the TOML block, which carries the same line.
 */
function codexCommand(entry: McpClientEntry): string {
  const table = `mcp_servers\\.${SERVER_NAME}`;
  const insert =
    `s/^(\\[${table}\\]\\n)(?!tool_timeout_sec)/` +
    `\${1}tool_timeout_sec = ${CODEX_TOOL_TIMEOUT_SEC}\\n/m`;
  return (
    `${addCommand("codex", entry)} && ` +
    `perl -0pi -e '${insert}' ~/.codex/config.toml`
  );
}

function configJson(entry: McpClientEntry): string {
  return JSON.stringify({ mcpServers: { [SERVER_NAME]: entry } }, null, 2);
}

/**
 * A TOML basic string.
 *
 * Basic strings process escapes, so a Windows `C:\Users\…` must have its
 * backslashes doubled or TOML reads them as escape sequences and the path
 * silently loses characters. A literal string (single quotes) would avoid that
 * but cannot contain an apostrophe, which a home directory certainly can, so
 * escaping is the option that handles both.
 */
function tomlString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * The `~/.codex/config.toml` block, in the shape Codex itself writes.
 *
 * `env` is a nested table rather than an inline one — that is what
 * `codex mcp add` produces, checked against codex-cli 0.137.0, and matching it
 * means a hand-pasted block and a CLI-added one look the same in the file.
 */
function codexConfigToml(entry: McpClientEntry): string {
  return [
    `[mcp_servers.${SERVER_NAME}]`,
    `command = ${tomlString(entry.command)}`,
    `args = [${entry.args.map(tomlString).join(", ")}]`,
    // Unconditional rather than only when runs are enabled: the value is
    // harmless to a read-only server, and an analyst who enables runs later
    // should not have to discover that a number they never saw is the reason
    // their agent reports a timeout on a run that succeeded.
    `tool_timeout_sec = ${CODEX_TOOL_TIMEOUT_SEC}`,
    "",
    `[mcp_servers.${SERVER_NAME}.env]`,
    ...Object.entries(entry.env).map(([key, value]) => `${key} = ${tomlString(value)}`),
  ].join("\n");
}

/**
 * Build the block, and say what would stop it working.
 *
 * A missing bundle is reported rather than hidden, because the alternative is a
 * client that reports only `CONNECTION_CLOSED` — which says nothing about
 * which of the three paths was wrong. An empty history is reported too, and the
 * block is still emitted: `qre_list_benchmarks` answers without any runs, so an
 * analyst setting the agent up before their first estimate should get something
 * that works, and be told what it will and will not see.
 */
export function buildMcpSetup(inputs: McpSetupInputs): McpSetup {
  const exists = inputs.exists ?? existsSync;
  const problems: string[] = [];

  const bundle = spawnableBundle(inputs.serverBundlePath, exists);

  if (bundle.trappedInArchive) {
    problems.push(
      "The MCP server was packaged inside this app's archive, where another " +
        "program cannot launch it. This is a packaging fault rather than " +
        "something you can fix here — please report it.",
    );
  } else if (!exists(bundle.path)) {
    problems.push(
      "The MCP server is not part of this install, so an agent has nothing to " +
        "launch. This is a packaging fault rather than something you can fix " +
        "here — please report it.",
    );
  }

  if (inputs.allowRuns && !exists(inputs.pythonBinPath)) {
    problems.push(
      "Agent runs are enabled, but the Python environment the engine needs is " +
        "not installed. Run setup_venv.sh in the engine directory, or set " +
        "QRE_PYTHON_BIN in the block below to an interpreter that has the QDK " +
        "installed. Without it an agent can still read your history, but every " +
        "run it starts will be refused.",
    );
  }

  if (!inputs.hasSavedRuns) {
    problems.push(
      "No runs are saved yet. An agent will be able to list benchmarks, but it " +
        "will have no runs to read until you save one.",
    );
  }

  const entry: McpClientEntry = {
    command: inputs.executablePath,
    args: [bundle.path],
    env: {
      // The app's executable is Electron. Without this it would open a window
      // instead of speaking JSON-RPC on stdout.
      ELECTRON_RUN_AS_NODE: "1",
      // Named explicitly rather than left to the published pointer: a client
      // config that carries the path keeps working if the pointer file is ever
      // lost, and it is the one place an analyst can see WHICH database the
      // agent will read.
      QRE_DB_PATH: inputs.runDatabasePath,
      // Always present: the server's own default is right from a checkout and
      // wrong from a packaged install, and only this process can tell them
      // apart. See `pythonBinPath`.
      QRE_PYTHON_BIN: inputs.pythonBinPath,
      // Present only when on. Absence is what the server reads as off, so an
      // analyst who turns the toggle back off and re-pastes the block gets a
      // server with no run tool rather than one carrying `=0`.
      ...(inputs.allowRuns ? { QRE_MCP_ALLOW_RUNS: "1" } : {}),
    },
  };

  return {
    entry,
    configJson: configJson(entry),
    claudeCodeCommand: addCommand("claude", entry),
    codexCommand: codexCommand(entry),
    codexConfigToml: codexConfigToml(entry),
    codexAgentsInstruction: CODEX_AGENTS_LINES.join("\n"),
    problems,
  };
}
