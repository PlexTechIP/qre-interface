// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { OpenRouterCatalogClient } from "./openRouterCatalog.js";

const API_KEY = "sk-or-v1-secret";
const BASE_URL = "https://openrouter.example/api/v1";

function response(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  } as unknown as Response;
}

/** One entry in the shape OpenRouter's `/models` actually returns. */
const model = (id: string, overrides: Record<string, unknown> = {}): unknown => ({
  id,
  name: `Pretty ${id}`,
  context_length: 200_000,
  pricing: { prompt: "0.000003", completion: "0.000015" },
  supported_parameters: ["tools", "response_format", "structured_outputs"],
  ...overrides,
});

const keyInfo = (overrides: Record<string, unknown> = {}): unknown => ({
  data: { label: "qre", usage: 1.25, limit: 10, limit_remaining: 8.75, ...overrides },
});

/** Routes by path so the two independent calls can be answered separately. */
function routed(models: Response, key: Response = response(keyInfo())) {
  return vi.fn(async (url: string) =>
    url.endsWith("/key") ? key : models,
  ) as unknown as typeof fetch;
}

const client = (fetchImpl: typeof fetch): OpenRouterCatalogClient =>
  new OpenRouterCatalogClient(fetchImpl, BASE_URL);

describe("OpenRouterCatalogClient — the catalogue", () => {
  it("reads the model list with Bearer authentication", async () => {
    const fetchImpl = routed(response({ data: [model("anthropic/claude-sonnet-5")] }));
    const result = await client(fetchImpl).fetch(API_KEY);

    expect(result).toMatchObject({ ok: true });
    const calls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls as [
      string,
      RequestInit,
    ][];
    const modelsCall = calls.find(([url]) => url.endsWith("/models"));
    expect(modelsCall?.[0]).toBe(`${BASE_URL}/models`);
    expect((modelsCall?.[1].headers as Record<string, string>).Authorization).toBe(
      `Bearer ${API_KEY}`,
    );
  });

  /**
   * OpenRouter's optional attribution headers put the app on a public
   * leaderboard. This product's posture is no telemetry and no cloud, so the
   * absence is a decision and belongs in a test rather than in a comment
   * somebody deletes while adding a header.
   */
  it("sends no app-attribution headers", async () => {
    const fetchImpl = routed(response({ data: [model("anthropic/claude-sonnet-5")] }));
    await client(fetchImpl).fetch(API_KEY);

    const calls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls as [
      string,
      RequestInit,
    ][];
    for (const [, init] of calls) {
      const headers = Object.keys(init.headers as Record<string, string>).map((name) =>
        name.toLowerCase(),
      );
      expect(headers).not.toContain("http-referer");
      expect(headers).not.toContain("x-title");
    }
  });

  /**
   * The app's whole reply path is a strict `{reply, draft}` JSON schema.
   * OpenRouter routes one slug across many upstream hosts and not all of them
   * honour it, so a model that cannot promise structured output is not a
   * degraded choice — it is one that fails on every single send.
   */
  it("drops models that cannot do structured output", async () => {
    const fetchImpl = routed(
      response({
        data: [
          model("anthropic/claude-sonnet-5"),
          model("someone/text-only", { supported_parameters: ["tools"] }),
          model("someone/no-parameters-field", { supported_parameters: undefined }),
        ],
      }),
    );
    const result = await client(fetchImpl).fetch(API_KEY);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.models.map((entry) => entry.id)).toEqual(["anthropic/claude-sonnet-5"]);
  });

  it("converts per-token prices into the per-million figures a human reads", async () => {
    const fetchImpl = routed(response({ data: [model("anthropic/claude-sonnet-5")] }));
    const result = await client(fetchImpl).fetch(API_KEY);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.models[0]).toMatchObject({
      id: "anthropic/claude-sonnet-5",
      displayName: "Pretty anthropic/claude-sonnet-5",
      contextLength: 200_000,
      promptPricePerMillion: 3,
      completionPricePerMillion: 15,
      promoted: false,
    });
  });

  /**
   * Zero is a real price — OpenRouter lists genuinely free models — so the
   * absent case has to be a different value than the free case, or the picker
   * advertises "$0.00/M" for a model whose cost it simply does not know.
   */
  it("keeps a missing price distinct from a free one", async () => {
    const fetchImpl = routed(
      response({
        data: [
          model("free/model", { pricing: { prompt: "0", completion: "0" } }),
          model("unpriced/model", { pricing: undefined, context_length: undefined }),
          model("garbled/model", { pricing: { prompt: "cheap", completion: null } }),
        ],
      }),
    );
    const result = await client(fetchImpl).fetch(API_KEY);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.models).toMatchObject([
      { id: "free/model", promptPricePerMillion: 0, completionPricePerMillion: 0 },
      {
        id: "unpriced/model",
        promptPricePerMillion: null,
        completionPricePerMillion: null,
        contextLength: null,
      },
      { id: "garbled/model", promptPricePerMillion: null, completionPricePerMillion: null },
    ]);
  });

  /**
   * The malformed entries here deliberately declare structured-output support,
   * so they survive the capability filter and reach the id check. Without that
   * they were dropped one step earlier and this asserted nothing.
   */
  it("skips entries with no usable slug rather than listing a blank row", async () => {
    const structured = ["structured_outputs"];
    const fetchImpl = routed(
      response({
        data: [
          model("anthropic/claude-sonnet-5"),
          { name: "no id", supported_parameters: structured },
          { id: "", supported_parameters: structured },
          { id: 42, supported_parameters: structured },
          null,
          "text",
        ],
      }),
    );
    const result = await client(fetchImpl).fetch(API_KEY);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.models.map((entry) => entry.id)).toEqual(["anthropic/claude-sonnet-5"]);
  });

  it("names the slug when the provider offers no display name", async () => {
    const fetchImpl = routed(response({ data: [model("bare/slug", { name: undefined })] }));
    const result = await client(fetchImpl).fetch(API_KEY);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.models[0]?.displayName).toBe("bare/slug");
  });
});

describe("OpenRouterCatalogClient — credits", () => {
  it("reports what the key has left", async () => {
    const result = await client(routed(response({ data: [model("a/b")] }))).fetch(API_KEY);

    expect(result).toMatchObject({
      ok: true,
      credits: { remaining: 8.75, used: 1.25, limit: 10 },
    });
  });

  /**
   * An uncapped key has no balance to count down, which is not the same as a
   * balance of zero. Rendering "$0.00 remaining" for a key with no limit would
   * tell the analyst their key is spent when it is unlimited.
   */
  it("distinguishes an uncapped key from an exhausted one", async () => {
    const uncapped = response(keyInfo({ limit: null, limit_remaining: null }));
    const result = await client(routed(response({ data: [model("a/b")] }), uncapped)).fetch(
      API_KEY,
    );

    expect(result).toMatchObject({ ok: true, credits: { remaining: null, used: 1.25, limit: null } });
  });

  /**
   * The catalogue is the point of this call; credits are a courtesy. A balance
   * lookup that fails must not cost the analyst the model list — the picker
   * would fall back to a three-item shortlist over a missing dollar figure.
   */
  it("still returns the catalogue when the balance lookup fails", async () => {
    const result = await client(
      routed(response({ data: [model("a/b")] }), response({ error: "nope" }, 500)),
    ).fetch(API_KEY);

    expect(result).toMatchObject({ ok: true, credits: null });
    if (!result.ok) return;
    expect(result.models).toHaveLength(1);
  });

  /**
   * A rejected key is the one balance failure that must NOT be swallowed.
   *
   * OpenRouter's model list is public — it answers 200 to a request carrying no
   * credential at all, which is exactly why the credential validator uses
   * `/key` instead. So a revoked key still produces a full catalogue here, and
   * `/key` is the only part of this call that can tell. Treating its 401 as
   * "no balance to show" reported a healthy refresh over a dead key and left
   * the analyst to discover it on their next send.
   */
  it("reports a rejected key rather than a catalogue with no balance", async () => {
    const result = await client(
      routed(response({ data: [model("a/b")] }), response({ error: "invalid" }, 401)),
    ).fetch(API_KEY);

    expect(result).toMatchObject({ ok: false, code: "AUTHENTICATION" });
  });

  it("treats a forbidden key the same way", async () => {
    const result = await client(
      routed(response({ data: [model("a/b")] }), response({ error: "no" }, 403)),
    ).fetch(API_KEY);

    expect(result).toMatchObject({ ok: false, code: "AUTHENTICATION" });
  });

  /** Only 401/403. A 500 from the balance endpoint is still a courtesy failure. */
  it("does not turn an unreachable balance endpoint into a key problem", async () => {
    const unreachable = vi.fn(async (url: string) => {
      if (url.endsWith("/key")) throw new Error("ECONNRESET");
      return response({ data: [model("a/b")] });
    }) as unknown as typeof fetch;

    await expect(client(unreachable).fetch(API_KEY)).resolves.toMatchObject({
      ok: true,
      credits: null,
    });
  });
});

describe("OpenRouterCatalogClient — failures resolve as data", () => {
  it("names a rejected key as an authentication problem", async () => {
    const result = await client(routed(response({ error: "no" }, 401))).fetch(API_KEY);

    expect(result).toMatchObject({ ok: false, code: "AUTHENTICATION" });
  });

  it("names rate limiting as itself", async () => {
    const result = await client(routed(response({ error: "slow down" }, 429))).fetch(API_KEY);

    expect(result).toMatchObject({ ok: false, code: "RATE_LIMITED" });
  });

  it("carries the provider's own reason through on an unexpected status", async () => {
    const result = await client(
      routed(response({ error: { message: "catalogue is down" } }, 503)),
    ).fetch(API_KEY);

    expect(result).toMatchObject({ ok: false, code: "INVALID_RESPONSE" });
    if (result.ok) return;
    expect(result.message).toContain("catalogue is down");
  });

  it("reports an unreadable body rather than an empty catalogue", async () => {
    const result = await client(routed(response({ notData: true }))).fetch(API_KEY);

    expect(result).toMatchObject({ ok: false, code: "INVALID_RESPONSE" });
  });

  it("reports a transport failure without blaming the key", async () => {
    const failing = vi.fn(async () => {
      throw new Error("getaddrinfo ENOTFOUND");
    }) as unknown as typeof fetch;

    const result = await client(failing).fetch(API_KEY);

    expect(result).toMatchObject({ ok: false, code: "NETWORK" });
    if (result.ok) return;
    expect(result.message).toContain("ENOTFOUND");
  });

  it("reports a timeout as a timeout", async () => {
    const aborting = vi.fn(async () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    }) as unknown as typeof fetch;

    const result = await client(aborting).fetch(API_KEY);

    expect(result).toMatchObject({ ok: false, code: "TIMEOUT" });
  });

  it("never puts the key in a message it hands back", async () => {
    const result = await client(routed(response({ error: "no" }, 401))).fetch(API_KEY);

    expect(JSON.stringify(result)).not.toContain(API_KEY);
  });
});
