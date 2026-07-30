import { contextBridge, ipcRenderer, webUtils } from "electron";
import type {
  EstimatorService,
  RunConfig,
  RunFilter,
  RunRecord,
  RunResult,
  RunStore,
} from "../shared/types.js";
import {
  ESTIMATOR_RUN_CHANNEL,
  STORE_DELETE_CHANNEL,
  STORE_GET_CHANNEL,
  STORE_LIST_CHANNEL,
  STORE_QUERY_CHANNEL,
  STORE_SAVE_CHANNEL,
} from "./ipcChannels.js";

const estimator: Pick<EstimatorService, "run"> = {
  run(config: RunConfig): Promise<RunResult> {
    return ipcRenderer.invoke(ESTIMATOR_RUN_CHANNEL, config) as Promise<RunResult>;
  },
};

// The RunStore, reached over IPC. Each method is a thin `invoke` wrapper — the
// renderer consumes the same async `RunStore` interface the mock did, so the
// History/Comparison UI swaps onto real SQLite with no shape change.
const store: RunStore = {
  save(record: RunRecord): Promise<void> {
    return ipcRenderer.invoke(STORE_SAVE_CHANNEL, record) as Promise<void>;
  },
  list(): Promise<RunRecord[]> {
    return ipcRenderer.invoke(STORE_LIST_CHANNEL) as Promise<RunRecord[]>;
  },
  get(id: string): Promise<RunRecord | null> {
    return ipcRenderer.invoke(STORE_GET_CHANNEL, id) as Promise<RunRecord | null>;
  },
  delete(id: string): Promise<void> {
    return ipcRenderer.invoke(STORE_DELETE_CHANNEL, id) as Promise<void>;
  },
  query(filter: RunFilter): Promise<RunRecord[]> {
    return ipcRenderer.invoke(STORE_QUERY_CHANNEL, filter) as Promise<RunRecord[]>;
  },
};

contextBridge.exposeInMainWorld("estimator", estimator);
contextBridge.exposeInMainWorld("store", store);
contextBridge.exposeInMainWorld("files", {
  getPathForFile(
    file: Parameters<typeof webUtils.getPathForFile>[0],
  ): string {
    return webUtils.getPathForFile(file);
  },
});
