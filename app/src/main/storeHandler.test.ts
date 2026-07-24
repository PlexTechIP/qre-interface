/**
 * Unit tests for the store IPC handler seam. A fake `ipcMain` captures the
 * registered handlers by channel; invoking them drives an InMemoryRunStore (the
 * reference behavior the SQLite store reproduces), so these assert the wiring —
 * channel -> RunStore method — independently of Electron and SQLite.
 */

import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it } from "vitest";

import { MOCK_RUN_RECORDS } from "../shared/runRecordFixtures.js";
import { InMemoryRunStore, RunRecordExistsError } from "../shared/runStore.js";
import { makeRunRecord } from "../shared/types.js";
import {
  STORE_DELETE_CHANNEL,
  STORE_GET_CHANNEL,
  STORE_LIST_CHANNEL,
  STORE_QUERY_CHANNEL,
  STORE_SAVE_CHANNEL,
} from "./ipcChannels.js";
import { registerStoreHandlers } from "./storeHandler.js";

type Listener = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

// A representative record to derive fresh save inputs from (guarded once so the
// rest of the file can treat it as present under noUncheckedIndexedAccess).
const BASE = MOCK_RUN_RECORDS[0];
if (!BASE) throw new Error("MOCK_RUN_RECORDS is empty");

function setup() {
  const handlers = new Map<string, Listener>();
  const ipcMain: Pick<IpcMain, "handle"> = {
    handle(channel, listener) {
      handlers.set(channel, listener as Listener);
    },
  };
  const store = new InMemoryRunStore(MOCK_RUN_RECORDS);
  registerStoreHandlers(ipcMain, store);

  const invoke = <T>(channel: string, ...args: unknown[]): Promise<T> => {
    const handler = handlers.get(channel);
    if (!handler) throw new Error(`no handler registered for ${channel}`);
    return Promise.resolve(
      handler(undefined as unknown as IpcMainInvokeEvent, ...args) as T,
    );
  };

  return { store, invoke, handlers };
}

describe("registerStoreHandlers", () => {
  it("registers a handler for every store channel", () => {
    const { handlers } = setup();
    expect([...handlers.keys()].sort()).toEqual(
      [
        STORE_DELETE_CHANNEL,
        STORE_GET_CHANNEL,
        STORE_LIST_CHANNEL,
        STORE_QUERY_CHANNEL,
        STORE_SAVE_CHANNEL,
      ].sort(),
    );
  });

  it("list forwards to the store, newest-first", async () => {
    const { store, invoke } = setup();
    await expect(invoke(STORE_LIST_CHANNEL)).resolves.toEqual(await store.list());
  });

  it("get returns the record, or null when absent", async () => {
    const { invoke } = setup();
    await expect(invoke(STORE_GET_CHANNEL, BASE.id)).resolves.toEqual(BASE);
    await expect(invoke(STORE_GET_CHANNEL, "no-such-id")).resolves.toBeNull();
  });

  it("query forwards the filter to the store", async () => {
    const { store, invoke } = setup();
    const filter = { architecture: "majorana" as const };
    await expect(invoke(STORE_QUERY_CHANNEL, filter)).resolves.toEqual(
      await store.query(filter),
    );
  });

  it("save persists a new record and rejects a duplicate id (write-once)", async () => {
    const { store, invoke } = setup();
    const before = (await store.list()).length;

    // A brand-new record (fresh id on both config and result) saves.
    const freshId = crypto.randomUUID();
    const fresh = makeRunRecord(
      { ...BASE.config, id: freshId },
      { ...BASE.result, runId: freshId },
      new Date().toISOString(),
    );
    await invoke(STORE_SAVE_CHANNEL, fresh);
    expect((await store.list()).length).toBe(before + 1);
    await expect(invoke(STORE_GET_CHANNEL, freshId)).resolves.toEqual(fresh);

    // Re-saving an existing id rejects — records are immutable.
    await expect(invoke(STORE_SAVE_CHANNEL, BASE)).rejects.toBeInstanceOf(
      RunRecordExistsError,
    );
  });

  it("delete removes a record", async () => {
    const { store, invoke } = setup();
    await invoke(STORE_DELETE_CHANNEL, BASE.id);
    await expect(store.get(BASE.id)).resolves.toBeNull();
  });
});
