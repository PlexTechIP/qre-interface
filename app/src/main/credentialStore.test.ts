// @vitest-environment node

import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CredentialStore, migrateLegacyAnthropicCredential, type SafeStorageLike } from "./credentialStore.js";

/**
 * A fake OS keychain: reversible, and lets tests flip availability/backend.
 *
 * It must also OBSCURE, not just wrap. The point of the write test below is
 * that the plaintext key is absent from the file on disk, and a fake that
 * prefixes the plaintext cannot demonstrate that — the assertion and the
 * fixture contradict each other, and the file genuinely does contain the key.
 * Base64 is the cheapest transform that is both reversible and non-identity.
 */
function fakeSafeStorage(overrides: Partial<SafeStorageLike> = {}): SafeStorageLike {
  return {
    isEncryptionAvailable: () => true,
    getSelectedStorageBackend: () => "gnome_libsecret",
    encryptString: (plainText: string) => Buffer.from(fakeEncrypt(plainText)),
    decryptString: (encrypted: Buffer) =>
      Buffer.from(encrypted.toString("utf8").replace(/^enc:/, ""), "base64").toString("utf8"),
    ...overrides,
  };
}

/**
 * macOS and Windows, where Electron does not define the Linux-only backend
 * probe at all — `typeof safeStorage.getSelectedStorageBackend` is
 * `"undefined"` there, verified against Electron 43.1.0. This is the DEFAULT
 * shape on two of the three platforms, so it gets a fixture rather than an
 * override.
 */
function fakeSafeStorageWithoutBackendProbe(): SafeStorageLike {
  const storage = fakeSafeStorage();
  delete storage.getSelectedStorageBackend;
  return storage;
}

/** The fake's on-disk form, so tests assert against it without a magic string. */
function fakeEncrypt(plainText: string): string {
  return `enc:${Buffer.from(plainText, "utf8").toString("base64")}`;
}

let dir: string;
let filePath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "credential-store-"));
  filePath = join(dir, "nested", "provider-credential.enc");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("CredentialStore", () => {
  it("migrates the legacy encrypted key into Anthropic's provider-specific path", () => {
    const legacyPath = join(dir, "provider-credential.enc");
    const anthropicPath = join(dir, "provider-credential-anthropic.enc");
    writeFileSync(legacyPath, "encrypted-legacy-key");

    migrateLegacyAnthropicCredential(legacyPath, anthropicPath);

    expect(existsSync(legacyPath)).toBe(false);
    expect(readFileSync(anthropicPath, "utf8")).toBe("encrypted-legacy-key");
  });

  it("does not overwrite a provider-specific key during migration", () => {
    const legacyPath = join(dir, "provider-credential.enc");
    const anthropicPath = join(dir, "provider-credential-anthropic.enc");
    writeFileSync(legacyPath, "old");
    writeFileSync(anthropicPath, "new");
    migrateLegacyAnthropicCredential(legacyPath, anthropicPath);
    expect(readFileSync(anthropicPath, "utf8")).toBe("new");
    expect(existsSync(legacyPath)).toBe(true);
  });
  it("has no credential until one is written", () => {
    const store = new CredentialStore(filePath, fakeSafeStorage());
    expect(store.hasCredential()).toBe(false);
  });

  it("writes an encrypted blob, never plaintext, and reports it configured", () => {
    const store = new CredentialStore(filePath, fakeSafeStorage());
    store.write("sk-ant-secret-value");

    expect(store.hasCredential()).toBe(true);
    const onDisk = readFileSync(filePath, "utf8");
    expect(onDisk).not.toContain("sk-ant-secret-value");
    expect(onDisk).toBe(fakeEncrypt("sk-ant-secret-value"));
  });

  it("writes the blob owner-only, not world-readable", () => {
    const store = new CredentialStore(filePath, fakeSafeStorage());
    store.write("sk-ant-secret-value");

    // Low 9 permission bits only — the file type bits are not ours to assert.
    expect(statSync(filePath).mode & 0o777).toBe(0o600);
  });

  it("swaps the file in atomically, leaving no temp file behind", () => {
    const store = new CredentialStore(filePath, fakeSafeStorage());
    store.write("first-key");
    store.write("second-key");

    // A crash between truncate and flush is what the rename exists to prevent;
    // what is checkable here is that the pending file never survives the write,
    // because a leftover .tmp is the same footgun one directory entry over.
    expect(readdirSync(dirname(filePath))).toEqual(["provider-credential.enc"]);
    expect(store.readForRequest()).toBe("second-key");
  });

  it("does not leave a temp file behind when the swap fails", () => {
    const store = new CredentialStore(filePath, fakeSafeStorage());
    // A directory where the blob belongs: the temp write succeeds and the
    // rename onto it does not, which is the branch the cleanup exists for.
    mkdirSync(filePath, { recursive: true });

    expect(() => store.write("sk-ant-secret-value")).toThrow();
    expect(readdirSync(dirname(filePath))).toEqual(["provider-credential.enc"]);
  });

  it("readForRequest decrypts the stored key, and is null when unset", () => {
    const store = new CredentialStore(filePath, fakeSafeStorage());
    expect(store.readForRequest()).toBeNull();

    store.write("sk-ant-secret-value");
    expect(store.readForRequest()).toBe("sk-ant-secret-value");
  });

  it("clear removes the file", () => {
    const store = new CredentialStore(filePath, fakeSafeStorage());
    store.write("sk-ant-secret-value");
    store.clear();
    expect(store.hasCredential()).toBe(false);
  });

  it("checkBackend refuses when safeStorage reports basic_text (the plaintext-fallback theatre)", () => {
    const store = new CredentialStore(
      filePath,
      fakeSafeStorage({ getSelectedStorageBackend: () => "basic_text" }),
    );
    const result = store.checkBackend();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("BACKEND_UNAVAILABLE");
      expect(result.message).toMatch(/plaintext/i);
    }
  });

  it("checkBackend refuses when encryption is unavailable entirely", () => {
    const store = new CredentialStore(
      filePath,
      fakeSafeStorage({ isEncryptionAvailable: () => false }),
    );
    const result = store.checkBackend();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("BACKEND_UNAVAILABLE");
  });

  it("checkBackend passes for a real backend (e.g. Keychain/DPAPI/libsecret)", () => {
    const store = new CredentialStore(filePath, fakeSafeStorage());
    expect(store.checkBackend()).toEqual({ ok: true });
  });

  /**
   * THE regression this file most needed. `getSelectedStorageBackend` is
   * Linux-only; on macOS and Windows Electron does not define it, so calling it
   * unconditionally threw `TypeError: ... is not a function` out of
   * `credential:configure` and no key could be stored on either platform.
   * Electron's `.d.ts` types the method as always present, so nothing but a
   * fixture without it can hold this to account.
   */
  it("checkBackend passes where the platform exposes no backend probe (macOS/Windows)", () => {
    const store = new CredentialStore(filePath, fakeSafeStorageWithoutBackendProbe());
    expect(() => store.checkBackend()).not.toThrow();
    expect(store.checkBackend()).toEqual({ ok: true });
  });

  it("checkBackend still refuses on macOS/Windows when encryption is unavailable", () => {
    const storage = fakeSafeStorageWithoutBackendProbe();
    storage.isEncryptionAvailable = () => false;
    const store = new CredentialStore(filePath, storage);
    const result = store.checkBackend();
    expect(result.ok).toBe(false);
  });

  /** Electron returns "unknown" only before `ready`; it is not the fallback. */
  it("checkBackend does not refuse on an unknown backend", () => {
    const store = new CredentialStore(
      filePath,
      fakeSafeStorage({ getSelectedStorageBackend: () => "unknown" }),
    );
    expect(store.checkBackend()).toEqual({ ok: true });
  });
});
