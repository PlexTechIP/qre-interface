import type { IpcMain } from "electron";

import type { CredentialConfigureResult, ProviderId } from "../shared/agentTypes.js";
import { isProviderId } from "../shared/providerModels.js";
import type { CredentialBackendCheck, CredentialStore } from "./credentialStore.js";
import type {
  CredentialValidationResult,
  CredentialValidator,
} from "./credentialValidator.js";
import { CREDENTIAL_CONFIGURE_CHANNEL, CREDENTIAL_STATUS_CHANNEL } from "./ipcChannels.js";

/**
 * Wires credential storage behind IPC, following the estimator convention
 * documented in storeHandler.ts and the week-4 architecture doc: provider and
 * storage failures are expected domain outcomes and resolve carrying a typed
 * failure — never reject. Only a programmer error (a non-string/empty key)
 * rejects.
 *
 * `status` never argues with the renderer about *why* — it is a boolean,
 * nothing else. There is no channel here, or anywhere, that returns the key.
 */
type CredentialVault = Record<
  ProviderId,
  Pick<CredentialStore, "hasCredential" | "checkBackend" | "write">
>;
type CredentialValidators = Record<ProviderId, CredentialValidator>;

export function registerCredentialHandlers(
  ipcMain: Pick<IpcMain, "handle">,
  vault: CredentialVault,
  validators: CredentialValidators,
): void {
  ipcMain.handle(CREDENTIAL_STATUS_CHANNEL, (): Record<ProviderId, boolean> => ({
    anthropic: vault.anthropic.hasCredential(),
    openai: vault.openai.hasCredential(),
  }));

  ipcMain.handle(
    CREDENTIAL_CONFIGURE_CHANNEL,
    async (_event, provider: unknown, apiKey: unknown): Promise<CredentialConfigureResult> => {
      if (!isProviderId(provider)) {
        throw new Error("credential:configure requires a supported provider id.");
      }
      if (typeof apiKey !== "string" || apiKey.trim().length === 0) {
        throw new Error(
          "credential:configure requires a non-empty API key string.",
        );
      }
      const store = vault[provider];
      const validator = validators[provider];

      // `checkBackend` and `validate` both reach outside this process — the OS
      // key store and the provider's API — and either can throw for reasons
      // that are not programmer errors: a platform that exposes no backend
      // probe, a keychain prompt the analyst dismissed, an injected validator
      // that rejects rather than resolving. A throw here would reject the
      // channel and strand them with a raw stack instead of a message they can
      // act on, so both are contained into the same typed failure shape as the
      // write below.
      let backend: CredentialBackendCheck;
      try {
        // Ask the store we are about to write to. The check happens to be
        // provider-independent today (it reads `safeStorage`, never the file
        // path), but the vault type permits per-provider stores, so
        // interrogating one provider's store to authorise a write to another's
        // is a trap: the day `checkBackend` gains a path-dependent check, or a
        // provider is constructed with a different safeStorage, that shape
        // approves a write it never examined.
        backend = store.checkBackend();
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        return {
          ok: false,
          code: "BACKEND_UNAVAILABLE",
          message: `The OS key store could not be inspected, so the app will not store a key it cannot promise to encrypt: ${detail}`,
        };
      }
      if (!backend.ok) return backend;

      let validation: CredentialValidationResult;
      try {
        validation = await validator.validate(apiKey);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        return {
          ok: false,
          code: "NETWORK",
          message: `Could not reach the provider to validate the key: ${detail}`,
        };
      }
      if (!validation.ok) return validation;

      try {
        store.write(apiKey);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        return {
          ok: false,
          code: "WRITE_FAILED",
          message: `The key validated but could not be saved: ${detail}`,
        };
      }
      return { ok: true };
    },
  );
}
