// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { AnthropicCredentialValidator } from "./credentialValidator.js";

function fakeFetch(response: Partial<Response>): typeof fetch {
  return vi.fn().mockResolvedValue(response as Response) as unknown as typeof fetch;
}

describe("AnthropicCredentialValidator", () => {
  it("resolves ok on a 200 from the models list", async () => {
    const validator = new AnthropicCredentialValidator(fakeFetch({ ok: true, status: 200 }));
    await expect(validator.validate("sk-ant-good")).resolves.toEqual({ ok: true });
  });

  it("reports AUTHENTICATION as data on 401, not a throw", async () => {
    const validator = new AnthropicCredentialValidator(fakeFetch({ ok: false, status: 401 }));
    const result = await validator.validate("sk-ant-bad");
    expect(result).toEqual({
      ok: false,
      code: "AUTHENTICATION",
      message: expect.stringContaining("rejected"),
    });
  });

  it("reports RATE_LIMITED on 429", async () => {
    const validator = new AnthropicCredentialValidator(fakeFetch({ ok: false, status: 429 }));
    const result = await validator.validate("sk-ant-key");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("RATE_LIMITED");
  });

  it("reports INVALID_RESPONSE on an unexpected status", async () => {
    const validator = new AnthropicCredentialValidator(fakeFetch({ ok: false, status: 500 }));
    const result = await validator.validate("sk-ant-key");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("INVALID_RESPONSE");
  });

  it("reports NETWORK when the request throws (offline, DNS, TLS)", async () => {
    const throwingFetch = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    const validator = new AnthropicCredentialValidator(throwingFetch as unknown as typeof fetch);
    const result = await validator.validate("sk-ant-key");
    expect(result).toEqual({
      ok: false,
      code: "NETWORK",
      message: expect.stringContaining("fetch failed"),
    });
  });

  it("reports TIMEOUT when the request aborts", async () => {
    const abortingFetch = vi.fn().mockImplementation(() => {
      const error = new Error("aborted");
      error.name = "AbortError";
      return Promise.reject(error);
    });
    const validator = new AnthropicCredentialValidator(abortingFetch as unknown as typeof fetch);
    const result = await validator.validate("sk-ant-key");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("TIMEOUT");
  });

  it("never throws — every provider outcome resolves as data", async () => {
    const validator = new AnthropicCredentialValidator(
      vi.fn().mockRejectedValue(new Error("boom")) as unknown as typeof fetch,
    );
    await expect(validator.validate("sk-ant-key")).resolves.toMatchObject({ ok: false });
  });
});
