import type { IpcMain } from "electron";
import { existsSync } from "node:fs";

import {
  isStorageLocationId,
  type RevealResult,
  type StorageInfo,
  type StorageLocation,
} from "../shared/appInfoTypes.js";
import { APP_INFO_REVEAL_CHANNEL, APP_INFO_STORAGE_CHANNEL } from "./ipcChannels.js";

/**
 * Opening a path in the OS file manager. Injected rather than importing
 * Electron's `shell` directly, so these handlers can be tested without booting
 * Electron — the same shape every other handler in this directory uses.
 */
export type RevealItem = (path: string) => void;

/**
 * Read-only storage information for the Settings page.
 *
 * `locations` is resolved once by `main.ts` at startup and closed over here.
 * That is deliberate: the paths depend on `app.getPath("userData")` and on env
 * overrides read at boot, so re-deriving them per call could only ever produce
 * the same answer or a wrong one.
 */
export function registerAppInfoHandlers(
  ipcMain: Pick<IpcMain, "handle">,
  locations: readonly StorageLocation[],
  revealItem: RevealItem,
  /** Injected for the same reason `revealItem` is: no Electron under test. */
  pathExists: (target: string) => boolean = existsSync,
): void {
  ipcMain.handle(APP_INFO_STORAGE_CHANNEL, (): StorageInfo => ({ locations }));

  ipcMain.handle(APP_INFO_REVEAL_CHANNEL, (_event, rawId: unknown): RevealResult => {
    /*
     * The narrowing IS the security boundary, not a formality.
     *
     * `ipcMain.handle` checks nothing, so without this a renderer could send
     * any string and have the OS file manager opened on it. Accepting only a
     * known id and looking the path up in main's own list means the renderer
     * names WHICH file and never WHERE.
     */
    if (!isStorageLocationId(rawId)) {
      return {
        ok: false,
        code: "REVEAL_FAILED",
        message: "That is not a location this app stores data in.",
      };
    }

    const location = locations.find((candidate) => candidate.id === rawId);
    if (location === undefined) {
      return {
        ok: false,
        code: "REVEAL_FAILED",
        message: "That location is not configured in this build.",
      };
    }

    /*
     * Checked before revealing, because `shell.showItemInFolder` cannot
     * report failure: it returns void and simply does nothing when the path
     * is gone. Without this the handler read "did not throw" as success and
     * the analyst clicked a button that did nothing, silently.
     */
    if (!pathExists(location.path)) {
      return {
        ok: false,
        code: "REVEAL_FAILED",
        message: `${location.path} is no longer there. It may have been moved or deleted.`,
      };
    }

    try {
      revealItem(location.path);
      return { ok: true };
    } catch (caught) {
      return {
        ok: false,
        code: "REVEAL_FAILED",
        message: caught instanceof Error ? caught.message : String(caught),
      };
    }
  });
}
