// @vitest-environment node

import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import type { AgentDraftResult, AgentProviderStatus } from "../shared/agentTypes.js";
import { registerAgentHandlers, type DraftGenerator } from "./agentHandler.js";
import type { CredentialStore } from "./credentialStore.js";
import {
  AGENT_DRAFT_CHANNEL,
  AGENT_PREVIEW_CHANNEL,
  AGENT_STATUS_CHANNEL,
} from "./ipcChannels.js";

type Listener = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

type StorePick = Pick<CredentialStore, "hasCredential" | "readForRequest">;

function setup(options: {
  hasCredential?: boolean;
  storedKey?: string | null;
  readError?: Error;
  draftResult?: AgentDraftResult;
} = {}) {
  const handlers = new Map<string, Listener>();
  const ipcMain: Pick<IpcMain, "handle"> = {
    handle(channel, listener) {
      handlers.set(channel, listener as Listener);
    },
  };

  const credentialStore: StorePick = {
    hasCredential: vi.fn(() => options.hasCredential ?? false),
    readForRequest: vi.fn(() => {
      if (options.readError) throw options.readError;
      return options.storedKey ?? null;
    }),
  };
  const generator: DraftGenerator = {
    provider: "Test Provider",
    model: "test-model",
    buildRequestBody: vi.fn((prompt: string) => ({ model: "test-model", prompt })),
    // The return annotation is load-bearing: without it `ok: true` widens to
    // `ok: boolean` and no longer narrows against AgentDraftResult.
    requestDraft: vi.fn(
      async (): Promise<AgentDraftResult> =>
        options.draftResult ?? {
          ok: true,
          draft: {} as never,
          provider: "Test Provider",
          model: "test-model",
        },
    ),
  };

  registerAgentHandlers(ipcMain, credentialStore, generator);

  // Mirrors `ipcMain.handle`, which turns a SYNCHRONOUS throw from a listener
  // into a rejected invoke promise on the renderer side. Letting a sync throw
  // escape this helper instead would make a rejecting handler look like a test
  // harness crash — and the preview channel's listener is synchronous.
  const invoke = <T>(channel: string, ...args: unknown[]): Promise<T> => {
    const handler = handlers.get(channel);
    if (!handler) return Promise.reject(new Error(`no handler registered for ${channel}`));
    try {
      return Promise.resolve(
        handler(undefined as unknown as IpcMainInvokeEvent, ...args) as T,
      );
    } catch (error) {
      return Promise.reject(error);
    }
  };

  return { invoke, handlers, credentialStore, generator };
}

describe("registerAgentHandlers", () => {
  it("registers exactly the status, preview and draft channels", () => {
    const { handlers } = setup();
    expect([...handlers.keys()].sort()).toEqual(
      [AGENT_DRAFT_CHANNEL, AGENT_PREVIEW_CHANNEL, AGENT_STATUS_CHANNEL].sort(),
    );
  });

  it("status reports unavailable with no credential configured", async () => {
    const { invoke } = setup({ hasCredential: false });
    const status = await invoke<AgentProviderStatus>(AGENT_STATUS_CHANNEL);
    expect(status).toEqual({
      available: false,
      networkEnabled: false,
      provider: null,
      model: null,
      mode: "unavailable",
      message: expect.stringContaining("No model provider is configured"),
    });
  });

  it("status reports available with the injected generator's provider/model", async () => {
    const { invoke } = setup({ hasCredential: true });
    const status = await invoke<AgentProviderStatus>(AGENT_STATUS_CHANNEL);
    expect(status).toEqual({
      available: true,
      networkEnabled: true,
      provider: "Test Provider",
      model: "test-model",
      mode: "provider",
    });
  });

  it("preview returns the outbound body without touching the credential", async () => {
    const { invoke, generator, credentialStore } = setup({
      hasCredential: true,
      storedKey: "sk-ant-key",
    });

    const body = await invoke(AGENT_PREVIEW_CHANNEL, {
      prompt: "estimate Grover search",
      generationSchema: "runconfig-generation-v1.4.0",
    });

    expect(generator.buildRequestBody).toHaveBeenCalledWith("estimate Grover search");
    expect(body).toEqual({ model: "test-model", prompt: "estimate Grover search" });
    // The preview is rendered to the analyst, so it must never be built from
    // anything that required decrypting the key.
    expect(credentialStore.readForRequest).not.toHaveBeenCalled();
  });

  it("preview works before a credential exists, so the feature can be inspected first", async () => {
    const { invoke } = setup({ hasCredential: false });

    await expect(
      invoke(AGENT_PREVIEW_CHANNEL, {
        prompt: "estimate something",
        generationSchema: "runconfig-generation-v1.4.0",
      }),
    ).resolves.toBeDefined();
  });

  it("draft rejects when no credential is configured — the one programmer error", async () => {
    const { invoke, generator } = setup({ hasCredential: false, storedKey: null });
    await expect(
      invoke(AGENT_DRAFT_CHANNEL, { prompt: "estimate something", generationSchema: "runconfig-generation-v1.4.0" }),
    ).rejects.toThrow(/requires a configured credential/);
    expect(generator.requestDraft).not.toHaveBeenCalled();
  });

  it("draft resolves a provider failure as data rather than rejecting", async () => {
    const failure: AgentDraftResult = { ok: false, code: "AUTHENTICATION", message: "bad key" };
    const { invoke } = setup({ hasCredential: true, storedKey: "sk-ant-key", draftResult: failure });
    const result = await invoke<AgentDraftResult>(AGENT_DRAFT_CHANNEL, {
      prompt: "estimate something",
      generationSchema: "runconfig-generation-v1.4.0",
    });
    expect(result).toEqual(failure);
  });

  it("draft forwards the prompt to the generator with the decrypted key and resolves ok", async () => {
    const { invoke, generator } = setup({ hasCredential: true, storedKey: "sk-ant-key" });
    const result = await invoke<AgentDraftResult>(AGENT_DRAFT_CHANNEL, {
      prompt: "estimate Grover search",
      generationSchema: "runconfig-generation-v1.4.0",
    });
    expect(result.ok).toBe(true);
    expect(generator.requestDraft).toHaveBeenCalledWith("sk-ant-key", "estimate Grover search");
  });

  /**
   * `hasCredential()` is only an existence check, so a blob that cannot be
   * decrypted — locked keychain, dismissed access prompt, file truncated by a
   * crash — presents as "configured" and then throws on the way out. That is
   * not a programmer error and must not reject.
   */
  it("draft resolves an undecryptable stored key as a typed failure", async () => {
    const { invoke, generator } = setup({
      hasCredential: true,
      readError: new Error("keychain item could not be decrypted"),
    });

    const result = await invoke<AgentDraftResult>(AGENT_DRAFT_CHANNEL, {
      prompt: "estimate something",
      generationSchema: "runconfig-generation-v1.4.0",
    });

    expect(result).toEqual({
      ok: false,
      code: "CREDENTIAL_UNREADABLE",
      message: expect.stringContaining("keychain item could not be decrypted"),
    });
    // Distinct from AUTHENTICATION, and the message has to say what to do.
    expect(result.ok ? "" : result.message).toMatch(/enter the key again/i);
    expect(generator.requestDraft).not.toHaveBeenCalled();
  });

  /**
   * `ipcMain.handle` does no checking, so the typed listener signature is a
   * claim about the renderer, not a guard. Both channels dereference `.prompt`
   * and one of them puts it in an outbound provider request body.
   */
  describe("request payload validation", () => {
    const badPayloads: readonly [string, unknown][] = [
      ["a missing argument", undefined],
      ["a non-object", "just a string"],
      ["an array", []],
      ["a non-string prompt", { prompt: { text: "x" }, generationSchema: "runconfig-generation-v1.4.0" }],
      ["a missing prompt", { generationSchema: "runconfig-generation-v1.4.0" }],
    ];

    for (const channel of [AGENT_PREVIEW_CHANNEL, AGENT_DRAFT_CHANNEL]) {
      for (const [description, payload] of badPayloads) {
        it(`${channel} refuses ${description}`, async () => {
          const { invoke, generator } = setup({
            hasCredential: true,
            storedKey: "sk-ant-key",
          });
          await expect(invoke(channel, payload)).rejects.toThrow();
          expect(generator.buildRequestBody).not.toHaveBeenCalled();
          expect(generator.requestDraft).not.toHaveBeenCalled();
        });
      }

      it(`${channel} refuses a generation contract it does not speak`, async () => {
        const { invoke, generator } = setup({
          hasCredential: true,
          storedKey: "sk-ant-key",
        });
        await expect(
          invoke(channel, {
            prompt: "estimate something",
            generationSchema: "runconfig-generation-v9.9.9",
          }),
        ).rejects.toThrow(/generationSchema/);
        expect(generator.requestDraft).not.toHaveBeenCalled();
      });
    }
  });
});
