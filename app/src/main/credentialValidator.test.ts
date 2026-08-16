// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import {
  AnthropicCredentialValidator,
  OpenAiCredentialValidator,
  OpenRouterCredentialValidator,
  type CredentialValidator,
} from "./credentialValidator.js";

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

/**
 * Every validator asks a different endpoint the same question, so the mapping
 * from outcome to typed failure is one implementation with three sets of
 * arguments. These run the whole table against each of them: a provider that
 * grew its own copy of the mapping would pass its own suite and drift here.
 */
describe.each([
  ["Anthropic", (fetchImpl: typeof fetch) => new AnthropicCredentialValidator(fetchImpl)],
  ["OpenAI", (fetchImpl: typeof fetch) => new OpenAiCredentialValidator(fetchImpl)],
  ["OpenRouter", (fetchImpl: typeof fetch) => new OpenRouterCredentialValidator(fetchImpl)],
] as const)("%s validator — the shared outcome mapping", (_name, build) => {
  const outcome = (response: Partial<Response>): Promise<unknown> =>
    build(fakeFetch(response)).validate("some-key");

  it("accepts a key the provider authenticates", async () => {
    await expect(outcome({ ok: true, status: 200 })).resolves.toEqual({ ok: true });
  });

  it.each([
    [401, "AUTHENTICATION"],
    [403, "AUTHENTICATION"],
    [429, "RATE_LIMITED"],
    [500, "INVALID_RESPONSE"],
  ])("maps %i to %s", async (status, code) => {
    await expect(outcome({ ok: false, status })).resolves.toMatchObject({ ok: false, code });
  });

  it("reports transport trouble as NETWORK", async () => {
    const validator = build(
      vi.fn().mockRejectedValue(new TypeError("fetch failed")) as unknown as typeof fetch,
    );
    await expect(validator.validate("some-key")).resolves.toMatchObject({
      ok: false,
      code: "NETWORK",
    });
  });

  it("reports an abort as TIMEOUT", async () => {
    const validator = build(
      vi.fn().mockImplementation(() => {
        const error = new Error("aborted");
        error.name = "AbortError";
        return Promise.reject(error);
      }) as unknown as typeof fetch,
    );
    await expect(validator.validate("some-key")).resolves.toMatchObject({
      ok: false,
      code: "TIMEOUT",
    });
  });

  it("never echoes the key back in a message", async () => {
    const result = await build(fakeFetch({ ok: false, status: 401 })).validate("sk-secret-value");
    expect(JSON.stringify(result)).not.toContain("sk-secret-value");
  });
});

describe("what each validator actually asks", () => {
  const urlAndHeaders = async (
    validator: CredentialValidator,
    fetchImpl: typeof fetch,
  ): Promise<[string, Record<string, string>]> => {
    await validator.validate("the-key");
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0] as unknown as [string, RequestInit];
    return [url, init.headers as Record<string, string>];
  };

  it("asks Anthropic for its model list, with the versioned x-api-key header", async () => {
    const fetchImpl = fakeFetch({ ok: true, status: 200 });
    const [url, headers] = await urlAndHeaders(
      new AnthropicCredentialValidator(fetchImpl),
      fetchImpl,
    );

    expect(url).toBe("https://api.anthropic.com/v1/models");
    expect(headers).toMatchObject({ "x-api-key": "the-key", "anthropic-version": "2023-06-01" });
  });

  it("asks OpenAI for its model list, with Bearer authentication", async () => {
    const fetchImpl = fakeFetch({ ok: true, status: 200 });
    const [url, headers] = await urlAndHeaders(new OpenAiCredentialValidator(fetchImpl), fetchImpl);

    expect(url).toBe("https://api.openai.com/v1/models");
    expect(headers).toMatchObject({ Authorization: "Bearer the-key" });
  });

  /**
   * NOT `/models`, which is the obvious symmetry and would be a silent hole:
   * OpenRouter's model list is a public endpoint that answers 200 without any
   * credential at all, so validating against it would accept every string an
   * analyst pasted — including an empty-looking typo — and only surface the
   * problem on the first real send, long after the "key validated and stored"
   * message. `/key` is the endpoint that actually requires the key, and it
   * costs nothing extra.
   */
  it("asks OpenRouter about the key itself, not its public model list", async () => {
    const fetchImpl = fakeFetch({ ok: true, status: 200 });
    const [url, headers] = await urlAndHeaders(
      new OpenRouterCredentialValidator(fetchImpl),
      fetchImpl,
    );

    expect(url).toBe("https://openrouter.ai/api/v1/key");
    expect(headers).toMatchObject({ Authorization: "Bearer the-key" });
  });
});
