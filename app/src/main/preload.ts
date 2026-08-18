import { contextBridge, ipcRenderer, webUtils } from "electron";
import type {
  AgentChatRequest,
  AgentChatResult,
  AgentReplyDelta,
  AgentProviderStatus,
  AgentService,
  CredentialClearResult,
  CredentialConfigureResult,
  ProviderCatalogResult,
  ProviderId,
} from "../shared/agentTypes.js";
import type {
  AppInfoService,
  RevealResult,
  StorageInfo,
  StorageLocationId,
} from "../shared/appInfoTypes.js";
import type {
  ChatMessage,
  ChatStore,
  Conversation,
  ConversationSummary,
  NewConversation,
} from "../shared/chatTypes.js";
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
  AGENT_CANCEL_CHANNEL,
  AGENT_CATALOG_CHANNEL,
  AGENT_REPLY_DELTA_CHANNEL,
  AGENT_PREVIEW_CHANNEL,
  AGENT_REPLY_CHANNEL,
  AGENT_STATUS_CHANNEL,
  APP_INFO_REVEAL_CHANNEL,
  APP_INFO_STORAGE_CHANNEL,
  CHAT_APPEND_CHANNEL,
  CHAT_CLEAR_CHANNEL,
  CHAT_CREATE_CHANNEL,
  CHAT_DELETE_CHANNEL,
  CHAT_GET_CHANNEL,
  CHAT_LIST_CHANNEL,
  CHAT_RENAME_CHANNEL,
  CHAT_SEARCH_CHANNEL,
  CREDENTIAL_CLEAR_CHANNEL,
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
// and requestReply() (which rejects only if the status check was skipped),
// cancelReply() and clearCredential() (both of which only ever DESTROY state),
// and hand a key one-way to configureCredential(). Nothing here returns a key,
// and there is no channel on the other side that could.
const agent: AgentService = {
  getStatus(): Promise<AgentProviderStatus> {
    return ipcRenderer.invoke(AGENT_STATUS_CHANNEL) as Promise<AgentProviderStatus>;
  },
  previewRequest(request: AgentChatRequest): Promise<unknown> {
    return ipcRenderer.invoke(AGENT_PREVIEW_CHANNEL, request);
  },
  requestReply(request: AgentChatRequest): Promise<AgentChatResult> {
    return ipcRenderer.invoke(AGENT_REPLY_CHANNEL, request) as Promise<AgentChatResult>;
  },
  cancelReply(): Promise<void> {
    return ipcRenderer.invoke(AGENT_CANCEL_CHANNEL) as Promise<void>;
  },
  // Takes a provider id and returns models and a dollar balance. It reads the
  // stored key in main to make the request, and — like every other method here
  // — has no way to give it back.
  refreshCatalog(provider: ProviderId): Promise<ProviderCatalogResult> {
    return ipcRenderer.invoke(AGENT_CATALOG_CHANNEL, provider) as Promise<ProviderCatalogResult>;
  },
  /*
   * The one listener on this surface, and the only place `ipcRenderer.on`
   * appears in the preload at all.
   *
   * The IpcRendererEvent is deliberately not forwarded: it carries `sender` and
   * `ports`, which are handles into the main process, and handing those to the
   * renderer would put a capability behind a callback that exists to deliver
   * strings. Only the payload crosses.
   */
  onReplyDelta(listener: (delta: AgentReplyDelta) => void): () => void {
    const forward = (_event: unknown, delta: AgentReplyDelta): void => listener(delta);
    ipcRenderer.on(AGENT_REPLY_DELTA_CHANNEL, forward);
    return () => {
      ipcRenderer.removeListener(AGENT_REPLY_DELTA_CHANNEL, forward);
    };
  },
  configureCredential(
    provider: Parameters<AgentService["configureCredential"]>[0],
    apiKey: string,
  ): Promise<CredentialConfigureResult> {
    return ipcRenderer.invoke(
      CREDENTIAL_CONFIGURE_CHANNEL,
      provider,
      apiKey,
    ) as Promise<CredentialConfigureResult>;
  },
  clearCredential(
    provider: Parameters<AgentService["clearCredential"]>[0],
  ): Promise<CredentialClearResult> {
    return ipcRenderer.invoke(
      CREDENTIAL_CLEAR_CHANNEL,
      provider,
    ) as Promise<CredentialClearResult>;
  },
};

// window.chats — the sixth surface, and a STORE, not a second agent. It reaches
// its own SQLite file and never a provider; window.agent sends and never
// persists. Splitting them that way is what makes the chat history readable
// with the network off, and keeps "delete all my transcripts" a database
// operation rather than something that has to be coordinated with a key.
const chats: ChatStore = {
  list(): Promise<ConversationSummary[]> {
    return ipcRenderer.invoke(CHAT_LIST_CHANNEL) as Promise<ConversationSummary[]>;
  },
  get(id: string): Promise<Conversation | null> {
    return ipcRenderer.invoke(CHAT_GET_CHANNEL, id) as Promise<Conversation | null>;
  },
  create(conversation: NewConversation): Promise<void> {
    return ipcRenderer.invoke(CHAT_CREATE_CHANNEL, conversation) as Promise<void>;
  },
  append(conversationId: string, message: ChatMessage): Promise<void> {
    return ipcRenderer.invoke(CHAT_APPEND_CHANNEL, conversationId, message) as Promise<void>;
  },
  rename(id: string, title: string): Promise<void> {
    return ipcRenderer.invoke(CHAT_RENAME_CHANNEL, id, title) as Promise<void>;
  },
  delete(id: string): Promise<void> {
    return ipcRenderer.invoke(CHAT_DELETE_CHANNEL, id) as Promise<void>;
  },
  clear(): Promise<void> {
    return ipcRenderer.invoke(CHAT_CLEAR_CHANNEL) as Promise<void>;
  },
  search(query: string): Promise<ConversationSummary[]> {
    return ipcRenderer.invoke(CHAT_SEARCH_CHANNEL, query) as Promise<ConversationSummary[]>;
  },
};

/**
 * Where this install keeps its data — read-only, and the reveal call names a
 * location rather than a path (see appInfoTypes.ts). Kept off `store` and
 * `chats` deliberately: those are each ONE database's contents, and this
 * describes the app's data directory as a whole.
 */
const appInfo: AppInfoService = {
  getStorage(): Promise<StorageInfo> {
    return ipcRenderer.invoke(APP_INFO_STORAGE_CHANNEL) as Promise<StorageInfo>;
  },
  reveal(id: StorageLocationId): Promise<RevealResult> {
    return ipcRenderer.invoke(APP_INFO_REVEAL_CHANNEL, id) as Promise<RevealResult>;
  },
};

contextBridge.exposeInMainWorld("estimator", estimator);
contextBridge.exposeInMainWorld("appInfo", appInfo);
contextBridge.exposeInMainWorld("uploads", uploads);
contextBridge.exposeInMainWorld("store", store);
contextBridge.exposeInMainWorld("agent", agent);
contextBridge.exposeInMainWorld("chats", chats);
contextBridge.exposeInMainWorld("files", {
  getPathForFile(
    file: Parameters<typeof webUtils.getPathForFile>[0],
  ): string {
    return webUtils.getPathForFile(file);
  },
});
