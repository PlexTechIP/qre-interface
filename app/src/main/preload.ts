import { contextBridge, ipcRenderer, webUtils } from "electron";
import type {
  AgentDraftRequest,
  AgentDraftResult,
  AgentProviderStatus,
  AgentService,
  CredentialConfigureResult,
} from "../shared/agentTypes.js";
import type {
  EstimatorService,
  RunConfig,
  RunFilter,
  RunRecord,
  RunResult,
  RunStore,
  UploadedProgramFormat,
} from "../shared/types.js";
import type { UploadValidationResult } from "./engine/uploadValidation.js";
import {
  AGENT_DRAFT_CHANNEL,
  AGENT_PREVIEW_CHANNEL,
  AGENT_STATUS_CHANNEL,
  CREDENTIAL_CONFIGURE_CHANNEL,
  ESTIMATOR_RUN_CHANNEL,
  UPLOAD_PREFLIGHT_CHANNEL,
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

// Pre-flight an uploaded program from the renderer. The filesystem read happens
// in the main process; the renderer only ever sees the pass/fail verdict.
const uploads = {
  preflight(
    filePath: string,
    format: UploadedProgramFormat,
  ): Promise<UploadValidationResult> {
    return ipcRenderer.invoke(UPLOAD_PREFLIGHT_CHANNEL, {
      filePath,
      format,
    }) as Promise<UploadValidationResult>;
  },
};

// window.agent — the fifth surface. No credential getter: the renderer can ask
// getStatus() (a boolean-shaped "is a provider configured"), previewRequest()
// and requestDraft() (which rejects only if the status check was skipped), and
// hand a key one-way to configureCredential(). Nothing here returns a key, and
// there is no channel on the other side that could.
const agent: AgentService = {
  getStatus(): Promise<AgentProviderStatus> {
    return ipcRenderer.invoke(AGENT_STATUS_CHANNEL) as Promise<AgentProviderStatus>;
  },
  previewRequest(request: AgentDraftRequest): Promise<unknown> {
    return ipcRenderer.invoke(AGENT_PREVIEW_CHANNEL, request);
  },
  requestDraft(request: AgentDraftRequest): Promise<AgentDraftResult> {
    return ipcRenderer.invoke(AGENT_DRAFT_CHANNEL, request) as Promise<AgentDraftResult>;
  },
  configureCredential(apiKey: string): Promise<CredentialConfigureResult> {
    return ipcRenderer.invoke(
      CREDENTIAL_CONFIGURE_CHANNEL,
      apiKey,
    ) as Promise<CredentialConfigureResult>;
  },
};

contextBridge.exposeInMainWorld("estimator", estimator);
contextBridge.exposeInMainWorld("uploads", uploads);
contextBridge.exposeInMainWorld("store", store);
contextBridge.exposeInMainWorld("agent", agent);
contextBridge.exposeInMainWorld("files", {
  getPathForFile(
    file: Parameters<typeof webUtils.getPathForFile>[0],
  ): string {
    return webUtils.getPathForFile(file);
  },
});
