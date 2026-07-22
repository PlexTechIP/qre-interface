import { contextBridge, ipcRenderer } from "electron";
import type { EstimatorService, RunConfig, RunResult } from "../shared/types.js";
import { ESTIMATOR_RUN_CHANNEL } from "./ipcChannels.js";

const estimator: Pick<EstimatorService, "run"> = {
  run(config: RunConfig): Promise<RunResult> {
    return ipcRenderer.invoke(ESTIMATOR_RUN_CHANNEL, config) as Promise<RunResult>;
  },
};

contextBridge.exposeInMainWorld("estimator", estimator);
