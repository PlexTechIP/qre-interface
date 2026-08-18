// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import type { ChatTurn } from "../shared/agentTypes.js";
import { FAKE_GENERATED_DRAFT } from "../shared/testing/fakeAgentService.js";
import { AnthropicDraftGenerator } from "./anthropicDraftGenerator.js";
import { openAiDraftGenerator } from "./openAiDraftGenerator.js";

const TURNS: readonly ChatTurn[] = [{ role: "user", content: "Grover search over 20 qubits" }];
const API_KEY = "sk-openai-secret";

function response(payload: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => payload } as unknown as Response;
}

/**
 * A completed turn: prose in `content`, the proposal in `tool_calls`.
 *
 * The arguments arrive as a JSON *string* in this wire format, which is the one
 * real difference from Anthropic's — and the one place a strict schema cannot
 * help, because a truncated response yields a string that does not close.
 */
function completion(draft: unknown, text = "Here is a starting point."): Response {
  return response({
    choices: [
      {
        finish_reason: "stop",
        message: {
          content: text,
          ...(draft === undefined
            ? {}
            : {
                tool_calls: [
                  {
                    id: "call_1",
                    type: "function",
                    function: {
                      name: "propose_run_config",
                      arguments: JSON.stringify(draft),
                    },
                  },
                ],
              }),
        },
      },
    ],
  });
}

const generator = (fetchImpl: unknown) =>
  openAiDraftGenerator("gpt-5.6-terra", fetchImpl as typeof fetch);

describe("openAiDraftGenerator", () => {
  it("builds strict JSON schema output without a credential", () => {
    const body = openAiDraftGenerator().buildRequestBody(TURNS);
    expect(body).toMatchObject({ model: "gpt-5.6-terra", tool_choice: "auto" });
    expect(body.tools[0]?.function).toMatchObject({ name: "propose_run_config", strict: true });
    expect(body.tools[0]?.function.parameters).toMatchObject({ additionalProperties: false });
    expect(JSON.stringify(body)).not.toContain(API_KEY);
  });

  /** The system turn leads; the transcript follows it, oldest first. */
  it("puts the whole transcript after the system turn", () => {
    const transcript: ChatTurn[] = [
      { role: "user", content: "Grover, 20 qubits" },
      { role: "assistant", content: '{"reply":"Here it is.","draft":null}' },
      { role: "user", content: "make the gate time 80" },
    ];
    const { messages } = openAiDraftGenerator().buildRequestBody(transcript);

    expect(messages[0]).toMatchObject({ role: "system" });
    expect(messages.slice(1)).toEqual(transcript);
  });

  it("uses Bearer authentication and parses a completed turn", async () => {
    const fetchImpl = vi.fn(async () => completion(FAKE_GENERATED_DRAFT));
    const result = await generator(fetchImpl).requestReply(API_KEY, TURNS);
    expect(result).toMatchObject({
      ok: true,
      provider: "OpenAI",
      model: "gpt-5.6-terra",
      reply: "Here is a starting point.",
      draft: FAKE_GENERATED_DRAFT,
    });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${API_KEY}`);
    expect(init.body).not.toContain(API_KEY);
  });

  it("accepts a turn that proposes nothing", async () => {
    const fetchImpl = vi.fn(async () => completion(undefined, "Which error budget?"));
    const result = await generator(fetchImpl).requestReply(API_KEY, TURNS);
    expect(result).toMatchObject({ ok: true, reply: "Which error budget?", draft: null });
  });

  /** The same contract check as the Anthropic twin — see `draftValidation.ts`. */
  it("refuses a reply that does not match the generation contract", async () => {
    const fetchImpl = vi.fn(async () => completion({ name: "draft" }));
    const result = await generator(fetchImpl).requestReply(API_KEY, TURNS);
    expect(result).toMatchObject({ ok: false, code: "INVALID_RESPONSE" });
    if (result.ok) return;
    expect(result.message).toContain("Nothing was added to the conversation.");
  });

  /**
   * The prompt was copy-pasted byte-for-byte into both adapters — the exact
   * second copy `generationSchemaWire.ts` exists to argue against. One wording
   * drifting from the other would make the two providers silently incomparable:
   * a difference in output would no longer be a difference between models.
   */
  it("sends the same system prompt as the Anthropic adapter", () => {
    const openAi = openAiDraftGenerator().buildRequestBody(TURNS);
    const anthropic = new AnthropicDraftGenerator().buildRequestBody(TURNS);
    const system = openAi.messages.find((message) => message.role === "system");

    expect(system?.content).toBe(anthropic.system);
    expect(system?.content).toContain("Field guidance");
  });

  /**
   * Both adapters ask for the same envelope too. A provider that returned bare
   * prose where the other returned `{ reply, draft }` would make the two
   * incomparable in a way no test of the prompt alone would catch.
   */
  it("offers the same tool as the Anthropic adapter", () => {
    const openAi = openAiDraftGenerator().buildRequestBody(TURNS);
    const anthropic = new AnthropicDraftGenerator().buildRequestBody(TURNS);

    // Same name and same input schema, from the same constant. Two providers
    // given differently-shaped tools would produce drafts that are not
    // comparable, which no test of either one alone would catch.
    expect(openAi.tools[0]?.function.name).toBe(anthropic.tools[0]?.name);
    expect(openAi.tools[0]?.function.parameters).toEqual(anthropic.tools[0]?.input_schema);
  });

  it.each([[401, "AUTHENTICATION"], [429, "RATE_LIMITED"], [500, "INVALID_RESPONSE"]])("resolves HTTP %i as %s", async (status, code) => {
    const fetchImpl = vi.fn(async () => response({}, status));
    const result = await generator(fetchImpl).requestReply(API_KEY, TURNS);
    expect(result).toMatchObject({ ok: false, code });
  });

  it("distinguishes refusal and truncation from a usable turn", async () => {
    const refusal = await generator(vi.fn(async () => response({ choices: [{ message: { refusal: "no" } }] }))).requestReply(API_KEY, TURNS);
    const truncated = await generator(vi.fn(async () => response({ choices: [{ finish_reason: "length", message: { content: "" } }] }))).requestReply(API_KEY, TURNS);
    expect(refusal).toMatchObject({ ok: false, code: "REFUSED" });
    expect(truncated).toMatchObject({ ok: false, code: "INVALID_RESPONSE" });
  });
});
