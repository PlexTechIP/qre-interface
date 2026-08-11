// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { FAKE_GENERATED_DRAFT } from "../shared/testing/fakeAgentService.js";
import { AnthropicDraftGenerator } from "./anthropicDraftGenerator.js";
import { OpenAiDraftGenerator } from "./openAiDraftGenerator.js";

const PROMPT = "Grover search over 20 qubits";
const API_KEY = "sk-openai-secret";

function response(payload: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => payload } as unknown as Response;
}

function completion(draft: unknown): Response {
  return response({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(draft) } }] });
}

describe("OpenAiDraftGenerator", () => {
  it("builds strict JSON schema output without a credential", () => {
    const body = new OpenAiDraftGenerator().buildRequestBody(PROMPT);
    expect(body).toMatchObject({ model: "gpt-5.6-terra", response_format: { type: "json_schema", json_schema: { strict: true, name: "runconfig_generation" } } });
    expect(JSON.stringify(body)).not.toContain(API_KEY);
  });

  it("uses Bearer authentication and parses a completed draft", async () => {
    const fetchImpl = vi.fn(async () => completion(FAKE_GENERATED_DRAFT));
    const result = await new OpenAiDraftGenerator("gpt-5.6-terra", fetchImpl as unknown as typeof fetch).requestDraft(API_KEY, PROMPT);
    expect(result).toMatchObject({ ok: true, provider: "OpenAI", model: "gpt-5.6-terra", draft: FAKE_GENERATED_DRAFT });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${API_KEY}`);
    expect(init.body).not.toContain(API_KEY);
  });

  /** The same contract check as the Anthropic twin — see `draftValidation.ts`. */
  it("refuses a reply that does not match the generation contract", async () => {
    const fetchImpl = vi.fn(async () => completion({ name: "draft" }));
    const result = await new OpenAiDraftGenerator("gpt-5.6-terra", fetchImpl as unknown as typeof fetch).requestDraft(API_KEY, PROMPT);
    expect(result).toMatchObject({ ok: false, code: "INVALID_RESPONSE" });
    if (result.ok) return;
    expect(result.message).toContain("Nothing was applied to the form.");
  });

  /**
   * The prompt was copy-pasted byte-for-byte into both adapters — the exact
   * second copy `generationSchemaWire.ts` exists to argue against. One wording
   * drifting from the other would make the two providers silently incomparable:
   * a difference in output would no longer be a difference between models.
   */
  it("sends the same system prompt as the Anthropic adapter", () => {
    const openAi = new OpenAiDraftGenerator().buildRequestBody(PROMPT);
    const anthropic = new AnthropicDraftGenerator().buildRequestBody(PROMPT);
    const system = openAi.messages.find((message) => message.role === "system");

    expect(system?.content).toBe(anthropic.system);
    expect(system?.content).toContain("Field guidance");
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
