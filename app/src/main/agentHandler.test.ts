// @vitest-environment node
import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import type {
  AgentChatResult,
  AgentProviderStatus,
  ChatTurn,
  ModelCatalogEntry,
  ProviderCatalogResult,
} from "../shared/agentTypes.js";
import { OPENROUTER_SHORTLIST } from "../shared/providerModels.js";
import { registerAgentHandlers, type DraftGenerator } from "./agentHandler.js";
import type { CredentialStore } from "./credentialStore.js";
import { ModelCatalog } from "./modelCatalog.js";
import { AGENT_CANCEL_CHANNEL, AGENT_CATALOG_CHANNEL, AGENT_REPLY_CHANNEL, AGENT_PREVIEW_CHANNEL, AGENT_STATUS_CHANNEL } from "./ipcChannels.js";

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

/** One catalogue row, with the fields no test in here cares about filled in. */
const catalogEntry = (id: string): ModelCatalogEntry => ({
  id,
  displayName: id,
  contextLength: 200_000,
  promptPricePerMillion: 3,
  completionPricePerMillion: 15,
  promoted: false,
});

interface SetupOptions {
  anthropic?: boolean;
  openai?: boolean;
  openrouter?: boolean;
  key?: string | null;
  readError?: Error;
  result?: AgentChatResult;
  /** Hold the request open until its signal aborts, so cancel has a target. */
  awaitCancel?: boolean;
  /** Warm the OpenRouter cache, as though a refresh had already happened. */
  catalogSeed?: readonly ModelCatalogEntry[];
  /** What the catalogue client resolves with when a refresh is asked for. */
  catalogResult?: ProviderCatalogResult;
}

function setup(options: SetupOptions = {}) {
  const handlers = new Map<string, Listener>();
  const ipcMain: Pick<IpcMain, "handle"> = { handle(channel, listener) { handlers.set(channel, listener as Listener); } };
  const store = (configured: boolean): Store => ({ hasCredential: vi.fn(() => configured), readForRequest: vi.fn(() => { if (options.readError) throw options.readError; return options.key ?? null; }) });
  const vault = { anthropic: store(options.anthropic ?? false), openai: store(options.openai ?? false), openrouter: store(options.openrouter ?? false) };
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
    openrouter: { create: vi.fn((model: string): DraftGenerator => ({ provider: "OpenRouter", model, buildRequestBody: vi.fn((messages) => ({ provider: "openrouter", model, messages })), requestReply: respond("OpenRouter", model) })) },
  };
  // The real cache, not a double: it is pure, already covered by its own suite,
  // and a fake here would let the handler's ordering and fallback rules be
  // asserted against behaviour the shipped cache does not have.
  const catalogCache = new ModelCatalog("openrouter", OPENROUTER_SHORTLIST);
  if (options.catalogSeed !== undefined) catalogCache.replace(options.catalogSeed);
  const catalogClient = {
    fetch: vi.fn(
      async (): Promise<ProviderCatalogResult> =>
        options.catalogResult ?? { ok: true, models: [catalogEntry("fetched/model")], credits: null },
    ),
  };
  registerAgentHandlers(ipcMain, vault, generators, {
    openrouter: { cache: catalogCache, client: catalogClient },
  });
  const invokeFrom = <T>(sender: number, channel: string, ...args: unknown[]): Promise<T> => {
    const handler = handlers.get(channel);
    if (!handler) return Promise.reject(new Error(`no handler registered for ${channel}`));
    try { return Promise.resolve(handler(senderEvent(sender), ...args) as T); } catch (error) { return Promise.reject(error); }
  };
  const invoke = <T>(channel: string, ...args: unknown[]): Promise<T> => invokeFrom<T>(1, channel, ...args);
  return { invoke, invokeFrom, vault, generators, seenSignals, seenMessages, catalogCache, catalogClient };
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
  // ride out on. `catalog` joined on the same terms: it takes a provider id and
  // returns models and a dollar balance, and the key it reads never leaves main.
  it("registers exactly the status, preview, draft, cancel and catalog channels — no getter", () => {
    const handlers = new Map<string, Listener>();
    const ipcMain: Pick<IpcMain, "handle"> = { handle(channel, listener) { handlers.set(channel, listener as Listener); } };
    const store = (): Store => ({ hasCredential: vi.fn(() => false), readForRequest: vi.fn(() => null) });
    const generator = (): { create: (model: string) => DraftGenerator } => ({ create: (model) => ({ provider: "x", model, buildRequestBody: () => ({}), requestReply: async () => ({ ok: true, reply: "ok", draft: null, provider: "x", model }) }) });
    registerAgentHandlers(
      ipcMain,
      { anthropic: store(), openai: store(), openrouter: store() },
      { anthropic: generator(), openai: generator(), openrouter: generator() },
    );

    expect([...handlers.keys()].sort()).toEqual(
      [AGENT_CANCEL_CHANNEL, AGENT_CATALOG_CHANNEL, AGENT_REPLY_CHANNEL, AGENT_PREVIEW_CHANNEL, AGENT_STATUS_CHANNEL].sort(),
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
    // Still enumerates every provider, so the picker can offer one to set up.
    expect(status.providers.map((entry) => entry.provider).sort()).toEqual([
      "anthropic",
      "openai",
      "openrouter",
    ]);
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

/**
 * OpenRouter's model list is data, not a constant, which changes what the model
 * gate can promise. For the first-party providers an unknown model means the
 * renderer and main bundles disagree, and rejecting is right. Here it can also
 * mean the aggregator's inventory moved under a selection the analyst made last
 * week — an ordinary event that has to arrive as something the UI can render.
 */
describe("registerAgentHandlers — the OpenRouter catalogue", () => {
  it("offers the shipped shortlist while nothing has been fetched", async () => {
    const { invoke } = setup({ openrouter: true });
    const status = await invoke<AgentProviderStatus>(AGENT_STATUS_CHANNEL);
    const openrouter = status.providers.find((entry) => entry.provider === "openrouter");

    expect(openrouter?.models).toEqual([...OPENROUTER_SHORTLIST]);
    // Null, not absent and not empty. Absent would mean "no catalogue to
    // fetch", which is what the first-party providers report and what Settings
    // reads to decide whether to offer a refresh at all; empty would claim a
    // fetch that never ran.
    expect(openrouter?.catalog).toBeNull();
  });

  it("offers what the provider actually routes once a catalogue exists", async () => {
    const { invoke } = setup({
      openrouter: true,
      catalogSeed: [catalogEntry("openai/gpt-5.6-terra"), catalogEntry("meta-llama/llama-4-scout")],
    });
    const status = await invoke<AgentProviderStatus>(AGENT_STATUS_CHANNEL);
    const openrouter = status.providers.find((entry) => entry.provider === "openrouter");

    expect(openrouter?.models).toEqual(["openai/gpt-5.6-terra", "meta-llama/llama-4-scout"]);
    expect(openrouter?.catalog).toMatchObject([
      { id: "openai/gpt-5.6-terra", promoted: true, contextLength: 200_000 },
      { id: "meta-llama/llama-4-scout", promoted: false },
    ]);
  });

  /**
   * The shipped default is `anthropic/claude-sonnet-5`. If OpenRouter is not
   * routing it, handing it back as the default would pre-select an option the
   * picker cannot show and the gate will refuse — a new analyst's very first
   * send failing for a reason they had no part in.
   */
  it("does not default to a model the provider has stopped routing", async () => {
    const { invoke } = setup({
      openrouter: true,
      catalogSeed: [catalogEntry("meta-llama/llama-4-scout")],
    });
    const status = await invoke<AgentProviderStatus>(AGENT_STATUS_CHANNEL);
    const openrouter = status.providers.find((entry) => entry.provider === "openrouter");

    expect(openrouter?.defaultModel).toBe("meta-llama/llama-4-scout");
  });

  /**
   * Not null — absent. Anthropic and OpenAI have no catalogue to fetch, and
   * that is different from having one that has not been fetched. Settings uses
   * exactly this distinction to decide which cards get a refresh control.
   */
  it("leaves the first-party providers with no catalogue field at all", async () => {
    const { invoke } = setup({ openai: true, catalogSeed: [catalogEntry("a/b")] });
    const status = await invoke<AgentProviderStatus>(AGENT_STATUS_CHANNEL);
    const openai = status.providers.find((entry) => entry.provider === "openai");

    expect(openai).not.toHaveProperty("catalog");
    expect(status.providers.find((entry) => entry.provider === "anthropic")?.models).toEqual([
      "claude-haiku-4-5",
      "claude-sonnet-5",
      "claude-opus-5",
    ]);
  });
});

describe("registerAgentHandlers — refreshing the catalogue", () => {
  it("fetches with the stored key and adopts the result", async () => {
    const { invoke, catalogClient, catalogCache } = setup({ openrouter: true, key: "sk-or-secret" });

    const result = await invoke<ProviderCatalogResult>(AGENT_CATALOG_CHANNEL, "openrouter");

    expect(catalogClient.fetch).toHaveBeenCalledWith("sk-or-secret");
    expect(result).toMatchObject({ ok: true, models: [{ id: "fetched/model" }] });
    expect(catalogCache.accepts("fetched/model")).toBe(true);
  });

  it("hands back the promoted ordering, not the provider's raw order", async () => {
    const { invoke } = setup({
      openrouter: true,
      key: "sk-or-secret",
      catalogResult: {
        ok: true,
        models: [catalogEntry("zzz/unpromoted"), catalogEntry("openai/gpt-5.6-terra")],
        credits: { remaining: 4.5, used: 0.5, limit: 5 },
      },
    });

    const result = await invoke<ProviderCatalogResult>(AGENT_CATALOG_CHANNEL, "openrouter");

    expect(result).toMatchObject({
      ok: true,
      credits: { remaining: 4.5, used: 0.5, limit: 5 },
    });
    if (!result.ok) return;
    expect(result.models.map((entry) => entry.id)).toEqual([
      "openai/gpt-5.6-terra",
      "zzz/unpromoted",
    ]);
  });

  /**
   * Not a throw. The refresh button lives beside a key card that can be emptied
   * in another window, and it is reachable the moment the page renders — so "no
   * key" is a race the analyst can lose through no fault of the bundle.
   */
  it("resolves as data when no key is stored", async () => {
    const { invoke, catalogClient } = setup({ openrouter: false, key: null });

    await expect(invoke<ProviderCatalogResult>(AGENT_CATALOG_CHANNEL, "openrouter")).resolves
      .toMatchObject({ ok: false, code: "AUTHENTICATION" });
    expect(catalogClient.fetch).not.toHaveBeenCalled();
  });

  it("resolves an unreadable key as data", async () => {
    const { invoke } = setup({ openrouter: true, readError: new Error("locked keychain") });

    await expect(invoke<ProviderCatalogResult>(AGENT_CATALOG_CHANNEL, "openrouter")).resolves
      .toMatchObject({ ok: false, code: "CREDENTIAL_UNREADABLE" });
  });

  /**
   * A failed refresh must not empty the picker. The analyst still has a working
   * selection; taking it away because a list request timed out would turn a
   * degraded refresh into a broken provider.
   */
  it("keeps the previous catalogue when a refresh fails", async () => {
    const { invoke, catalogCache } = setup({
      openrouter: true,
      key: "sk-or-secret",
      catalogSeed: [catalogEntry("kept/model")],
      catalogResult: { ok: false, code: "RATE_LIMITED", message: "slow down" },
    });

    await expect(invoke<ProviderCatalogResult>(AGENT_CATALOG_CHANNEL, "openrouter")).resolves
      .toMatchObject({ ok: false, code: "RATE_LIMITED" });
    expect(catalogCache.list()?.map((entry) => entry.id)).toEqual(["kept/model"]);
  });

  it("rejects a refresh for a provider that has no catalogue to refresh", async () => {
    const { invoke } = setup({ anthropic: true, key: "sk-ant" });

    await expect(invoke(AGENT_CATALOG_CHANNEL, "anthropic")).rejects.toThrow(/catalogue/);
    await expect(invoke(AGENT_CATALOG_CHANNEL, "nonsense")).rejects.toThrow(/provider id/);
  });
});

describe("registerAgentHandlers — the data-driven model gate", () => {
  const orRequest = (model: string) => ({
    messages: TURNS,
    generationSchema: "runconfig-generation-v1.4.0",
    provider: "openrouter" as const,
    model,
  });

  it("sends a well-formed slug through while the catalogue is cold", async () => {
    const { invoke } = setup({ openrouter: true, key: "sk-or-secret" });

    await expect(
      invoke<AgentChatResult>(AGENT_REPLY_CHANNEL, orRequest("mistralai/mistral-large-2512")),
    ).resolves.toMatchObject({ ok: true, provider: "OpenRouter" });
  });

  it("refuses a model the fetched catalogue does not list, as data", async () => {
    const { invoke, vault, generators } = setup({
      openrouter: true,
      key: "sk-or-secret",
      catalogSeed: [catalogEntry("openai/gpt-5.6-terra")],
    });

    const result = await invoke<AgentChatResult>(
      AGENT_REPLY_CHANNEL,
      orRequest("mistralai/mistral-large-2512"),
    );

    expect(result).toMatchObject({ ok: false, code: "UNSUPPORTED_MODEL" });
    if (result.ok) return;
    expect(result.message).toContain("mistralai/mistral-large-2512");
    // Nothing was spent finding out: no keychain prompt, no generator built.
    expect(vault.openrouter.readForRequest).not.toHaveBeenCalled();
    expect(generators.openrouter.create).not.toHaveBeenCalled();
  });

  /**
   * A slug that is not `vendor/model` is not a stale selection — no version of
   * this app's picker can produce one — so it stays in the reject category the
   * first-party providers use.
   */
  it("still rejects a malformed slug as a bundle mismatch", async () => {
    const { invoke } = setup({ openrouter: true, key: "sk-or-secret" });

    await expect(invoke(AGENT_REPLY_CHANNEL, orRequest("claude-sonnet-5"))).rejects.toThrow(
      /supported model/,
    );
  });

  /**
   * Preview answers "what would this send", which is a question worth answering
   * even about a model that would be refused — otherwise the one surface that
   * explains the outbound request goes dark exactly when something is wrong.
   */
  it("still previews a model the catalogue would refuse", async () => {
    const { invoke } = setup({
      openrouter: true,
      catalogSeed: [catalogEntry("openai/gpt-5.6-terra")],
    });

    await expect(
      invoke(AGENT_PREVIEW_CHANNEL, orRequest("mistralai/mistral-large-2512")),
    ).resolves.toMatchObject({ provider: "openrouter", model: "mistralai/mistral-large-2512" });
  });
});

describe("registerAgentHandlers — a catalogue client that misbehaves", () => {
  /**
   * The channel's contract is that failures resolve as data. `readForRequest`
   * is already contained for that reason; the fetch was not, so a client that
   * rejected instead of resolving broke the promise the docstring makes.
   * `credentialHandler` contains `validator.validate` for exactly this case.
   */
  it("contains a rejecting client rather than rejecting the channel", async () => {
    const handlers = new Map<string, Listener>();
    const ipcMain: Pick<IpcMain, "handle"> = { handle(channel, listener) { handlers.set(channel, listener as Listener); } };
    const store = (): Store => ({ hasCredential: vi.fn(() => true), readForRequest: vi.fn(() => "sk-or-secret") });
    const generator = (): { create: (model: string) => DraftGenerator } => ({ create: (model) => ({ provider: "x", model, buildRequestBody: () => ({}), requestReply: async () => ({ ok: true, reply: "ok", draft: null, provider: "x", model }) }) });
    registerAgentHandlers(
      ipcMain,
      { anthropic: store(), openai: store(), openrouter: store() },
      { anthropic: generator(), openai: generator(), openrouter: generator() },
      {
        openrouter: {
          cache: new ModelCatalog("openrouter", OPENROUTER_SHORTLIST),
          client: { fetch: async () => { throw new Error("bridge exploded"); } },
        },
      },
    );

    const result = await (handlers.get(AGENT_CATALOG_CHANNEL) as Listener)(
      senderEvent(1),
      "openrouter",
    );

    expect(result).toMatchObject({ ok: false, code: "NETWORK" });
    expect(JSON.stringify(result)).toContain("bridge exploded");
  });
});

describe("registerAgentHandlers — overlapping refreshes", () => {
  /**
   * Two windows, two Refresh presses. Without coalescing the later fetch could
   * resolve first and be overwritten by the earlier one, leaving main holding
   * the older catalogue while the window that asked last displays the newer —
   * a disagreement nothing in the app would ever correct.
   */
  it("coalesces concurrent refreshes into one fetch", async () => {
    const release: { resolve: (() => void) | null } = { resolve: null };
    const gate = new Promise<void>((resolve) => {
      release.resolve = resolve;
    });
    const { invoke, invokeFrom, catalogClient, catalogCache } = setup({
      openrouter: true,
      key: "sk-or-secret",
    });
    catalogClient.fetch.mockImplementation(async () => {
      await gate;
      return { ok: true, models: [catalogEntry("only/one")], credits: null };
    });

    const first = invoke<ProviderCatalogResult>(AGENT_CATALOG_CHANNEL, "openrouter");
    const second = invokeFrom<ProviderCatalogResult>(2, AGENT_CATALOG_CHANNEL, "openrouter");
    release.resolve?.();
    const [a, b] = await Promise.all([first, second]);

    expect(catalogClient.fetch).toHaveBeenCalledOnce();
    expect(a).toMatchObject({ ok: true, models: [{ id: "only/one" }] });
    expect(b).toMatchObject({ ok: true, models: [{ id: "only/one" }] });
    expect(catalogCache.list()?.map((entry) => entry.id)).toEqual(["only/one"]);
  });

  /** A refresh after the previous one settled is a fresh call, not a replay. */
  it("does not cache the coalesced result past its own flight", async () => {
    const { invoke, catalogClient } = setup({ openrouter: true, key: "sk-or-secret" });

    await invoke(AGENT_CATALOG_CHANNEL, "openrouter");
    await invoke(AGENT_CATALOG_CHANNEL, "openrouter");

    expect(catalogClient.fetch).toHaveBeenCalledTimes(2);
  });
});
