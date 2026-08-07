import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * The subset of Electron's `safeStorage` this module needs, so tests can
 * inject a fake OS keychain instead of requiring a real one. Shaped after
 * `Electron.SafeStorage`, not re-exported from it, the same way
 * `EstimatorService` is `Pick`-narrowed at each injection site.
 */
export interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  /**
   * OPTIONAL, and optional is the whole point: Electron implements this on
   * LINUX ONLY (`electron.d.ts` marks it `@platform linux`). On darwin and
   * win32 the property is not even defined — verified on Electron 43.1.0,
   * where `typeof safeStorage.getSelectedStorageBackend` is `"undefined"` and
   * calling it throws `TypeError: ... is not a function`.
   *
   * Electron's own `.d.ts` types it as always present, so a direct call
   * typechecks and then fails at runtime on two of the three platforms. Typing
   * it optional here is what forces the presence check in `checkBackend`.
   */
  getSelectedStorageBackend?(): string;
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
   * On LINUX, if no OS secret store is available `safeStorage` silently falls
   * back to a hardcoded plaintext password — `getSelectedStorageBackend()`
   * returning `basic_text` means the encryption is theatre. Refuse rather than
   * pretend.
   *
   * That backend probe is Linux-only (see `SafeStorageLike`), so it is called
   * only when the runtime actually exposes it. macOS and Windows have no
   * plaintext fallback to detect: Keychain and DPAPI are the only backends
   * there, and `isEncryptionAvailable()` above is the whole gate.
   *
   * The probe is presence-checked rather than gated on `process.platform` so
   * the guard tracks what the runtime really offers — a fake keychain in a test
   * exercises the same branch a real one does, and a future Electron that adds
   * the call on another platform is picked up for free.
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
    if (this.selectedStorageBackend() === "basic_text") {
      return {
        ok: false,
        code: "BACKEND_UNAVAILABLE",
        message:
          "No OS secret store (Keychain, DPAPI, or a Linux secret service) was found, so safeStorage would fall back to a hardcoded plaintext password. The app refuses to store a key under that fallback rather than pretend it's encrypted.",
      };
    }
    return { ok: true };
  }

  /**
   * The Linux password-store backend, or null where the platform does not
   * report one. `unknown` (which Electron returns when asked before `ready`)
   * is also null: it is not evidence of the plaintext fallback, and refusing on
   * it would lock out a machine whose backend we simply failed to observe.
   */
  private selectedStorageBackend(): string | null {
    const probe = this.safeStorage.getSelectedStorageBackend;
    if (typeof probe !== "function") return null;
    const backend = probe.call(this.safeStorage);
    return backend === "unknown" ? null : backend;
  }

  /**
   * Encrypts and persists the key. Callers must call `checkBackend` first.
   *
   * Written to a temp file and renamed, because `hasCredential()` is an
   * existence check: an in-place write interrupted by a crash would leave a
   * truncated blob that reports as configured and then throws inside
   * `decryptString` on every request, with no way to tell from the outside that
   * the file is junk. `rename` within a directory is atomic, so the file is
   * either the old key or the new one.
   *
   * Mode 0600 because the default (0666 & umask, i.e. 0644) leaves the blob
   * world-readable. It is encrypted, so this is defence in depth rather than
   * the only thing standing between the key and another local user — but it
   * costs one option.
   */
  write(apiKey: string): void {
    const encrypted = this.safeStorage.encryptString(apiKey);
    mkdirSync(dirname(this.filePath), { recursive: true });
    const pending = `${this.filePath}.tmp`;
    try {
      writeFileSync(pending, encrypted, { mode: 0o600 });
      renameSync(pending, this.filePath);
    } catch (error) {
      // Never leave a half-written temp file behind to be mistaken for state.
      if (existsSync(pending)) unlinkSync(pending);
      throw error;
    }
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

/**
 * Week 4 stored Anthropic's key under a provider-neutral name. Preserve that
 * one existing encrypted blob during the split rather than making an analyst
 * re-enter a valid key. Never overwrite a newly-entered Anthropic credential.
 */
export function migrateLegacyAnthropicCredential(
  legacyPath: string,
  anthropicPath: string,
): void {
  if (existsSync(legacyPath) && !existsSync(anthropicPath)) {
    renameSync(legacyPath, anthropicPath);
  }
}
