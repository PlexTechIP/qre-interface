/**
 * Where this install keeps its data, for the Settings page to show.
 *
 * Read-only by construction. The renderer learns paths so an analyst can find
 * their own files; it cannot ask for a path to be *used*, which is why the
 * reveal call below takes an id and never a path.
 */

/** The two SQLite files this app writes. Deliberately a closed set. */
export const STORAGE_LOCATION_IDS = ["runDatabase", "chatDatabase"] as const;
export type StorageLocationId = (typeof STORAGE_LOCATION_IDS)[number];

export function isStorageLocationId(value: unknown): value is StorageLocationId {
  return (
    typeof value === "string" &&
    (STORAGE_LOCATION_IDS as readonly string[]).includes(value)
  );
}

export interface StorageLocation {
  readonly id: StorageLocationId;
  /** Absolute path, as main resolved it. */
  readonly path: string;
  /**
   * Whether QRE_DB_PATH / QRE_CHAT_DB_PATH moved this off the default.
   *
   * Worth surfacing because those env overrides are otherwise completely
   * invisible: an analyst running with one set has no way, anywhere in the
   * app, to tell which database they are actually looking at.
   */
  readonly overridden: boolean;
}

export interface StorageInfo {
  readonly locations: readonly StorageLocation[];
}

/**
 * What an MCP client needs to launch this app's read-only server.
 *
 * The dashboard is the only process that can answer this. It knows its own
 * executable, where its resources were installed, and which database it opened
 * — and in a packaged app none of those are derivable from anywhere else: there
 * is no checkout, no `npm run`, and the paths move with every release.
 */
export interface McpClientEntry {
  readonly command: string;
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string>>;
}

export interface McpSetup {
  readonly entry: McpClientEntry;
  /** The `mcpServers` block, ready to paste into a client's config file. */
  readonly configJson: string;
  /** The equivalent one-liner for Claude Code. */
  readonly claudeCodeCommand: string;
  /** The same, for the Codex CLI, which takes the same arguments. */
  readonly codexCommand: string;
  /** The `~/.codex/config.toml` block, for editing that file by hand. */
  readonly codexConfigToml: string;
  /**
   * What is not yet true. Empty means the block above will work as it stands;
   * anything here is a step the analyst has to take first, said in their words
   * rather than left to be discovered at the first tool call.
   */
  readonly problems: readonly string[];
}

/**
 * Opening a file manager can fail for ordinary reasons — the folder was
 * deleted, the volume is gone — so it resolves as data like every other
 * expected outcome on these surfaces.
 */
export type RevealResult =
  | { ok: true }
  | { ok: false; code: "REVEAL_FAILED"; message: string };

/**
 * The renderer-facing seam. There is no setter: relocating a live SQLite file
 * is a different feature with different failure modes, and a surface that can
 * only report cannot half-do it.
 */
export interface AppInfoService {
  getStorage(): Promise<StorageInfo>;
  /**
   * How to point an MCP client at this install.
   *
   * Read-only like the rest of this surface: it reports a configuration, and
   * cannot apply one. Writing another application's config file is that
   * application's business, and a dashboard that edited it would be reaching
   * outside its own install to do it.
   */
  getMcpSetup(): Promise<McpSetup>;
  /**
   * Show a stored file in the OS file manager.
   *
   * Takes an ID, NOT a path. Main maps the id onto a path it resolved itself,
   * so no string from the renderer ever reaches the file manager — a renderer
   * compromised by a prompt injection cannot use this to point the OS at an
   * arbitrary location on disk.
   */
  reveal(id: StorageLocationId): Promise<RevealResult>;
}
