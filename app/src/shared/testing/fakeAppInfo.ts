/**
 * A deterministic `AppInfoService` for tests.
 *
 * The paths are obviously fictional on purpose: a fixture that returned a real
 * `app.getPath("userData")` would make assertions depend on whose machine the
 * suite runs on.
 */

import type {
  AppInfoService,
  McpClientEntry,
  McpSetup,
  McpSetupOptions,
  RevealResult,
  StorageInfo,
  StorageLocation,
  StorageLocationId,
} from "../appInfoTypes";

export const FAKE_STORAGE_LOCATIONS: readonly StorageLocation[] = [
  { id: "runDatabase", path: "/fixture/userData/run-history.sqlite", overridden: false },
  { id: "chatDatabase", path: "/fixture/userData/chat-history.sqlite", overridden: false },
];

/**
 * A setup block whose paths are as obviously fictional as the storage ones.
 *
 * Derived from ONE entry rather than restated in each rendering. Written out
 * three times, a change to the command left the JSON and the shell line saying
 * something else, and a test asserting the panel showed what the service
 * returned would still pass against a fixture that contradicted itself.
 */
const FAKE_ENTRY: McpClientEntry = {
  command: "/fixture/Applications/QRE Interface",
  args: ["/fixture/resources/mcp-server.mjs"],
  env: {
    ELECTRON_RUN_AS_NODE: "1",
    QRE_DB_PATH: "/fixture/userData/run-history.sqlite",
    QRE_PYTHON_BIN: "/fixture/resources/python/.venv/bin/python3",
  },
};

/** The same install, with the analyst's run opt-in in it. */
const FAKE_ENTRY_WITH_RUNS: McpClientEntry = {
  ...FAKE_ENTRY,
  env: { ...FAKE_ENTRY.env, QRE_MCP_ALLOW_RUNS: "1" },
};

const fakeAddCommand = (program: string, entry: McpClientEntry): string =>
  [
    `${program} mcp add qre-dashboard`,
    ...Object.entries(entry.env).map(([key, value]) => `--env ${key}='${value}'`),
    "--",
    `'${entry.command}'`,
    ...entry.args.map((arg) => `'${arg}'`),
  ].join(" ");

function fakeSetup(entry: McpClientEntry): McpSetup {
  return {
    entry,
    configJson: JSON.stringify({ mcpServers: { "qre-dashboard": entry } }, null, 2),
    claudeCodeCommand: fakeAddCommand("claude", entry),
    // The real command applies the tool timeout after the add; the fixture
    // carries the same tail so the panel renders what an analyst will see.
    codexCommand:
      `${fakeAddCommand("codex", entry)} && perl -0pi -e ` +
      `'s/^(\\[mcp_servers\\.qre-dashboard\\]\\n)(?!tool_timeout_sec)/` +
      `\${1}tool_timeout_sec = 600\\n/m' ~/.codex/config.toml`,
    codexAgentsInstruction:
      "## QRE Dashboard (qre-dashboard MCP server)\n" +
      "Use the qre-dashboard MCP tools (qre_run_estimate and the rest) for " +
      "quantum resource estimates.",
    codexConfigToml: [
      "[mcp_servers.qre-dashboard]",
      `command = "${entry.command}"`,
      `args = ["${entry.args[0] ?? ""}"]`,
      "tool_timeout_sec = 600",
      "",
      "[mcp_servers.qre-dashboard.env]",
      ...Object.entries(entry.env).map(([key, value]) => `${key} = "${value}"`),
    ].join("\n"),
    problems: [],
  };
}

export const FAKE_MCP_SETUP: McpSetup = fakeSetup(FAKE_ENTRY);

/** What the panel gets once the analyst ticks "let agents run estimates". */
export const FAKE_MCP_SETUP_WITH_RUNS: McpSetup = fakeSetup(FAKE_ENTRY_WITH_RUNS);

export interface FakeAppInfoOptions {
  locations?: readonly StorageLocation[];
  /** Override the setup block, e.g. to exercise the problems list. */
  mcpSetup?: McpSetup;
  /** Override the block returned when `allowRuns` is asked for. */
  mcpSetupWithRuns?: McpSetup;
  /** Records the options the panel asked with, for assertions. */
  onGetMcpSetup?: (options: McpSetupOptions) => void;
  /** Resolve `reveal` as a failure, the way a missing folder really does. */
  revealResult?: RevealResult;
  /** Records which location was revealed, for assertions. */
  onReveal?: (id: StorageLocationId) => void;
}

export function fakeAppInfoService(options: FakeAppInfoOptions = {}): AppInfoService {
  return {
    async getStorage(): Promise<StorageInfo> {
      return { locations: options.locations ?? FAKE_STORAGE_LOCATIONS };
    },
    async getMcpSetup(setupOptions: McpSetupOptions): Promise<McpSetup> {
      options.onGetMcpSetup?.(setupOptions);
      // Picks by `allowRuns` rather than always answering the same way, so a
      // test that asserts the panel shows the opt-in is asserting something the
      // real service would also do.
      return setupOptions.allowRuns
        ? (options.mcpSetupWithRuns ?? FAKE_MCP_SETUP_WITH_RUNS)
        : (options.mcpSetup ?? FAKE_MCP_SETUP);
    },
    async reveal(id: StorageLocationId): Promise<RevealResult> {
      options.onReveal?.(id);
      return options.revealResult ?? { ok: true };
    },
  };
}
