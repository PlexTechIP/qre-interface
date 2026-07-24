import type { IpcMain } from "electron";
import type { EstimatorService, RunConfig, RunResult } from "../shared/types.js";
import { QreEngine } from "./engine/qreEngine.js";
import { resolvePythonBin } from "./engine/pythonBin.js";
import { ESTIMATOR_RUN_CHANNEL } from "./ipcChannels.js";

export function failedBoundaryResult(config: RunConfig, error: unknown): RunResult {
  const now = new Date().toISOString();
  const detail = error instanceof Error ? error.message : String(error);
  return {
    schemaVersion: "1.0.0",
    runId: config.id,
    status: "failed",
    error: {
      code: "ENGINE_CRASH",
      message: `Unexpected estimator boundary failure: ${detail}. Verify the Python environment and retry.`,
    },
    frontier: null,
    raw: null,
    qreVersion: config.qreVersion,
    startedAt: now,
    completedAt: now,
  };
}

export function registerEstimatorHandler(
  ipcMain: Pick<IpcMain, "handle">,
  engine: Pick<EstimatorService, "run"> = new QreEngine(resolvePythonBin()),
): void {
  ipcMain.handle(ESTIMATOR_RUN_CHANNEL, async (_event, config: RunConfig): Promise<RunResult> => {
    try {
      return await engine.run(config);
    } catch (error) {
      return failedBoundaryResult(config, error);
    }
  });
}
