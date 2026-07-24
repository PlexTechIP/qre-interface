import type { EstimatorService } from "../shared/types";

declare global {
  interface Window {
    estimator: Pick<EstimatorService, "run">;
  }
}

export {};
