// @vitest-environment node

import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import type { CredentialConfigureResult } from "../shared/agentTypes.js";
import { registerCredentialHandlers } from "./credentialHandler.js";
import type { CredentialBackendCheck, CredentialStore } from "./credentialStore.js";
import type { CredentialValidator } from "./credentialValidator.js";
import { CREDENTIAL_CONFIGURE_CHANNEL, CREDENTIAL_STATUS_CHANNEL } from "./ipcChannels.js";

type Listener = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

type StorePick = Pick<CredentialStore, "hasCredential" | "checkBackend" | "write">;

function setup(options: {
  hasCredential?: boolean;
  backend?: CredentialBackendCheck;
  backendError?: Error;
  validation?: Awaited<ReturnType<CredentialValidator["validate"]>>;
  validationError?: Error;
  writeImpl?: () => void;
} = {}) {
  const handlers = new Map<string, Listener>();
  const ipcMain: Pick<IpcMain, "handle"> = {
    handle(channel, listener) {
      handlers.set(channel, listener as Listener);
    },
  };

  const write = vi.fn(options.writeImpl ?? (() => {}));
  // The return annotations are load-bearing: without them `{ ok: true }` widens
  // to `{ ok: boolean }`, which no longer narrows against the discriminated
  // unions these fakes stand in for.
  const store: StorePick = {
    hasCredential: vi.fn(() => options.hasCredential ?? false),
    checkBackend: vi.fn((): CredentialBackendCheck => {
      if (options.backendError) throw options.backendError;
      return options.backend ?? { ok: true };
    }),
    write,
  };
  const validator: CredentialValidator = {
    validate: vi.fn(
      async (): Promise<Awaited<ReturnType<CredentialValidator["validate"]>>> => {
        if (options.validationError) throw options.validationError;
        return options.validation ?? { ok: true };
      },
    ),
  };

  registerCredentialHandlers(ipcMain, store, validator);

  const invoke = <T>(channel: string, ...args: unknown[]): Promise<T> => {
    const handler = handlers.get(channel);
    if (!handler) throw new Error(`no handler registered for ${channel}`);
    return Promise.resolve(
      handler(undefined as unknown as IpcMainInvokeEvent, ...args) as T,
    );
  };

  return { invoke, handlers, store, validator, write };
}

describe("registerCredentialHandlers", () => {
  it("registers exactly the status and configure channels — no getter", () => {
    const { handlers } = setup();
    expect([...handlers.keys()].sort()).toEqual(
      [CREDENTIAL_CONFIGURE_CHANNEL, CREDENTIAL_STATUS_CHANNEL].sort(),
    );
  });

  it("status reflects hasCredential as a plain boolean", async () => {
    const configured = setup({ hasCredential: true });
    await expect(configured.invoke<boolean>(CREDENTIAL_STATUS_CHANNEL)).resolves.toBe(true);

    const unconfigured = setup({ hasCredential: false });
    await expect(unconfigured.invoke<boolean>(CREDENTIAL_STATUS_CHANNEL)).resolves.toBe(false);
  });

  it("configure rejects a non-string key as a programmer error", async () => {
    const { invoke } = setup();
    await expect(invoke(CREDENTIAL_CONFIGURE_CHANNEL, 12345)).rejects.toThrow(
      /non-empty API key/,
    );
  });

  it("configure rejects an empty key as a programmer error", async () => {
    const { invoke } = setup();
    await expect(invoke(CREDENTIAL_CONFIGURE_CHANNEL, "   ")).rejects.toThrow();
  });

  it("configure resolves the backend refusal as data without calling the validator or writing", async () => {
    const backend: CredentialBackendCheck = {
      ok: false,
      code: "BACKEND_UNAVAILABLE",
      message: "no real secret store",
    };
    const { invoke, validator, write } = setup({ backend });
    const result = await invoke<CredentialConfigureResult>(
      CREDENTIAL_CONFIGURE_CHANNEL,
      "sk-ant-key",
    );
    expect(result).toEqual(backend);
    expect(validator.validate).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it("configure resolves a provider validation failure as data without writing", async () => {
    const validation = {
      ok: false as const,
      code: "AUTHENTICATION" as const,
      message: "bad key",
    };
    const { invoke, write } = setup({ validation });
    const result = await invoke<CredentialConfigureResult>(
      CREDENTIAL_CONFIGURE_CHANNEL,
      "sk-ant-key",
    );
    expect(result).toEqual(validation);
    expect(write).not.toHaveBeenCalled();
  });

  it("configure resolves a write failure as data rather than throwing", async () => {
    const { invoke } = setup({
      writeImpl: () => {
        throw new Error("disk full");
      },
    });
    const result = await invoke<CredentialConfigureResult>(
      CREDENTIAL_CONFIGURE_CHANNEL,
      "sk-ant-key",
    );
    expect(result).toEqual({
      ok: false,
      code: "WRITE_FAILED",
      message: expect.stringContaining("disk full"),
    });
  });

  /**
   * The regression that made this whole surface unusable off Linux:
   * `checkBackend` calls `safeStorage.getSelectedStorageBackend()`, which
   * Electron implements on Linux only, so on macOS and Windows it threw a
   * TypeError straight out of the handler. The store no longer makes that call
   * blind, and the handler no longer lets a throw from it reject the channel —
   * two independent guards, because either alone leaves the analyst with a raw
   * stack instead of a message.
   */
  it("configure resolves a throwing backend check as data rather than rejecting", async () => {
    const { invoke, validator, write } = setup({
      backendError: new Error("safeStorage.getSelectedStorageBackend is not a function"),
    });
    const result = await invoke<CredentialConfigureResult>(
      CREDENTIAL_CONFIGURE_CHANNEL,
      "sk-ant-key",
    );
    expect(result).toEqual({
      ok: false,
      code: "BACKEND_UNAVAILABLE",
      message: expect.stringContaining("is not a function"),
    });
    expect(validator.validate).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it("configure resolves a throwing validator as data rather than rejecting", async () => {
    const { invoke, write } = setup({
      validationError: new Error("getaddrinfo ENOTFOUND api.anthropic.com"),
    });
    const result = await invoke<CredentialConfigureResult>(
      CREDENTIAL_CONFIGURE_CHANNEL,
      "sk-ant-key",
    );
    expect(result).toEqual({
      ok: false,
      code: "NETWORK",
      message: expect.stringContaining("ENOTFOUND"),
    });
    expect(write).not.toHaveBeenCalled();
  });

  it("configure validates then writes and resolves ok on the happy path", async () => {
    const { invoke, validator, write } = setup();
    const result = await invoke<CredentialConfigureResult>(
      CREDENTIAL_CONFIGURE_CHANNEL,
      "sk-ant-key",
    );
    expect(result).toEqual({ ok: true });
    expect(validator.validate).toHaveBeenCalledWith("sk-ant-key");
    expect(write).toHaveBeenCalledWith("sk-ant-key");
  });
});
