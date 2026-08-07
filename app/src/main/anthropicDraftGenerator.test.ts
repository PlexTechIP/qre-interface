// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { AnthropicDraftGenerator } from "./anthropicDraftGenerator.js";

const PROMPT = "Grover search over 20 qubits on a gate-based QPU";
const API_KEY = "sk-ant-secret-value";

/** A minimal Messages-API success envelope carrying `json` as the text block. */
function messageResponse(json: unknown, overrides: Record<string, unknown> = {}): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      stop_reason: "end_turn",
      content: [{ type: "text", text: JSON.stringify(json) }],
      ...overrides,
    }),
  } as unknown as Response;
}

function errorResponse(status: number): Response {
  return { ok: false, status, json: async () => ({}) } as unknown as Response;
}

describe("AnthropicDraftGenerator request body", () => {
  it("carries the lowered generation schema as the structured-output format", () => {
    const body = new AnthropicDraftGenerator().buildRequestBody(PROMPT);

    expect(body.model).toBe("claude-opus-5");
    expect(body.messages).toEqual([{ role: "user", content: PROMPT }]);
    expect(body.output_config.format.type).toBe("json_schema");
    // The schema shipped is the real artifact, not a copy that can drift from
    // the one the drift test guards.
    expect(body.output_config.format.schema).toMatchObject({
      title: "GeneratedRunDraft",
      additionalProperties: false,
    });
  });

  it("never puts a credential in the request body", () => {
    const generator = new AnthropicDraftGenerator();
    const serialized = JSON.stringify(generator.buildRequestBody(PROMPT));

    expect(serialized).not.toContain(API_KEY);
    expect(serialized).not.toContain("x-api-key");
    // The preview shown to the analyst is this exact object — if a key could
    // reach it, the UI would be displaying the secret it exists to protect.
    expect(Object.keys(generator.buildRequestBody(PROMPT))).not.toContain("apiKey");
  });

  it("sends the key as a header, and only as a header", async () => {
    const fetchImpl = vi.fn(async (): Promise<Response> => messageResponse({ name: "draft" }));
    await new AnthropicDraftGenerator("claude-opus-5", fetchImpl as unknown as typeof fetch)
      .requestDraft(API_KEY, PROMPT);

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe(API_KEY);
    expect(init.body as string).not.toContain(API_KEY);
  });
});

describe("AnthropicDraftGenerator outcomes", () => {
  async function draftWith(response: Response | (() => never)) {
    const fetchImpl = vi.fn(async () => {
      if (typeof response === "function") response();
      return response as Response;
    });
    return new AnthropicDraftGenerator(
      "claude-opus-5",
      fetchImpl as unknown as typeof fetch,
    ).requestDraft(API_KEY, PROMPT);
  }

  it("returns the parsed draft on success", async () => {
    const result = await draftWith(messageResponse({ name: "Grover draft", maxError: 1 }));

    expect(result).toEqual({
      ok: true,
      draft: { name: "Grover draft", maxError: 1 },
      provider: "Anthropic",
      model: "claude-opus-5",
    });
  });

  // Every provider failure resolves — the estimator convention this surface is
  // required to follow. A throw here would break the UI's error rendering.
  it.each([
    [401, "AUTHENTICATION"],
    [403, "AUTHENTICATION"],
    [429, "RATE_LIMITED"],
    [500, "INVALID_RESPONSE"],
  ])("maps HTTP %i to a resolved %s failure", async (status, code) => {
    const result = await draftWith(errorResponse(status));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe(code);
    expect(result.message).not.toContain(API_KEY);
  });

  it("distinguishes a safety refusal from an unreadable response", async () => {
    const refused = await draftWith(
      messageResponse(null, { stop_reason: "refusal", content: [] }),
    );
    expect(refused).toMatchObject({ ok: false, code: "REFUSED" });

    const truncated = await draftWith(
      messageResponse(null, { stop_reason: "max_tokens", content: [] }),
    );
    expect(truncated).toMatchObject({ ok: false, code: "INVALID_RESPONSE" });
  });

  it("treats a non-JSON proposal as a failure rather than a draft", async () => {
    const result = await draftWith({
      ok: true,
      status: 200,
      json: async () => ({
        stop_reason: "end_turn",
        content: [{ type: "text", text: "Sure! Here is the config:" }],
      }),
    } as unknown as Response);

    expect(result).toMatchObject({ ok: false, code: "INVALID_RESPONSE" });
  });

  it("resolves a transport failure as NETWORK", async () => {
    const result = await draftWith(() => {
      throw new Error("getaddrinfo ENOTFOUND api.anthropic.com");
    });

    expect(result).toMatchObject({ ok: false, code: "NETWORK" });
  });

  it("resolves an aborted request as TIMEOUT", async () => {
    const result = await draftWith(() => {
      const abort = new Error("aborted");
      abort.name = "AbortError";
      throw abort;
    });

    expect(result).toMatchObject({ ok: false, code: "TIMEOUT" });
  });
});
