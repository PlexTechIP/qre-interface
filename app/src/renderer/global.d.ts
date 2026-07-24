import type { EstimatorService, RunStore } from "../shared/types";

declare global {
  interface Window {
    estimator: Pick<EstimatorService, "run">;
    store: RunStore;
    files?: {
      getPathForFile(file: File): string;
    };
  }
}

export {};
