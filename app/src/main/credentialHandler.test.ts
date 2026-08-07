// @vitest-environment node
import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import type { CredentialConfigureResult, ProviderId } from "../shared/agentTypes.js";
import { registerCredentialHandlers } from "./credentialHandler.js";
import type { CredentialBackendCheck } from "./credentialStore.js";
import type { CredentialValidationResult } from "./credentialValidator.js";
import { CREDENTIAL_CONFIGURE_CHANNEL, CREDENTIAL_STATUS_CHANNEL } from "./ipcChannels.js";

type Listener = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

/**
 * Each provider gets its OWN store and validator double. That matters: the
 * handler must reach for the store belonging to the provider being configured,
 * and shared doubles would make a cross-provider mix-up invisible.
 */
function makeStore() {
  return {
    hasCredential: vi.fn((): boolean => false),
    checkBackend: vi.fn((): CredentialBackendCheck => ({ ok: true })),
    write: vi.fn((): void => {}),
  };
}

function makeValidator() {
  return { validate: vi.fn(async (): Promise<CredentialValidationResult> => ({ ok: true })) };
}

function setup() {
  const handlers = new Map<string, Listener>();
  const ipcMain: Pick<IpcMain, "handle"> = {
    handle(channel, listener) {
      handlers.set(channel, listener as Listener);
    },
  };
  const vault = { anthropic: makeStore(), openai: makeStore() };
  const validators = { anthropic: makeValidator(), openai: makeValidator() };

  registerCredentialHandlers(ipcMain, vault, validators);

  const invoke = <T>(provider: unknown, apiKey: unknown): Promise<T> => {
    const handler = handlers.get(CREDENTIAL_CONFIGURE_CHANNEL);
    if (!handler) return Promise.reject(new Error("configure channel not registered"));
    try {
      return Promise.resolve(
        handler(undefined as unknown as IpcMainInvokeEvent, provider, apiKey) as T,
      );
    } catch (error) {
      return Promise.reject(error);
    }
  };
  const invokeStatus = (): Promise<Record<ProviderId, boolean>> =>
    Promise.resolve(
      handlers.get(CREDENTIAL_STATUS_CHANNEL)!(
        undefined as unknown as IpcMainInvokeEvent,
      ) as Record<ProviderId, boolean>,
    );

  return { handlers, invoke, invokeStatus, vault, validators };
}

describe("registerCredentialHandlers", () => {
  it("validates and stores only the selected provider's key", async () => {
    const { invoke, vault, validators } = setup();

    await expect(invoke<CredentialConfigureResult>("openai", "sk-openai-key")).resolves.toEqual({
      ok: true,
    });
    expect(validators.openai.validate).toHaveBeenCalledWith("sk-openai-key");
    expect(vault.openai.write).toHaveBeenCalledWith("sk-openai-key");
    expect(vault.anthropic.write).not.toHaveBeenCalled();
    expect(validators.anthropic.validate).not.toHaveBeenCalled();
  });

  it("checks the backend of the store it is about to write, not another provider's", async () => {
    // Interrogating one provider's store to authorise a write to another's is
    // the trap here: an OpenAI key must be gated on the OpenAI store's check.
    const { invoke, vault } = setup();
    await invoke("openai", "sk-openai-key");

    expect(vault.openai.checkBackend).toHaveBeenCalledOnce();
    expect(vault.anthropic.checkBackend).not.toHaveBeenCalled();
  });

  it("rejects an invalid provider, a blank key, and a non-string key", async () => {
    const { invoke } = setup();
    await expect(invoke("other", "key")).rejects.toThrow(/provider id/);
    await expect(invoke("anthropic", "  ")).rejects.toThrow(/non-empty API key/);
    await expect(invoke("anthropic", 12345)).rejects.toThrow(/non-empty API key/);
  });

  // The channel set IS the no-getter guarantee: a third channel is where a
  // "read the key back" would appear, so it is asserted exactly.
  it("registers exactly the status and configure channels — no getter", () => {
    const { handlers } = setup();
    expect([...handlers.keys()].sort()).toEqual(
      [CREDENTIAL_CONFIGURE_CHANNEL, CREDENTIAL_STATUS_CHANNEL].sort(),
    );
  });

  it("status reports plain per-provider booleans, never a key", async () => {
    const { invokeStatus, vault } = setup();
    vault.anthropic.hasCredential.mockReturnValue(true);

    await expect(invokeStatus()).resolves.toEqual({ anthropic: true, openai: false });
  });

  it("refuses the plaintext-fallback backend as data, without validating or writing", async () => {
    // safeStorage's basic_text fallback "encrypts" with a hardcoded password.
    // Nothing may be validated or written under it.
    const { invoke, vault, validators } = setup();
    vault.anthropic.checkBackend.mockReturnValue({
      ok: false,
      code: "BACKEND_UNAVAILABLE",
      message: "no OS secret store; encryption would be theatre",
    });

    await expect(
      invoke<CredentialConfigureResult>("anthropic", "sk-ant-key"),
    ).resolves.toMatchObject({ ok: false, code: "BACKEND_UNAVAILABLE" });
    expect(validators.anthropic.validate).not.toHaveBeenCalled();
    expect(vault.anthropic.write).not.toHaveBeenCalled();
  });

  it("resolves a provider validation failure as data without writing", async () => {
    const { invoke, vault, validators } = setup();
    validators.anthropic.validate.mockResolvedValue({
      ok: false,
      code: "AUTHENTICATION",
      message: "The provider rejected this key.",
    });

    await expect(
      invoke<CredentialConfigureResult>("anthropic", "sk-ant-bad"),
    ).resolves.toMatchObject({ ok: false, code: "AUTHENTICATION" });
    expect(vault.anthropic.write).not.toHaveBeenCalled();
  });

  // The three containment paths. Each reaches outside this process, each can
  // throw for reasons that are not programmer errors, and none may reject the
  // channel and strand the analyst with a raw stack instead of a message.
  it("resolves a throwing backend check as data rather than rejecting", async () => {
    const { invoke, vault } = setup();
    vault.anthropic.checkBackend.mockImplementation(() => {
      throw new TypeError("getSelectedStorageBackend is not a function");
    });

    await expect(
      invoke<CredentialConfigureResult>("anthropic", "sk-ant-key"),
    ).resolves.toMatchObject({ ok: false, code: "BACKEND_UNAVAILABLE" });
    expect(vault.anthropic.write).not.toHaveBeenCalled();
  });

  it("resolves a throwing validator as data rather than rejecting", async () => {
    const { invoke, vault, validators } = setup();
    validators.anthropic.validate.mockRejectedValue(new Error("socket hang up"));

    await expect(
      invoke<CredentialConfigureResult>("anthropic", "sk-ant-key"),
    ).resolves.toMatchObject({ ok: false, code: "NETWORK" });
    expect(vault.anthropic.write).not.toHaveBeenCalled();
  });

  it("resolves a write failure as data rather than throwing", async () => {
    const { invoke, vault } = setup();
    vault.anthropic.write.mockImplementation(() => {
      throw new Error("EACCES: permission denied");
    });

    await expect(
      invoke<CredentialConfigureResult>("anthropic", "sk-ant-key"),
    ).resolves.toMatchObject({ ok: false, code: "WRITE_FAILED" });
  });
});
