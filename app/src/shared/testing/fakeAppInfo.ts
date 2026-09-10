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
  command: "/fixture/Applications/QRE Dashboard",
  args: ["/fixture/resources/mcp-server.mjs"],
  env: {
    ELECTRON_RUN_AS_NODE: "1",
    QRE_DB_PATH: "/fixture/userData/run-history.sqlite",
  },
};

const fakeAddCommand = (program: string): string =>
  [
    `${program} mcp add qre-dashboard`,
    ...Object.entries(FAKE_ENTRY.env).map(([key, value]) => `--env ${key}='${value}'`),
    "--",
    `'${FAKE_ENTRY.command}'`,
    ...FAKE_ENTRY.args.map((arg) => `'${arg}'`),
  ].join(" ");

export const FAKE_MCP_SETUP: McpSetup = {
  entry: FAKE_ENTRY,
  configJson: JSON.stringify({ mcpServers: { "qre-dashboard": FAKE_ENTRY } }, null, 2),
  claudeCodeCommand: fakeAddCommand("claude"),
  codexCommand: fakeAddCommand("codex"),
  codexConfigToml: [
    "[mcp_servers.qre-dashboard]",
    `command = "${FAKE_ENTRY.command}"`,
    `args = ["${FAKE_ENTRY.args[0] ?? ""}"]`,
    "",
    "[mcp_servers.qre-dashboard.env]",
    ...Object.entries(FAKE_ENTRY.env).map(([key, value]) => `${key} = "${value}"`),
  ].join("\n"),
  problems: [],
};

export interface FakeAppInfoOptions {
  locations?: readonly StorageLocation[];
  /** Override the setup block, e.g. to exercise the problems list. */
  mcpSetup?: McpSetup;
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
    async getMcpSetup(): Promise<McpSetup> {
      return options.mcpSetup ?? FAKE_MCP_SETUP;
    },
    async reveal(id: StorageLocationId): Promise<RevealResult> {
      options.onReveal?.(id);
      return options.revealResult ?? { ok: true };
    },
  };
}
