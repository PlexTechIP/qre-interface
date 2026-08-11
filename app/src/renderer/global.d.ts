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
    /**
     * The fifth preload surface. No credential getter exists.
     *
     * Optional only because a renderer running outside Electron has no preload
     * bridge at all — `preload.ts` exposes this unconditionally, so it is
     * always present in a shipped build. The shell refuses to substitute a
     * fixture when it is missing; see `resolveAgentService` in App.tsx.
     */
    agent?: AgentService;
  }
}

export {};
