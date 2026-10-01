/**
 * A minimal in-process estimator double for tests that run where the real
 * QreEngine cannot (renderer/jsdom has no Python subprocess). Replaces MockEngine.
 * Stamps `runId = config.id` + timestamps so `makeRunRecord` accepts the result,
 * matching the real engine's identity contract.
 *
 * Pass `store` to have it behave like the dashboard's estimator boundary, which
 * records every run in history before it replies (main/estimatorHandler.ts). A
 * getter is accepted so a test can hand over `() => window.store` and have the
 * run land in whichever store that test installs, read at run time.
 */

import { makeRunRecord, type EstimatorService, type RunConfig, type RunResult, type RunStore } from "../types";

type ResultOrFn = RunResult | ((config: RunConfig) => RunResult);
type RecordingStore = Pick<RunStore, "save">;

export function fakeEstimator(
  resultOrFn: ResultOrFn,
  options: { delayMs?: number; store?: RecordingStore | (() => RecordingStore) } = {},
): Pick<EstimatorService, "run"> {
  return {
    async run(config: RunConfig): Promise<RunResult> {
      if (options.delayMs) {
        await new Promise((resolve) => setTimeout(resolve, options.delayMs));
      }
      const base = typeof resultOrFn === "function" ? resultOrFn(config) : resultOrFn;
      const now = new Date().toISOString();
      const result = { ...structuredClone(base), runId: config.id, startedAt: now, completedAt: now };
      if (options.store) {
        const store = typeof options.store === "function" ? options.store() : options.store;
        await store.save(makeRunRecord(config, result, now));
      }
      return result;
    },
  };
}
