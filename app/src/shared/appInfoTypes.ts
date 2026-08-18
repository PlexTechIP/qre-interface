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
   * Show a stored file in the OS file manager.
   *
   * Takes an ID, NOT a path. Main maps the id onto a path it resolved itself,
   * so no string from the renderer ever reaches the file manager — a renderer
   * compromised by a prompt injection cannot use this to point the OS at an
   * arbitrary location on disk.
   */
  reveal(id: StorageLocationId): Promise<RevealResult>;
}
