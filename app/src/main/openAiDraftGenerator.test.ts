// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { OpenAiDraftGenerator } from "./openAiDraftGenerator.js";

const PROMPT = "Grover search over 20 qubits";
const API_KEY = "sk-openai-secret";

function response(payload: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => payload } as unknown as Response;
}

describe("OpenAiDraftGenerator", () => {
  it("builds strict JSON schema output without a credential", () => {
    const body = new OpenAiDraftGenerator().buildRequestBody(PROMPT);
    expect(body).toMatchObject({ model: "gpt-5.6-terra", response_format: { type: "json_schema", json_schema: { strict: true, name: "runconfig_generation" } } });
    expect(JSON.stringify(body)).not.toContain(API_KEY);
  });

  it("uses Bearer authentication and parses a completed draft", async () => {
    const fetchImpl = vi.fn(async () => response({ choices: [{ finish_reason: "stop", message: { content: '{"name":"draft"}' } }] }));
    const result = await new OpenAiDraftGenerator("gpt-5.6-terra", fetchImpl as unknown as typeof fetch).requestDraft(API_KEY, PROMPT);
    expect(result).toMatchObject({ ok: true, provider: "OpenAI", model: "gpt-5.6-terra", draft: { name: "draft" } });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${API_KEY}`);
    expect(init.body).not.toContain(API_KEY);
  });

  it.each([[401, "AUTHENTICATION"], [429, "RATE_LIMITED"], [500, "INVALID_RESPONSE"]])("resolves HTTP %i as %s", async (status, code) => {
    const fetchImpl = vi.fn(async () => response({}, status));
    const result = await new OpenAiDraftGenerator("gpt-5.6-terra", fetchImpl as unknown as typeof fetch).requestDraft(API_KEY, PROMPT);
    expect(result).toMatchObject({ ok: false, code });
  });

  it("distinguishes refusal and truncation from a usable JSON draft", async () => {
    const refusal = await new OpenAiDraftGenerator("gpt-5.6-terra", vi.fn(async () => response({ choices: [{ message: { refusal: "no" } }] })) as unknown as typeof fetch).requestDraft(API_KEY, PROMPT);
    const truncated = await new OpenAiDraftGenerator("gpt-5.6-terra", vi.fn(async () => response({ choices: [{ finish_reason: "length", message: { content: "" } }] })) as unknown as typeof fetch).requestDraft(API_KEY, PROMPT);
    expect(refusal).toMatchObject({ ok: false, code: "REFUSED" });
    expect(truncated).toMatchObject({ ok: false, code: "INVALID_RESPONSE" });
  });
});
