import type { IpcMain } from "electron";

import {
  GENERATION_SCHEMA_ID,
  PROVIDER_IDS,
  type AgentChatRequest,
  type AgentChatResult,
  type AgentProviderStatus,
  type ChatTurn,
  type ProviderId,
} from "../shared/agentTypes.js";
import { isModelForProvider, isProviderId, PROVIDER_MODELS } from "../shared/providerModels.js";
import type { CredentialStore } from "./credentialStore.js";
import {
  AGENT_CANCEL_CHANNEL,
  AGENT_PREVIEW_CHANNEL,
  AGENT_REPLY_CHANNEL,
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
  /**
   * Takes the whole transcript, because the adapter is given no memory of its
   * own. The conversation is the renderer's, persisted in the chat store; this
   * process learns nothing between two calls, which is what keeps a preview
   * equal to the thing that would actually be sent.
   */
  buildRequestBody(messages: readonly ChatTurn[]): unknown;
  /**
   * `cancel` is the analyst abandoning the request, not a deadline — the
   * adapter keeps its own timeout and distinguishes the two, so an aborted
   * request reports CANCELLED rather than blaming the provider for being slow.
   */
  requestReply(
    apiKey: string,
    messages: readonly ChatTurn[],
    cancel?: AbortSignal,
  ): Promise<AgentChatResult>;
}

export interface DraftGeneratorFactory {
  create(model: string): DraftGenerator;
}

type CredentialVault = Record<
  ProviderId,
  Pick<CredentialStore, "hasCredential" | "readForRequest">
>;
type DraftGeneratorRegistry = Record<ProviderId, DraftGeneratorFactory>;

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
  vault: CredentialVault,
  generators: DraftGeneratorRegistry,
): void {
  ipcMain.handle(AGENT_STATUS_CHANNEL, (): AgentProviderStatus => {
    const providers = PROVIDER_IDS.map((provider) => ({
      provider,
      displayName: PROVIDER_MODELS[provider].displayName,
      configured: vault[provider].hasCredential(),
      models: PROVIDER_MODELS[provider].models,
      defaultModel: PROVIDER_MODELS[provider].defaultModel,
    }));
    if (!providers.some((provider) => provider.configured)) {
      return {
        available: false,
        networkEnabled: false,
        providers,
        mode: "unavailable",
        message:
          "No model provider is configured. The rest of the app remains available offline.",
      };
    }
    return {
      available: true,
      networkEnabled: true,
      providers,
      mode: "provider",
    };
  });

  // Read-only and credential-free: what the request WOULD be. Deliberately
  // not gated on a configured credential — the analyst is entitled to see what
  // this feature would transmit before deciding to enable it at all.
  ipcMain.handle(
    AGENT_PREVIEW_CHANNEL,
    (_event, payload: unknown): unknown => {
      const request = readChatRequest(AGENT_PREVIEW_CHANNEL, payload);
      return generatorFor(generators, request).buildRequestBody(request.messages);
    },
  );

  /**
   * The turn this window has in flight, so `agent:cancel` has something to
   * abort. Keyed by sender rather than held as a single controller: one window
   * cancelling another's request would be a cross-talk bug that only appears
   * once someone opens a second window, which is exactly when nobody is looking
   * for it.
   *
   * Main-process state, but not the kind the week-5 seam forbids — provider and
   * model still travel with every request. What lives here is one in-flight
   * request's abort handle, which cannot outlive the request that made it.
   */
  const inFlight = new Map<number, AbortController>();

  ipcMain.handle(AGENT_CANCEL_CHANNEL, (event): void => {
    // A cancel that races the reply finds nothing and does nothing. That is the
    // ordinary case, not an error: the analyst pressed a button that had just
    // stopped meaning anything.
    inFlight.get(event.sender.id)?.abort();
  });

  ipcMain.handle(
    AGENT_REPLY_CHANNEL,
    async (event, payload: unknown): Promise<AgentChatResult> => {
      const request = readChatRequest(AGENT_REPLY_CHANNEL, payload);
      const generator = generatorFor(generators, request);
      const credentialStore = vault[request.provider];

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
          "agent:reply requires a configured credential. Check window.agent.getStatus().available before sending a turn.",
        );
      }

      // Registered only now: a cancel arriving before the credential is read has
      // nothing to stop, and an entry left in the map by an early return would
      // let the NEXT request be cancelled by a stale press of the last one.
      const controller = new AbortController();
      const sender = event.sender.id;
      inFlight.get(sender)?.abort();
      inFlight.set(sender, controller);
      try {
        return await generator.requestReply(apiKey, request.messages, controller.signal);
      } finally {
        // Only if it is still ours. A second request that started while this one
        // was in flight already owns the slot, and clearing it unconditionally
        // would leave that one uncancellable.
        if (inFlight.get(sender) === controller) inFlight.delete(sender);
      }
    },
  );
}

/**
 * Narrow an IPC payload to an `AgentChatRequest`.
 *
 * The parameter is typed on the renderer side, but it arrives here as whatever
 * the renderer actually sent — `ipcMain.handle` does no checking, and a typed
 * signature on the listener is a claim, not a guard. Both agent channels feed
 * `.messages` straight into an outbound provider request body, so an unchecked
 * one turns a missing argument into a bare TypeError and a malformed turn into
 * a 400 whose text names no field the analyst has ever seen.
 *
 * Ordering is deliberately NOT checked. Providers disagree about whether a
 * transcript may end on an assistant turn, and a rule invented here would be
 * this app's rule rather than theirs — enforced by a rejection, which is the
 * harshest outcome on this surface. Shape is checked because shape is what this
 * process can be sure about.
 *
 * Throws, deliberately: every failure here means the renderer half of this app
 * is not the half that was built against this main process, which is the
 * programmer-error category the estimator convention reserves rejection for.
 */
function readChatRequest(channel: string, value: unknown): AgentChatRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${channel} requires an AgentChatRequest object.`);
  }
  const { messages, generationSchema, provider, model } = value as Record<string, unknown>;
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error(`${channel} requires a non-empty messages array.`);
  }
  const turns = messages.map((turn, index) => readChatTurn(channel, turn, index));
  if (generationSchema !== GENERATION_SCHEMA_ID) {
    throw new Error(
      `${channel} expects generationSchema ${JSON.stringify(GENERATION_SCHEMA_ID)}, got ${JSON.stringify(generationSchema)}. The renderer and main bundles disagree about the generation contract.`,
    );
  }
  if (!isProviderId(provider)) {
    throw new Error(`${channel} requires a supported provider id.`);
  }
  if (!isModelForProvider(provider, model)) {
    throw new Error(`${channel} requires a supported model for ${provider}.`);
  }
  return { messages: turns, generationSchema, provider, model };
}

/**
 * One turn, narrowed to exactly `role` and `content`.
 *
 * Rebuilt rather than passed through: a renderer that sent a whole stored
 * `ChatMessage` by mistake would otherwise put its id, timestamps and model
 * attribution into the outbound body, where the analyst's preview would show
 * them and the provider would be billed for them.
 */
function readChatTurn(channel: string, value: unknown, index: number): ChatTurn {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${channel} requires message ${index} to be an object.`);
  }
  const { role, content } = value as Record<string, unknown>;
  if (role !== "user" && role !== "assistant") {
    throw new Error(`${channel} requires message ${index} to have role "user" or "assistant".`);
  }
  if (typeof content !== "string") {
    throw new Error(`${channel} requires message ${index} to have string content.`);
  }
  return { role, content };
}

function generatorFor(
  registry: DraftGeneratorRegistry,
  request: AgentChatRequest,
): DraftGenerator {
  return registry[request.provider].create(request.model);
}
