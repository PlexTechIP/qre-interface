import type {
  EstimatorService,
  RunStore,
  UploadedProgramFormat,
} from "../shared/types";
import type { AgentService } from "../shared/agentTypes";

/** Mirrors main/engine/uploadValidation.ts's result, which the renderer cannot import. */
export type UploadPreflightResult =
  | { ok: true }
  | { ok: false; code: "INVALID_CONFIG"; message: string };

declare global {
  interface Window {
    estimator: Pick<EstimatorService, "run">;
    store: RunStore;
    files?: {
      getPathForFile(file: File): string;
    };
    /** Absent outside Electron (isolated component tests), which disables the
     *  form pre-flight rather than failing it. */
    uploads?: {
      preflight(
        filePath: string,
        format: UploadedProgramFormat,
      ): Promise<UploadPreflightResult>;
    };
    /** Team 2's optional fifth preload surface. No credential getter exists. */
    agent?: AgentService;
  }
}

export {};
