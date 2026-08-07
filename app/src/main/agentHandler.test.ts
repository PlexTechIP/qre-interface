// @vitest-environment node

import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import type { AgentDraftResult, AgentProviderStatus } from "../shared/agentTypes.js";
import { registerAgentHandlers, type DraftGenerator } from "./agentHandler.js";
import type { CredentialStore } from "./credentialStore.js";
import { AGENT_DRAFT_CHANNEL, AGENT_STATUS_CHANNEL } from "./ipcChannels.js";

type Listener = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

type StorePick = Pick<CredentialStore, "hasCredential" | "readForRequest">;

function setup(options: {
  hasCredential?: boolean;
  storedKey?: string | null;
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
    readForRequest: vi.fn(() => options.storedKey ?? null),
  };
  const generator: DraftGenerator = {
    provider: "Test Provider",
    model: "test-model",
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

  const invoke = <T>(channel: string, ...args: unknown[]): Promise<T> => {
    const handler = handlers.get(channel);
    if (!handler) throw new Error(`no handler registered for ${channel}`);
    return Promise.resolve(
      handler(undefined as unknown as IpcMainInvokeEvent, ...args) as T,
    );
  };

  return { invoke, handlers, credentialStore, generator };
}

describe("registerAgentHandlers", () => {
  it("registers exactly the status and draft channels", () => {
    const { handlers } = setup();
    expect([...handlers.keys()].sort()).toEqual(
      [AGENT_DRAFT_CHANNEL, AGENT_STATUS_CHANNEL].sort(),
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
});
