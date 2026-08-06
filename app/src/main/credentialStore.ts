import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * The subset of Electron's `safeStorage` this module needs, so tests can
 * inject a fake OS keychain instead of requiring a real one. Shaped after
 * `Electron.SafeStorage`, not re-exported from it, the same way
 * `EstimatorService` is `Pick`-narrowed at each injection site.
 */
export interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  getSelectedStorageBackend(): string;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

export type CredentialBackendCheck =
  | { ok: true }
  | { ok: false; code: "BACKEND_UNAVAILABLE"; message: string };

/**
 * Wraps `safeStorage` around a single provider API key. The encrypted blob
 * lives at `filePath`, which callers resolve under `app.getPath("userData")`
 * (see `main.ts`) — never under the run store's directory, and never as JSON.
 *
 * `readForRequest` decrypts the key for main-process use only (building a
 * provider request). It must never be wired to an IPC channel — that is the
 * entire point of constraint C: no getter reaches the renderer.
 */
export class CredentialStore {
  constructor(
    private readonly filePath: string,
    private readonly safeStorage: SafeStorageLike,
  ) {}

  hasCredential(): boolean {
    return existsSync(this.filePath);
  }

  /**
   * If no OS secret store is available, `safeStorage` silently falls back to
   * a hardcoded plaintext password — `getSelectedStorageBackend()` returning
   * `basic_text` means the encryption is theatre. Refuse rather than pretend.
   */
  checkBackend(): CredentialBackendCheck {
    if (!this.safeStorage.isEncryptionAvailable()) {
      return {
        ok: false,
        code: "BACKEND_UNAVAILABLE",
        message:
          "OS-level encryption is unavailable on this machine, so the app cannot store a provider key safely. Networked features stay off.",
      };
    }
    if (this.safeStorage.getSelectedStorageBackend() === "basic_text") {
      return {
        ok: false,
        code: "BACKEND_UNAVAILABLE",
        message:
          "No OS secret store (Keychain, DPAPI, or a Linux secret service) was found, so safeStorage would fall back to a hardcoded plaintext password. The app refuses to store a key under that fallback rather than pretend it's encrypted.",
      };
    }
    return { ok: true };
  }

  /** Encrypts and persists the key. Callers must call `checkBackend` first. */
  write(apiKey: string): void {
    const encrypted = this.safeStorage.encryptString(apiKey);
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, encrypted);
  }

  clear(): void {
    if (existsSync(this.filePath)) unlinkSync(this.filePath);
  }

  /**
   * Internal-only. Decrypts the stored key for the main process to attach to
   * a provider request. Do not expose this over IPC — the renderer may only
   * ask `hasCredential()`, never read the value back.
   */
  readForRequest(): string | null {
    if (!existsSync(this.filePath)) return null;
    return this.safeStorage.decryptString(readFileSync(this.filePath));
  }
}
