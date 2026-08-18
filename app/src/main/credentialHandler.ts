import type { IpcMain } from "electron";

import {
  PROVIDER_IDS,
  type CredentialClearResult,
  type CredentialConfigureResult,
  type ProviderId,
} from "../shared/agentTypes.js";
import { isProviderId } from "../shared/providerModels.js";
import type { CredentialBackendCheck, CredentialStore } from "./credentialStore.js";
import type {
  CredentialValidationResult,
  CredentialValidator,
} from "./credentialValidator.js";
import {
  CREDENTIAL_CLEAR_CHANNEL,
  CREDENTIAL_CONFIGURE_CHANNEL,
  CREDENTIAL_STATUS_CHANNEL,
} from "./ipcChannels.js";

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
  Pick<CredentialStore, "hasCredential" | "checkBackend" | "write" | "clear">
>;
type CredentialValidators = Record<ProviderId, CredentialValidator>;

export function registerCredentialHandlers(
  ipcMain: Pick<IpcMain, "handle">,
  vault: CredentialVault,
  validators: CredentialValidators,
): void {
  /*
   * Iterated rather than written out, because the literal version was a
   * provider-shaped hole: adding OpenRouter to `PROVIDER_IDS` left this
   * reporting on two of three, and nothing in the type system noticed — the
   * object still satisfied `Record<ProviderId, boolean>` only because it was
   * being checked against a two-member union at the time.
   *
   * `Object.fromEntries` cannot express that `PROVIDER_IDS` covers `ProviderId`,
   * so the assertion is the price of iteration. It is provable rather than
   * hopeful: the union is derived from that array.
   */
  ipcMain.handle(
    CREDENTIAL_STATUS_CHANNEL,
    (): Record<ProviderId, boolean> =>
      Object.fromEntries(
        PROVIDER_IDS.map((provider) => [provider, vault[provider].hasCredential()]),
      ) as Record<ProviderId, boolean>,
  );

  /**
   * Delete a provider's stored key.
   *
   * `CredentialStore.clear()` existed from the start and was wired to nothing,
   * so the only way to revoke a key the app had encrypted was to find
   * `provider-credential-<provider>.enc` under `userData` and delete it by hand.
   * For a surface whose entire argument is careful custody of a secret, "you can
   * put one in but never take it out" was the conspicuous hole.
   *
   * Clearing an absent key is a success, not an error: the analyst asked for the
   * key to be gone, and it is. Reporting a failure there would push callers into
   * checking status first and racing it.
   */
  ipcMain.handle(
    CREDENTIAL_CLEAR_CHANNEL,
    (_event, provider: unknown): CredentialClearResult => {
      if (!isProviderId(provider)) {
        throw new Error("credential:clear requires a supported provider id.");
      }
      try {
        vault[provider].clear();
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        return {
          ok: false,
          code: "CLEAR_FAILED",
          message: `The stored key could not be deleted (${detail}). It is still on this machine — remove the file yourself if this persists.`,
        };
      }
      return { ok: true };
    },
  );

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
