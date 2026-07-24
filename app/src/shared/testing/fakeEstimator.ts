/**
 * A minimal in-process estimator double for tests that run where the real
 * QreEngine cannot (renderer/jsdom has no Python subprocess). Replaces MockEngine.
 * Stamps `runId = config.id` + timestamps so `makeRunRecord` accepts the result
 * and save-after-run keys correctly, matching the real engine's identity contract.
 */

import type { EstimatorService, RunConfig, RunResult } from "../types";

type ResultOrFn = RunResult | ((config: RunConfig) => RunResult);

export function fakeEstimator(
  resultOrFn: ResultOrFn,
  options: { delayMs?: number } = {},
): Pick<EstimatorService, "run"> {
  return {
    async run(config: RunConfig): Promise<RunResult> {
      if (options.delayMs) {
        await new Promise((resolve) => setTimeout(resolve, options.delayMs));
      }
      const base = typeof resultOrFn === "function" ? resultOrFn(config) : resultOrFn;
      const now = new Date().toISOString();
      return { ...structuredClone(base), runId: config.id, startedAt: now, completedAt: now };
    },
  };
}
