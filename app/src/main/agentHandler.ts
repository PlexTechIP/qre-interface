import type { IpcMain } from "electron";

import {
  GENERATION_SCHEMA_ID,
  type AgentDraftRequest,
  type AgentDraftResult,
  type AgentProviderStatus,
} from "../shared/agentTypes.js";
import type { CredentialStore } from "./credentialStore.js";
import {
  AGENT_DRAFT_CHANNEL,
  AGENT_PREVIEW_CHANNEL,
  AGENT_STATUS_CHANNEL,
} from "./ipcChannels.js";

/**
 * What actually calls the provider. Injected so this handler owns only the
 * IPC surface and the resolve/reject convention — which provider, which
 * model, and how the request is made is a separate decision.
 *
 * `buildRequestBody` exists so the renderer can render the outbound envelope
 * before it is sent. It takes no credential and must not return one: the
 * preview is shown to the analyst, and the analyst is exactly who must never
 * be able to read the key back.
 */
export interface DraftGenerator {
  readonly provider: string;
  readonly model: string;
  buildRequestBody(prompt: string): unknown;
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

  // Read-only and credential-free: what the request WOULD be. Deliberately
  // not gated on a configured credential — the analyst is entitled to see what
  // this feature would transmit before deciding to enable it at all.
  ipcMain.handle(
    AGENT_PREVIEW_CHANNEL,
    (_event, request: unknown): unknown =>
      generator.buildRequestBody(readDraftRequest(AGENT_PREVIEW_CHANNEL, request).prompt),
  );

  ipcMain.handle(
    AGENT_DRAFT_CHANNEL,
    async (_event, payload: unknown): Promise<AgentDraftResult> => {
      const request = readDraftRequest(AGENT_DRAFT_CHANNEL, payload);

      // Reading the key can fail on a locked keychain, a denied access prompt,
      // or a blob truncated by a crash. None of those is a programmer error, so
      // none of them may reject — `hasCredential()` is only an existence check,
      // so this is the first point at which the stored blob is known to be
      // usable at all.
      let apiKey: string | null;
      try {
        apiKey = credentialStore.readForRequest();
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        return {
          ok: false,
          code: "CREDENTIAL_UNREADABLE",
          message: `The stored provider key could not be read back from the OS key store (${detail}). Enter the key again to replace it.`,
        };
      }

      if (apiKey === null) {
        throw new Error(
          "agent:draft requires a configured credential. Check window.agent.getStatus().available before requesting a draft.",
        );
      }
      return generator.requestDraft(apiKey, request.prompt);
    },
  );
}

/**
 * Narrow an IPC payload to an `AgentDraftRequest`.
 *
 * The parameter is typed on the renderer side, but it arrives here as whatever
 * the renderer actually sent — `ipcMain.handle` does no checking, and a typed
 * signature on the listener is a claim, not a guard. Both agent channels
 * dereference `.prompt`, and an unchecked one turns a missing argument into a
 * bare TypeError and a non-string prompt into JSON in an outbound provider
 * request body.
 *
 * Throws, deliberately: every failure here means the renderer half of this app
 * is not the half that was built against this main process, which is the
 * programmer-error category the estimator convention reserves rejection for.
 */
function readDraftRequest(channel: string, value: unknown): AgentDraftRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${channel} requires an AgentDraftRequest object.`);
  }
  const { prompt, generationSchema } = value as Record<string, unknown>;
  if (typeof prompt !== "string") {
    throw new Error(`${channel} requires a string prompt.`);
  }
  if (generationSchema !== GENERATION_SCHEMA_ID) {
    throw new Error(
      `${channel} expects generationSchema ${JSON.stringify(GENERATION_SCHEMA_ID)}, got ${JSON.stringify(generationSchema)}. The renderer and main bundles disagree about the generation contract.`,
    );
  }
  return { prompt, generationSchema };
}
