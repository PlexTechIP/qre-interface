// @vitest-environment node
import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import type { AgentChatResult, AgentProviderStatus, ChatTurn } from "../shared/agentTypes.js";
import { registerAgentHandlers, type DraftGenerator } from "./agentHandler.js";
import type { CredentialStore } from "./credentialStore.js";
import { AGENT_CANCEL_CHANNEL, AGENT_REPLY_CHANNEL, AGENT_PREVIEW_CHANNEL, AGENT_STATUS_CHANNEL } from "./ipcChannels.js";

type Listener = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;
type Store = Pick<CredentialStore, "hasCredential" | "readForRequest">;
const TURNS = [{ role: "user" as const, content: "estimate Grover search" }];
const request = { messages: TURNS, generationSchema: "runconfig-generation-v1.4.0", provider: "openai" as const, model: "gpt-5.6-terra" };

/**
 * The handler keys in-flight requests by sender, so the event is no longer
 * ignorable: two windows must not be able to cancel each other's draft.
 */
const senderEvent = (id: number): IpcMainInvokeEvent =>
  ({ sender: { id } }) as unknown as IpcMainInvokeEvent;

interface SetupOptions {
  anthropic?: boolean;
  openai?: boolean;
  key?: string | null;
  readError?: Error;
  result?: AgentChatResult;
  /** Hold the request open until its signal aborts, so cancel has a target. */
  awaitCancel?: boolean;
}

function setup(options: SetupOptions = {}) {
  const handlers = new Map<string, Listener>();
  const ipcMain: Pick<IpcMain, "handle"> = { handle(channel, listener) { handlers.set(channel, listener as Listener); } };
  const store = (configured: boolean): Store => ({ hasCredential: vi.fn(() => configured), readForRequest: vi.fn(() => { if (options.readError) throw options.readError; return options.key ?? null; }) });
  const vault = { anthropic: store(options.anthropic ?? false), openai: store(options.openai ?? false) };
  const seenSignals: (AbortSignal | undefined)[] = [];
  const seenMessages: (readonly ChatTurn[])[] = [];
  const respond = (provider: string, model: string) =>
    vi.fn(async (_key: string, messages: readonly ChatTurn[], cancel?: AbortSignal): Promise<AgentChatResult> => {
      seenSignals.push(cancel);
      seenMessages.push(messages);
      if (options.awaitCancel === true) {
        await new Promise<void>((resolve) => cancel?.addEventListener("abort", () => resolve()));
        return { ok: false, code: "CANCELLED", message: "Request cancelled. Nothing was added to the conversation." };
      }
      return options.result ?? { ok: true, reply: "ok", draft: null, provider, model };
    });
  const generators = {
    anthropic: { create: vi.fn((model: string): DraftGenerator => ({ provider: "Anthropic", model, buildRequestBody: vi.fn((messages) => ({ provider: "anthropic", model, messages })), requestReply: respond("Anthropic", model) })) },
    openai: { create: vi.fn((model: string): DraftGenerator => ({ provider: "OpenAI", model, buildRequestBody: vi.fn((messages) => ({ provider: "openai", model, messages })), requestReply: respond("OpenAI", model) })) },
  };
  registerAgentHandlers(ipcMain, vault, generators);
  const invokeFrom = <T>(sender: number, channel: string, ...args: unknown[]): Promise<T> => {
    const handler = handlers.get(channel);
    if (!handler) return Promise.reject(new Error(`no handler registered for ${channel}`));
    try { return Promise.resolve(handler(senderEvent(sender), ...args) as T); } catch (error) { return Promise.reject(error); }
  };
  const invoke = <T>(channel: string, ...args: unknown[]): Promise<T> => invokeFrom<T>(1, channel, ...args);
  return { invoke, invokeFrom, vault, generators, seenSignals, seenMessages };
}

describe("registerAgentHandlers", () => {
  it("reports per-provider availability without exposing a key", async () => {
    const { invoke } = setup({ openai: true });
    const status = await invoke<AgentProviderStatus>(AGENT_STATUS_CHANNEL);
    expect(status).toMatchObject({ available: true, networkEnabled: true, mode: "provider" });
    expect(status.providers).toEqual(expect.arrayContaining([expect.objectContaining({ provider: "openai", configured: true }), expect.objectContaining({ provider: "anthropic", configured: false })]));
    expect(JSON.stringify(status)).not.toContain("sk-");
  });

  it("previews the selected provider without reading a credential", async () => {
    const { invoke, vault, generators } = setup({ openai: true, key: "sk-secret" });
    await expect(invoke(AGENT_PREVIEW_CHANNEL, request)).resolves.toEqual({ provider: "openai", model: "gpt-5.6-terra", messages: TURNS });
    expect(vault.openai.readForRequest).not.toHaveBeenCalled();
    expect(generators.openai.create).toHaveBeenCalledWith("gpt-5.6-terra");
  });

  it("sends through the same selected provider and keeps key decryption in main", async () => {
    const { invoke, vault } = setup({ openai: true, key: "sk-secret" });
    await expect(invoke<AgentChatResult>(AGENT_REPLY_CHANNEL, request)).resolves.toMatchObject({ ok: true, provider: "OpenAI", model: "gpt-5.6-terra" });
    expect(vault.openai.readForRequest).toHaveBeenCalledOnce();
    expect(vault.anthropic.readForRequest).not.toHaveBeenCalled();
  });

  it("rejects an unknown provider and resolves an unreadable key as data", async () => {
    const unknown = { ...request, provider: "unknown" };
    await expect(setup().invoke(AGENT_PREVIEW_CHANNEL, unknown)).rejects.toThrow(/provider id/);
    const result = await setup({ openai: true, readError: new Error("locked keychain") }).invoke<AgentChatResult>(AGENT_REPLY_CHANNEL, request);
    expect(result).toMatchObject({ ok: false, code: "CREDENTIAL_UNREADABLE" });
  });

  // The surface itself is the security boundary: an unlisted channel here would
  // be the place a key getter would appear, so the channel set is asserted
  // exactly rather than by membership. `cancel` joined it deliberately — it
  // takes no argument and returns nothing, so there is nothing for a key to
  // ride out on.
  it("registers exactly the status, preview, draft and cancel channels — no getter", () => {
    const handlers = new Map<string, Listener>();
    const ipcMain: Pick<IpcMain, "handle"> = { handle(channel, listener) { handlers.set(channel, listener as Listener); } };
    const store = (): Store => ({ hasCredential: vi.fn(() => false), readForRequest: vi.fn(() => null) });
    const generator = (): { create: (model: string) => DraftGenerator } => ({ create: (model) => ({ provider: "x", model, buildRequestBody: () => ({}), requestReply: async () => ({ ok: true, reply: "ok", draft: null, provider: "x", model }) }) });
    registerAgentHandlers(ipcMain, { anthropic: store(), openai: store() }, { anthropic: generator(), openai: generator() });

    expect([...handlers.keys()].sort()).toEqual(
      [AGENT_CANCEL_CHANNEL, AGENT_REPLY_CHANNEL, AGENT_PREVIEW_CHANNEL, AGENT_STATUS_CHANNEL].sort(),
    );
  });

  describe("agent:cancel", () => {
    it("aborts the draft this window has in flight", async () => {
      const { invoke, seenSignals } = setup({ openai: true, key: "sk-secret", awaitCancel: true });
      const draft = invoke<AgentChatResult>(AGENT_REPLY_CHANNEL, request);
      // Let the handler reach requestReply and register its controller.
      await Promise.resolve();
      await Promise.resolve();

      await invoke(AGENT_CANCEL_CHANNEL);

      await expect(draft).resolves.toMatchObject({ ok: false, code: "CANCELLED" });
      expect(seenSignals[0]?.aborted).toBe(true);
    });

    it("does nothing when there is no request in flight", async () => {
      // A cancel that races the reply is the ordinary case, not an error.
      const { invoke } = setup({ openai: true, key: "sk-secret" });
      await expect(invoke(AGENT_CANCEL_CHANNEL)).resolves.toBeUndefined();
    });

    it("cannot cancel another window's draft", async () => {
      // Keyed by sender precisely so this stays true once a second window
      // exists — which is exactly when nobody would be looking for it.
      const { invokeFrom } = setup({ openai: true, key: "sk-secret", awaitCancel: true });
      const draft = invokeFrom<AgentChatResult>(1, AGENT_REPLY_CHANNEL, request);
      await Promise.resolve();
      await Promise.resolve();

      await invokeFrom(2, AGENT_CANCEL_CHANNEL);

      let settled = false;
      void draft.then(() => { settled = true; });
      await Promise.resolve();
      expect(settled).toBe(false);

      // ...and the window that owns it can still stop it.
      await invokeFrom(1, AGENT_CANCEL_CHANNEL);
      await expect(draft).resolves.toMatchObject({ ok: false, code: "CANCELLED" });
    });
  });

  it("status reports unavailable when no provider holds a key", async () => {
    const { invoke } = setup();
    const status = await invoke<AgentProviderStatus>(AGENT_STATUS_CHANNEL);

    expect(status).toMatchObject({ available: false, networkEnabled: false, mode: "unavailable" });
    // Still enumerates both providers, so the picker can offer the one to set up.
    expect(status.providers.map((entry) => entry.provider).sort()).toEqual(["anthropic", "openai"]);
    expect(status.providers.every((entry) => !entry.configured)).toBe(true);
  });

  it("previews before any credential exists, so the feature can be inspected first", async () => {
    // Deciding whether to enable a networked feature requires seeing what it
    // would transmit — gating the preview on a stored key inverts that.
    const { invoke } = setup();
    await expect(invoke(AGENT_PREVIEW_CHANNEL, request)).resolves.toMatchObject({
      provider: "openai",
      messages: TURNS,
    });
  });

  describe("the transcript it accepts", () => {
    it("passes the whole conversation through to the generator", async () => {
      const { invoke, seenMessages } = setup({ openai: true, key: "sk-secret" });
      const messages = [
        { role: "user" as const, content: "Grover, 20 qubits" },
        { role: "assistant" as const, content: '{"reply":"Here it is.","draft":null}' },
        { role: "user" as const, content: "make the gate time 80" },
      ];

      await invoke(AGENT_REPLY_CHANNEL, { ...request, messages });

      expect(seenMessages[0]).toEqual(messages);
    });

    /**
     * Narrowed to `role` and `content` and rebuilt. A renderer that sent whole
     * stored `ChatMessage` objects would otherwise put ids, timestamps and
     * model attribution into the outbound body — visible in the preview,
     * charged for by the provider, and no part of the conversation.
     */
    it("strips everything that is not role and content", async () => {
      const { invoke, seenMessages } = setup({ openai: true, key: "sk-secret" });

      await invoke(AGENT_REPLY_CHANNEL, {
        ...request,
        messages: [
          {
            role: "user",
            content: "Grover",
            id: "m-local-id",
            createdAt: "2026-08-10T09:00:00.000Z",
            draft: null,
            model: "Anthropic/claude-sonnet-5",
          },
        ],
      });

      expect(seenMessages[0]).toEqual([{ role: "user", content: "Grover" }]);
    });

    it.each([
      ["a missing messages array", undefined],
      ["an empty transcript", []],
      ["a turn that is not an object", ["hello"]],
      ["an unknown role", [{ role: "system", content: "hi" }]],
      ["non-string content", [{ role: "user", content: { text: "hi" } }]],
    ])("rejects %s", async (_label, messages) => {
      const { invoke } = setup({ openai: true, key: "sk-secret" });
      const { messages: _omitted, ...rest } = request;
      const payload = messages === undefined ? rest : { ...rest, messages };
      await expect(invoke(AGENT_REPLY_CHANNEL, payload)).rejects.toThrow();
    });
  });

  it("draft rejects with no credential configured — the one programmer error", async () => {
    const { invoke, vault } = setup({ openai: false, key: null });

    await expect(invoke(AGENT_REPLY_CHANNEL, request)).rejects.toThrow(
      /requires a configured credential/,
    );
    // The generator is resolved before the key is read, so what matters is
    // that the read was attempted and nothing was sent afterwards — not that
    // the registry went untouched.
    expect(vault.openai.readForRequest).toHaveBeenCalledOnce();
  });

  it("draft resolves a provider failure as data rather than rejecting", async () => {
    // The estimator convention: 401/429/network are expected outcomes the UI
    // renders, not exceptions that blow up the channel.
    const failure: AgentChatResult = { ok: false, code: "AUTHENTICATION", message: "bad key" };
    const { invoke } = setup({ openai: true, key: "sk-secret", result: failure });

    await expect(invoke<AgentChatResult>(AGENT_REPLY_CHANNEL, request)).resolves.toEqual(failure);
  });

  it("rejects a model that does not belong to the selected provider", async () => {
    // Cross-provider model smuggling: without this the renderer could ask the
    // OpenAI generator for a Claude model and the preview would describe a
    // request no provider would accept.
    const { invoke } = setup({ openai: true });
    await expect(
      invoke(AGENT_REPLY_CHANNEL, { ...request, model: "claude-sonnet-5" }),
    ).rejects.toThrow(/supported model/);
  });
});
