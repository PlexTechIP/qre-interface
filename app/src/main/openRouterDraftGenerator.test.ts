// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import type { ChatTurn } from "../shared/agentTypes.js";
import { FAKE_GENERATED_DRAFT } from "../shared/testing/fakeAgentService.js";
import { openAiDraftGenerator } from "./openAiDraftGenerator.js";
import { openRouterDraftGenerator } from "./openRouterDraftGenerator.js";

const TURNS: readonly ChatTurn[] = [{ role: "user", content: "Grover search over 20 qubits" }];
const API_KEY = "sk-or-v1-secret";
const MODEL = "anthropic/claude-sonnet-5";

function response(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  } as unknown as Response;
}

/**
 * Parameters are declared even though the body ignores them: without them
 * `vi.fn(async () => …)` infers a zero-argument call signature, and every
 * `mock.calls[0][1]` read below becomes a type error on an empty tuple.
 */
const fetchStub = (respond: () => Response) =>
  vi.fn(async (_url: string, _init?: RequestInit) => respond());

const completion = (envelope: unknown): Response =>
  response({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(envelope) } }] });

const reply = (draft: unknown, text = "Here is a starting point."): unknown => ({
  reply: text,
  draft,
});

describe("openRouterDraftGenerator — what makes it not OpenAI", () => {
  it("posts to OpenRouter rather than to OpenAI", async () => {
    const fetchImpl = fetchStub(() => completion(reply(FAKE_GENERATED_DRAFT)));
    await openRouterDraftGenerator(MODEL, fetchImpl as unknown as typeof fetch).requestReply(
      API_KEY,
      TURNS,
    );

    expect(fetchImpl.mock.calls[0]?.[0]).toBe("https://openrouter.ai/api/v1/chat/completions");
  });

  /**
   * The one routing option that matters.
   *
   * OpenRouter fans a single slug out across many upstream hosts, and they do
   * not all honour `response_format`. Without this, a request can be routed to
   * a host that quietly ignores the strict schema and answers with prose — which
   * arrives as "the reply did not match the generation contract" and looks like
   * a model problem rather than a routing one. The catalogue filter narrows
   * *which* models are offered; this narrows *which hosts* serve them.
   */
  it("refuses hosts that would drop the strict schema", () => {
    const body = openRouterDraftGenerator(MODEL).buildRequestBody(TURNS);

    expect(body).toMatchObject({ provider: { require_parameters: true } });
  });

  it("reports itself as OpenRouter, carrying the vendor-qualified slug", async () => {
    const fetchImpl = fetchStub(() => completion(reply(FAKE_GENERATED_DRAFT)));
    const result = await openRouterDraftGenerator(
      MODEL,
      fetchImpl as unknown as typeof fetch,
    ).requestReply(API_KEY, TURNS);

    expect(result).toMatchObject({ ok: true, provider: "OpenRouter", model: MODEL });
  });

  /** Same reasoning as the catalogue client: no public leaderboard, no telemetry. */
  it("sends no app-attribution headers", async () => {
    const fetchImpl = fetchStub(() => completion(reply(null)));
    await openRouterDraftGenerator(MODEL, fetchImpl as unknown as typeof fetch).requestReply(
      API_KEY,
      TURNS,
    );

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const headers = Object.keys(init.headers as Record<string, string>).map((name) =>
      name.toLowerCase(),
    );
    expect(headers).toContain("authorization");
    expect(headers).not.toContain("http-referer");
    expect(headers).not.toContain("x-title");
  });
});

/**
 * The two providers ride one implementation, so these assert that the shared
 * core is genuinely shared rather than copied — a duplicate would pass every
 * OpenAI test above while quietly drifting here.
 */
describe("openRouterDraftGenerator — behaviour inherited from the shared core", () => {
  it("asks for the same strict envelope OpenAI does", () => {
    const openRouter = openRouterDraftGenerator(MODEL).buildRequestBody(TURNS);
    const openAi = openAiDraftGenerator().buildRequestBody(TURNS);

    expect(openRouter.response_format).toEqual(openAi.response_format);
    expect(openRouter.messages).toEqual(openAi.messages);
  });

  it("maps a rejected key to the same typed failure", async () => {
    const fetchImpl = fetchStub(() => response({ error: { message: "bad key" } }, 401));
    const result = await openRouterDraftGenerator(
      MODEL,
      fetchImpl as unknown as typeof fetch,
    ).requestReply(API_KEY, TURNS);

    expect(result).toMatchObject({ ok: false, code: "AUTHENTICATION" });
  });

  it("still validates the reply against the generation contract", async () => {
    const fetchImpl = fetchStub(() => completion({ reply: "here you go" }));
    const result = await openRouterDraftGenerator(
      MODEL,
      fetchImpl as unknown as typeof fetch,
    ).requestReply(API_KEY, TURNS);

    expect(result).toMatchObject({ ok: false, code: "INVALID_RESPONSE" });
  });

  it("never puts the key in the outbound body", async () => {
    const fetchImpl = fetchStub(() => completion(reply(null)));
    await openRouterDraftGenerator(MODEL, fetchImpl as unknown as typeof fetch).requestReply(
      API_KEY,
      TURNS,
    );

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(init.body).not.toContain(API_KEY);
  });
});

/** OpenAI must not acquire OpenRouter's routing option along the way. */
describe("openAiDraftGenerator after the extraction", () => {
  it("sends no routing constraint of its own", () => {
    expect(openAiDraftGenerator().buildRequestBody(TURNS)).not.toHaveProperty("provider");
  });
});
