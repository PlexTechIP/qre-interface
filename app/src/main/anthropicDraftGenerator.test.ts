// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { PROVIDER_MODELS } from "../shared/providerModels.js";
import { FAKE_GENERATED_DRAFT } from "../shared/testing/fakeAgentService.js";
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

function errorResponse(status: number, body = ""): Response {
  return {
    ok: false,
    status,
    text: async () => body,
    json: async () => ({}),
  } as unknown as Response;
}

describe("AnthropicDraftGenerator request body", () => {
  it("carries the lowered generation schema as the structured-output format", () => {
    const body = new AnthropicDraftGenerator().buildRequestBody(PROMPT);

    expect(body.model).toBe("claude-sonnet-5");
    expect(body.messages).toEqual([{ role: "user", content: PROMPT }]);
    expect(body.output_config.format.type).toBe("json_schema");
    // The schema shipped is the real artifact, not a copy that can drift from
    // the one the drift test guards.
    // The WIRE schema is description- and title-free: those strings are
    // compiled into the decoding grammar and pushed it over the provider's size
    // ceiling, so they travel in the system prompt instead. Structure only here.
    const schema = body.output_config.format.schema as Record<string, unknown>;
    expect(schema).toMatchObject({ type: "object", additionalProperties: false });
    expect(JSON.stringify(schema)).not.toContain("description");
    expect(schema).not.toHaveProperty("title");
    // …and the guidance is not lost, only relocated.
    expect(body.system).toContain("Field guidance");
    expect(body.system).toContain("searchQubits");
  });

  /**
   * `output_config.effort` is a 5-generation parameter. Haiku 4.5 answers it
   * with a 400, so sending it unconditionally made the cheapest entry in the
   * model menu the one that could never succeed — and the failure arrived as an
   * opaque provider rejection rather than as anything naming the cause.
   */
  it.each(["claude-sonnet-5", "claude-opus-5"])("paces thinking with low effort on %s", (model) => {
    const body = new AnthropicDraftGenerator(model).buildRequestBody(PROMPT);

    expect(body.output_config.effort).toBe("low");
  });

  it("omits effort entirely on a model that rejects the parameter", () => {
    const body = new AnthropicDraftGenerator("claude-haiku-4-5").buildRequestBody(PROMPT);

    // Absent, not undefined: `JSON.stringify` drops an undefined value, but the
    // preview panel renders this object directly and would show the key.
    expect(body.output_config).not.toHaveProperty("effort");
    expect(Object.keys(body.output_config)).toEqual(["format"]);
    // The part that actually matters on this model is untouched.
    expect(body.output_config.format.type).toBe("json_schema");
  });

  /**
   * Every model the picker offers has to produce a body the provider accepts.
   * A menu entry that always 400s is the failure this pins, whichever model is
   * added next.
   */
  it("builds a body for every Anthropic model the picker offers", () => {
    for (const model of PROVIDER_MODELS.anthropic.models) {
      const body = new AnthropicDraftGenerator(model).buildRequestBody(PROMPT);
      expect(body.model).toBe(model);
      expect(body.output_config.format.schema).toBeDefined();
    }
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
    const result = await draftWith(messageResponse(FAKE_GENERATED_DRAFT));

    expect(result).toEqual({
      ok: true,
      draft: FAKE_GENERATED_DRAFT,
      provider: "Anthropic",
      model: "claude-opus-5",
    });
  });

  /**
   * The reply is checked against the generation contract before it is handed
   * on. Without this, a type-confused value mapped cleanly into a form that
   * looked valid, flagged no field, and could never be run — see
   * `draftValidation.ts`.
   */
  it("refuses a schema-valid-looking reply whose types are wrong, naming the field", async () => {
    const result = await draftWith(
      messageResponse({
        ...FAKE_GENERATED_DRAFT,
        architecture: {
          type: "gateBased",
          errorRate: "1e-3",
          gateTime: 50,
          measurementTime: 100,
          twoQubitGateTime: null,
        },
      }),
    );

    expect(result).toMatchObject({ ok: false, code: "INVALID_RESPONSE" });
    if (result.ok) return;
    expect(result.message).toContain("architecture.errorRate");
    expect(result.message).toContain("Nothing was applied to the form.");
  });

  it("refuses a reply missing a required section", async () => {
    const draft: Record<string, unknown> = structuredClone(FAKE_GENERATED_DRAFT);
    delete draft["traceTransform"];

    const result = await draftWith(messageResponse(draft));

    expect(result).toMatchObject({ ok: false, code: "INVALID_RESPONSE" });
    if (result.ok) return;
    expect(result.message).toContain("traceTransform");
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

  /**
   * A live 400 taught this: the app reported only "unexpected status (400)"
   * while the provider's body named the exact offending schema keyword. Every
   * distinct rejection looked identical and none was actionable.
   */
  it("carries the provider's own reason out of a rejected request", async () => {
    const result = await draftWith(
      errorResponse(
        400,
        JSON.stringify({
          type: "error",
          error: {
            type: "invalid_request_error",
            message: "output_config.format.schema: 'title' is not supported",
          },
        }),
      ),
    );

    expect(result).toMatchObject({ ok: false, code: "INVALID_RESPONSE" });
    if (result.ok) return;
    expect(result.message).toContain("'title' is not supported");
    expect(result.message).toContain("400");
    expect(result.message).not.toContain(API_KEY);
  });

  it("still reports a status when the provider explains nothing", async () => {
    const result = await draftWith(errorResponse(502, ""));

    expect(result).toMatchObject({ ok: false, code: "INVALID_RESPONSE" });
    if (result.ok) return;
    expect(result.message).toContain("502");
    expect(result.message).toMatch(/no explanation/);
  });

  it("resolves an aborted request as TIMEOUT", async () => {
    const result = await draftWith(() => {
      const abort = new Error("aborted");
      abort.name = "AbortError";
      throw abort;
    });

    expect(result).toMatchObject({ ok: false, code: "TIMEOUT" });
  });

  /**
   * Cancelling and timing out surface as the same `AbortError` from the same
   * `fetch`, so the signal is what tells them apart. Collapsing them would tell
   * someone who had just pressed Cancel that "the provider did not respond in
   * time" — a claim about the provider, made about their own action.
   */
  it("distinguishes a cancelled request from a slow one", async () => {
    const cancel = new AbortController();
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      cancel.abort();
      // What a real fetch does once its signal fires.
      await new Promise((resolve) => setTimeout(resolve, 0));
      const error = new Error("This operation was aborted");
      error.name = "AbortError";
      // The combined signal is what actually reaches fetch.
      expect(init.signal?.aborted).toBe(true);
      throw error;
    });

    const result = await new AnthropicDraftGenerator(
      "claude-opus-5",
      fetchImpl as unknown as typeof fetch,
    ).requestDraft(API_KEY, PROMPT, cancel.signal);

    expect(result).toMatchObject({ ok: false, code: "CANCELLED" });
    if (result.ok) return;
    expect(result.message).toContain("Nothing was applied to the form.");
    expect(result.message).not.toMatch(/did not respond in time/);
  });

  it("still reports TIMEOUT when a cancel signal exists but never fired", async () => {
    const cancel = new AbortController();
    const fetchImpl = vi.fn(async () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    });

    const result = await new AnthropicDraftGenerator(
      "claude-opus-5",
      fetchImpl as unknown as typeof fetch,
    ).requestDraft(API_KEY, PROMPT, cancel.signal);

    expect(result).toMatchObject({ ok: false, code: "TIMEOUT" });
  });
});
