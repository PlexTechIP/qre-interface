// @vitest-environment node
/**
 * The storage-info seam. A fake `ipcMain` captures handlers by channel and a
 * fake reveal records what it was asked to open, so these assert the wiring —
 * and, more importantly, that a path can only ever come from main.
 */

import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import type { RevealResult, StorageInfo, StorageLocation } from "../shared/appInfoTypes.js";
import { registerAppInfoHandlers } from "./appInfoHandler.js";
import { APP_INFO_REVEAL_CHANNEL, APP_INFO_STORAGE_CHANNEL } from "./ipcChannels.js";

type Listener = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

const LOCATIONS: readonly StorageLocation[] = [
  { id: "runDatabase", path: "/home/analyst/data/run-history.sqlite", overridden: false },
  { id: "chatDatabase", path: "/elsewhere/chat-history.sqlite", overridden: true },
];

function setup(
  revealImpl: (path: string) => void = () => {},
  pathExistsImpl: (target: string) => boolean = () => true,
) {
  const handlers = new Map<string, Listener>();
  const ipcMain: Pick<IpcMain, "handle"> = {
    handle(channel, listener) {
      handlers.set(channel, listener as Listener);
    },
  };
  const revealItem = vi.fn(revealImpl);
  const pathExists = vi.fn(pathExistsImpl);
  registerAppInfoHandlers(ipcMain, LOCATIONS, revealItem, pathExists);

  const invoke = <T>(channel: string, ...args: unknown[]): Promise<T> => {
    const handler = handlers.get(channel);
    if (!handler) throw new Error(`no handler registered for ${channel}`);
    return Promise.resolve(
      handler(undefined as unknown as IpcMainInvokeEvent, ...args) as T,
    );
  };

  return { invoke, revealItem, pathExists };
}

describe("appInfoHandler", () => {
  it("reports the paths main resolved, and which were overridden", async () => {
    const { invoke } = setup();

    const info = await invoke<StorageInfo>(APP_INFO_STORAGE_CHANNEL);

    expect(info.locations).toEqual(LOCATIONS);
  });

  it("reveals a known location using main's own path", async () => {
    const { invoke, revealItem } = setup();

    const result = await invoke<RevealResult>(APP_INFO_REVEAL_CHANNEL, "chatDatabase");

    expect(result).toEqual({ ok: true });
    expect(revealItem).toHaveBeenCalledWith("/elsewhere/chat-history.sqlite");
  });

  /**
   * The security property this seam exists to hold. The renderer names WHICH
   * file, never WHERE — so a renderer talked into sending a path cannot point
   * the OS file manager at an arbitrary location.
   */
  it("refuses a path sent in place of an id", async () => {
    const { invoke, revealItem } = setup();

    const result = await invoke<RevealResult>(
      APP_INFO_REVEAL_CHANNEL,
      "/etc/passwd",
    );

    expect(result.ok).toBe(false);
    expect(revealItem).not.toHaveBeenCalled();
  });

  it("refuses an unknown id", async () => {
    const { invoke, revealItem } = setup();

    const result = await invoke<RevealResult>(APP_INFO_REVEAL_CHANNEL, "credentials");

    expect(result.ok).toBe(false);
    expect(revealItem).not.toHaveBeenCalled();
  });

  it("refuses a non-string payload without throwing", async () => {
    const { invoke, revealItem } = setup();

    const result = await invoke<RevealResult>(APP_INFO_REVEAL_CHANNEL, { id: "runDatabase" });

    expect(result.ok).toBe(false);
    expect(revealItem).not.toHaveBeenCalled();
  });

  /**
   * `shell.showItemInFolder` returns void and simply does nothing when it
   * cannot open the folder, so "did not throw" is not evidence that anything
   * happened. Reporting ok:true there left the analyst clicking a button with
   * no visible effect and no error — the failure this codebase's
   * resolve-as-data convention exists to make visible.
   */
  it("refuses to claim success for a file that is no longer there", async () => {
    const { invoke, revealItem } = setup(
      () => {},
      () => false,
    );

    const result = await invoke<RevealResult>(APP_INFO_REVEAL_CHANNEL, "runDatabase");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/no longer|not found|does not exist/i);
    expect(revealItem).not.toHaveBeenCalled();
  });

  it("checks the path main resolved, not one the renderer supplied", async () => {
    const { invoke, pathExists } = setup();

    await invoke<RevealResult>(APP_INFO_REVEAL_CHANNEL, "chatDatabase");

    expect(pathExists).toHaveBeenCalledWith("/elsewhere/chat-history.sqlite");
  });

  /** A file manager that will not open is an expected outcome, not a crash. */
  it("resolves a failed reveal as data", async () => {
    const { invoke } = setup(() => {
      throw new Error("no file manager on this system");
    });

    const result = await invoke<RevealResult>(APP_INFO_REVEAL_CHANNEL, "runDatabase");

    expect(result).toEqual({
      ok: false,
      code: "REVEAL_FAILED",
      message: expect.stringContaining("no file manager") as unknown as string,
    });
  });
});
