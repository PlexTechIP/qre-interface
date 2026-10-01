import type { IpcMain } from "electron";
import type { EstimatorService, RunConfig, RunResult, RunStore } from "../shared/types.js";
import { makeRunRecord, SCHEMA_VERSION } from "../shared/types.js";
import { QreEngine } from "./engine/qreEngine.js";
import { resolvePythonBin } from "./engine/pythonBin.js";
import { ESTIMATOR_CANCEL_CHANNEL, ESTIMATOR_RUN_CHANNEL } from "./ipcChannels.js";

export function failedBoundaryResult(config: RunConfig, error: unknown): RunResult {
  const now = new Date().toISOString();
  const detail = error instanceof Error ? error.message : String(error);
  return {
    schemaVersion: SCHEMA_VERSION,
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

/** Where a finished run is recorded, and who to tell once it is. */
export interface RunRecorder {
  store: Pick<RunStore, "save">;
  /** After a successful save — main uses it to have open windows re-read. */
  onRecorded?: () => void;
}

/**
 * Run the estimate, record it in history, then reply.
 *
 * Recording used to happen in the renderer once this reply arrived, which
 * made it conditional on the renderer still being there: reload the window
 * mid-run and the engine's work was done and then dropped. Main outlives the
 * page, so it saves first and the renderer only displays.
 *
 * A save failure is logged and the result still returned — the analyst
 * should see what the engine found even when history could not keep it, the
 * same rule the renderer followed.
 */
export function registerEstimatorHandler(
  ipcMain: Pick<IpcMain, "handle">,
  engine: Pick<EstimatorService, "run"> = new QreEngine(resolvePythonBin()),
  recorder?: RunRecorder,
): void {
  /*
   * Runs in flight, by config id, so the analyst can stop one. A cancelled run
   * settles at once and is NOT recorded: it produced no result to keep, and a
   * history row for a run its author abandoned is noise in a list of results.
   */
  const inFlight = new Map<string, AbortController>();

  ipcMain.handle(ESTIMATOR_CANCEL_CHANNEL, async (_event, runId: string): Promise<void> => {
    inFlight.get(runId)?.abort();
  });

  ipcMain.handle(ESTIMATOR_RUN_CHANNEL, async (_event, config: RunConfig): Promise<RunResult> => {
    const controller = new AbortController();
    inFlight.set(config.id, controller);
    let result: RunResult;
    try {
      result = await engine.run(config, { signal: controller.signal });
    } catch (error) {
      result = failedBoundaryResult(config, error);
    } finally {
      inFlight.delete(config.id);
    }
    if (controller.signal.aborted) return result;
    if (recorder) {
      try {
        await recorder.store.save(makeRunRecord(config, result, new Date().toISOString()));
        recorder.onRecorded?.();
      } catch (error) {
        console.error("Failed to save run to history:", error);
      }
    }
    return result;
  });
}
