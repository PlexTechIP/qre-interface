import type { IpcMain } from "electron";

import type {
  AgentDraftRequest,
  AgentDraftResult,
  AgentProviderStatus,
} from "../shared/agentTypes.js";
import type { CredentialStore } from "./credentialStore.js";
import { AGENT_DRAFT_CHANNEL, AGENT_STATUS_CHANNEL } from "./ipcChannels.js";

/**
 * What actually calls the provider. Injected so this handler owns only the
 * IPC surface and the resolve/reject convention — which provider, which
 * model, and how the request is made is a separate decision.
 */
export interface DraftGenerator {
  readonly provider: string;
  readonly model: string;
  requestDraft(apiKey: string, prompt: string): Promise<AgentDraftResult>;
}

/**
 * Registers window.agent — the fifth preload surface (docs/architecture.md's
 * decision rule): provider failures resolve carrying a typed failure, exactly
 * like the estimator's failed RunResult; only a programmer error rejects.
 *
 * The one case that rejects: a draft requested with no credential configured.
 * The renderer is expected to check getStatus().available first, so reaching
 * this handler without a credential means the caller skipped that check —
 * the same category as `RunStore.save`'s duplicate-id reject, though the
 * shape differs (a precondition on the call, not a data-integrity violation
 * on an operation already admitted). There is no "read the token back" case
 * to reject — that capability simply doesn't exist as a channel.
 */
export function registerAgentHandlers(
  ipcMain: Pick<IpcMain, "handle">,
  credentialStore: Pick<CredentialStore, "hasCredential" | "readForRequest">,
  generator: DraftGenerator,
): void {
  ipcMain.handle(AGENT_STATUS_CHANNEL, (): AgentProviderStatus => {
    if (!credentialStore.hasCredential()) {
      return {
        available: false,
        networkEnabled: false,
        provider: null,
        model: null,
        mode: "unavailable",
        message:
          "No model provider is configured. The rest of the app remains available offline.",
      };
    }
    return {
      available: true,
      networkEnabled: true,
      provider: generator.provider,
      model: generator.model,
      mode: "provider",
    };
  });

  ipcMain.handle(
    AGENT_DRAFT_CHANNEL,
    async (_event, request: AgentDraftRequest): Promise<AgentDraftResult> => {
      const apiKey = credentialStore.readForRequest();
      if (apiKey === null) {
        throw new Error(
          "agent:draft requires a configured credential. Check window.agent.getStatus().available before requesting a draft.",
        );
      }
      return generator.requestDraft(apiKey, request.prompt);
    },
  );
}
