import type { IpcMain } from "electron";

import type { CredentialConfigureResult } from "../shared/agentTypes.js";
import type { CredentialStore } from "./credentialStore.js";
import type { CredentialValidator } from "./credentialValidator.js";
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
export function registerCredentialHandlers(
  ipcMain: Pick<IpcMain, "handle">,
  store: Pick<CredentialStore, "hasCredential" | "checkBackend" | "write">,
  validator: CredentialValidator,
): void {
  ipcMain.handle(CREDENTIAL_STATUS_CHANNEL, (): boolean => store.hasCredential());

  ipcMain.handle(
    CREDENTIAL_CONFIGURE_CHANNEL,
    async (_event, apiKey: unknown): Promise<CredentialConfigureResult> => {
      if (typeof apiKey !== "string" || apiKey.trim().length === 0) {
        throw new Error(
          "credential:configure requires a non-empty API key string.",
        );
      }

      const backend = store.checkBackend();
      if (!backend.ok) return backend;

      const validation = await validator.validate(apiKey);
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
