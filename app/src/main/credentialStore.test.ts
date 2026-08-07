// @vitest-environment node

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CredentialStore, type SafeStorageLike } from "./credentialStore.js";

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
});
