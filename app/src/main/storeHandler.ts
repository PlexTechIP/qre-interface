import type { IpcMain } from "electron";
import type { RunFilter, RunRecord, RunStore } from "../shared/types.js";
import {
  STORE_DELETE_CHANNEL,
  STORE_GET_CHANNEL,
  STORE_LIST_CHANNEL,
  STORE_QUERY_CHANNEL,
  STORE_SAVE_CHANNEL,
} from "./ipcChannels.js";

/**
 * Wire the RunStore behind IPC, mirroring registerEstimatorHandler: one
 * `ipcMain.handle` per operation, each forwarding to the injected store. The
 * store is the same async `RunStore` interface Team 1's UI already consumes, so
 * the renderer reaches SQLite over this bridge with no shape change.
 *
 * Error model — the one deliberate difference from the estimator: the estimator
 * never rejects (failures cross as resolved failed RunResults). The RunStore
 * contract says `save` REJECTS on a duplicate id (records are write-once), so we
 * let handler rejections propagate — `ipcRenderer.invoke` rejects in the
 * renderer. Save-after-run always mints a fresh UUID, so a duplicate is a real
 * error worth surfacing. (Electron flattens the thrown error to a generic Error
 * across the wire; callers only rely on the rejection, not its class.)
 *
 * Unlike the estimator handler, the store has no sensible default (it needs a
 * resolved DB path), so it is always injected — by main.ts in production, and by
 * an InMemoryRunStore in tests.
 */
export function registerStoreHandlers(
  ipcMain: Pick<IpcMain, "handle">,
  store: RunStore,
): void {
  ipcMain.handle(
    STORE_SAVE_CHANNEL,
    (_event, record: RunRecord): Promise<void> => store.save(record),
  );
  ipcMain.handle(STORE_LIST_CHANNEL, (): Promise<RunRecord[]> => store.list());
  ipcMain.handle(
    STORE_GET_CHANNEL,
    (_event, id: string): Promise<RunRecord | null> => store.get(id),
  );
  ipcMain.handle(
    STORE_DELETE_CHANNEL,
    (_event, id: string): Promise<void> => store.delete(id),
  );
  ipcMain.handle(
    STORE_QUERY_CHANNEL,
    (_event, filter: RunFilter): Promise<RunRecord[]> => store.query(filter),
  );
}
