// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { PROVIDER_MODELS } from "../shared/providerModels.js";
import { FAKE_GENERATED_DRAFT } from "../shared/testing/fakeAgentService.js";
import { AnthropicDraftGenerator } from "./anthropicDraftGenerator.js";

import type { ChatTurn } from "../shared/agentTypes.js";

const TURNS: readonly ChatTurn[] = [
  { role: "user", content: "Grover search over 20 qubits on a gate-based QPU" },
];
const API_KEY = "sk-ant-secret-value";

/**
 * A Messages-API success carrying whatever content blocks a turn produced.
 *
 * Prose and proposal are now two blocks rather than two fields of one JSON
 * string, which is the whole of the M3 change at this layer.
 */
function messageResponse(
  content: readonly unknown[],
  overrides: Record<string, unknown> = {},
): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ stop_reason: "end_turn", content, ...overrides }),
  } as unknown as Response;
}

const textBlock = (text: string): unknown => ({ type: "text", text });

const toolBlock = (input: unknown, id = "toolu_01"): unknown => ({
  type: "tool_use",
  id,
  name: "propose_run_config",
  input,
});

/** The ordinary shape of a turn: a sentence, and a proposal beside it. */
const spoken = (input: unknown, text = "Here is a starting point."): readonly unknown[] =>
  input === undefined ? [textBlock(text)] : [textBlock(text), toolBlock(input)];

function errorResponse(status: number, body = ""): Response {
  return {
    ok: false,
    status,
    text: async () => body,
    json: async () => ({}),
  } as unknown as Response;
}

describe("AnthropicDraftGenerator request body", () => {
  it("offers the draft as a tool rather than as an output format", () => {
    const body = new AnthropicDraftGenerator().buildRequestBody(TURNS);

    expect(body.model).toBe("claude-sonnet-5");
    expect(body.tools).toHaveLength(1);
    expect(body.tools[0]).toMatchObject({ name: "propose_run_config" });

    // The tool's input schema is the lowered contract itself — still
    // description- and title-free, because those strings are compiled into a
    // decoding grammar and pushed it over the provider's size ceiling. What
    // changed in M3 is where the schema rides, not what it says.
    const schema = body.tools[0]?.input_schema as Record<string, unknown>;
    expect(schema).toMatchObject({ type: "object", additionalProperties: false });
    expect(schema["required"]).toContain("application");
    expect(JSON.stringify(schema)).not.toContain("description");
    expect(schema).not.toHaveProperty("title");

    // …and the guidance is not lost, only relocated.
    expect(body.system).toContain("Field guidance");
    expect(body.system).toContain("searchQubits");
  });

  /**
   * The envelope is gone, and with it the three things it forced: no streaming,
   * no markdown, and prose written in the register of something filling a form.
   * A body that still asked for `json_schema` output would put the reply back
   * inside a JSON string and undo all three at once.
   */
  it("no longer asks for structured output at all", () => {
    const body = new AnthropicDraftGenerator().buildRequestBody(TURNS);

    expect(body.output_config).not.toHaveProperty("format");
    expect(JSON.stringify(body)).not.toContain("json_schema");
  });

  it("tells the model it may write like a person", () => {
    const { system } = new AnthropicDraftGenerator().buildRequestBody(TURNS);

    expect(system).toMatch(/markdown/i);
    expect(system).not.toMatch(/no markdown/i);
  });

  /**
   * The whole conversation goes out on every turn. Main holds none of it, so a
   * body missing the earlier turns is a model with no memory of what it just
   * proposed — and a "make the gate time 80" that re-derives every other field.
   */
  it("sends the whole transcript, oldest first", () => {
    const transcript: ChatTurn[] = [
      { role: "user", content: "Grover, 20 qubits" },
      { role: "assistant", content: "Here it is.", draft: null },
      { role: "user", content: "make the gate time 80" },
    ];

    // An assistant turn that proposed nothing lowers to plain prose — there is
    // no tool call to reconstruct, so nothing wraps it.
    expect(new AnthropicDraftGenerator().buildRequestBody(transcript).messages).toEqual([
      { role: "user", content: "Grover, 20 qubits" },
      { role: "assistant", content: "Here it is." },
      { role: "user", content: "make the gate time 80" },
    ]);
  });

  /**
   * `output_config.effort` is a 5-generation parameter. Haiku 4.5 answers it
   * with a 400, so sending it unconditionally made the cheapest entry in the
   * model menu the one that could never succeed — and the failure arrived as an
   * opaque provider rejection rather than as anything naming the cause.
   */
  it.each(["claude-sonnet-5", "claude-opus-5"])("paces thinking with low effort on %s", (model) => {
    const body = new AnthropicDraftGenerator(model).buildRequestBody(TURNS);

    expect(body.output_config.effort).toBe("low");
  });

  it("omits effort entirely on a model that rejects the parameter", () => {
    const body = new AnthropicDraftGenerator("claude-haiku-4-5").buildRequestBody(TURNS);

    // Absent, not undefined: `JSON.stringify` drops an undefined value, but the
    // preview panel renders this object directly and would show the key.
    expect(body.output_config).not.toHaveProperty("effort");
    expect(Object.keys(body.output_config)).toEqual([]);
    // The part that actually matters on this model is untouched.
    expect(body.tools[0]?.name).toBe("propose_run_config");
  });

  /**
   * Every model the picker offers has to produce a body the provider accepts.
   * A menu entry that always 400s is the failure this pins, whichever model is
   * added next.
   */
  it("builds a body for every Anthropic model the picker offers", () => {
    for (const model of PROVIDER_MODELS.anthropic.models) {
      const body = new AnthropicDraftGenerator(model).buildRequestBody(TURNS);
      expect(body.model).toBe(model);
      expect(body.tools[0]?.input_schema).toBeDefined();
    }
  });

  it("never puts a credential in the request body", () => {
    const generator = new AnthropicDraftGenerator();
    const serialized = JSON.stringify(generator.buildRequestBody(TURNS));

    expect(serialized).not.toContain(API_KEY);
    expect(serialized).not.toContain("x-api-key");
    // The preview shown to the analyst is this exact object — if a key could
    // reach it, the UI would be displaying the secret it exists to protect.
    expect(Object.keys(generator.buildRequestBody(TURNS))).not.toContain("apiKey");
  });

  it("sends the key as a header, and only as a header", async () => {
    const fetchImpl = vi.fn(async (): Promise<Response> => messageResponse(spoken(undefined)));
    await new AnthropicDraftGenerator("claude-opus-5", fetchImpl as unknown as typeof fetch)
      .requestReply(API_KEY, TURNS);

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
    ).requestReply(API_KEY, TURNS);
  }

  it("returns the prose and the parsed draft on success", async () => {
    const result = await draftWith(messageResponse(spoken(FAKE_GENERATED_DRAFT)));

    expect(result).toEqual({
      ok: true,
      reply: "Here is a starting point.",
      draft: FAKE_GENERATED_DRAFT,
      provider: "Anthropic",
      model: "claude-opus-5",
    });
  });

  /**
   * A turn is allowed to be a question. The one-shot surface this replaced could
   * only answer with a complete configuration, so "which error budget?" was
   * unrepresentable and the model guessed instead.
   */
  it("accepts a turn that proposes nothing", async () => {
    const result = await draftWith(
      messageResponse(spoken(undefined, "Which error budget do you want?")),
    );

    expect(result).toMatchObject({
      ok: true,
      reply: "Which error budget do you want?",
      draft: null,
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
      messageResponse(
        spoken({
          ...FAKE_GENERATED_DRAFT,
          architecture: {
            type: "gateBased",
            errorRate: "1e-3",
            gateTime: 50,
            measurementTime: 100,
            twoQubitGateTime: null,
          },
        }),
      ),
    );

    expect(result).toMatchObject({ ok: false, code: "INVALID_RESPONSE" });
    if (result.ok) return;
    expect(result.message).toContain("architecture.errorRate");
    expect(result.message).toContain("Nothing was added to the conversation.");
  });

  it("refuses a reply missing a required section", async () => {
    const draft: Record<string, unknown> = structuredClone(FAKE_GENERATED_DRAFT);
    delete draft["traceTransform"];

    const result = await draftWith(messageResponse(spoken(draft)));

    expect(result).toMatchObject({ ok: false, code: "INVALID_RESPONSE" });
    if (result.ok) return;
    expect(result.message).toContain("traceTransform");
  });

  /**
   * Refused WHOLE, not in halves. Showing the prose above a draft card that
   * cannot be opened puts "here is a configuration for Grover" in the
   * transcript and lets the conversation continue from a proposal that was
   * never actually made.
   */
  it("refuses the whole turn when only the draft is malformed", async () => {
    const result = await draftWith(
      messageResponse(
        spoken({ ...FAKE_GENERATED_DRAFT, maxError: "very small" }, "Here is a Grover setup."),
      ),
    );

    expect(result).toMatchObject({ ok: false, code: "INVALID_RESPONSE" });
    if (result.ok) return;
    expect(result.message).not.toContain("Here is a Grover setup.");
  });

  /**
   * A turn has to be SOMETHING. Under the envelope this was a schema violation;
   * with tool calls the two halves are independent, so the only unreadable turn
   * is one carrying neither prose nor a proposal.
   */
  it("refuses a turn that is neither prose nor a proposal", async () => {
    const result = await draftWith(messageResponse([]));

    expect(result).toMatchObject({ ok: false, code: "INVALID_RESPONSE" });
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
      messageResponse([], { stop_reason: "refusal" }),
    );
    expect(refused).toMatchObject({ ok: false, code: "REFUSED" });

    const truncated = await draftWith(
      messageResponse([], { stop_reason: "max_tokens" }),
    );
    expect(truncated).toMatchObject({ ok: false, code: "INVALID_RESPONSE" });
  });

  /**
   * The inverse of what the envelope required. Prose that is not JSON used to
   * be a protocol violation; it is now simply an answer, which is the point of
   * the whole milestone — the model can say something without proposing.
   */
  it("accepts plain prose as a complete turn", async () => {
    const result = await draftWith(
      messageResponse([textBlock("Grover needs a qubit count before I can size it.")]),
    );

    expect(result).toMatchObject({
      ok: true,
      reply: "Grover needs a qubit count before I can size it.",
      draft: null,
    });
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
    ).requestReply(API_KEY, TURNS, { cancel: cancel.signal });

    expect(result).toMatchObject({ ok: false, code: "CANCELLED" });
    if (result.ok) return;
    expect(result.message).toContain("Nothing was added to the conversation.");
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
    ).requestReply(API_KEY, TURNS, { cancel: cancel.signal });

    expect(result).toMatchObject({ ok: false, code: "TIMEOUT" });
  });
});

/**
 * The draft arrives as tool-call arguments now, not as a field of a JSON
 * string. These pin the seams that creates: reading two independent content
 * blocks on the way in, and reconstructing a past tool call on the way out.
 */
describe("AnthropicDraftGenerator — the proposal tool", () => {
  async function turnFrom(content: readonly unknown[]) {
    const fetchImpl = vi.fn(async (): Promise<Response> => messageResponse(content));
    return new AnthropicDraftGenerator(
      "claude-opus-5",
      fetchImpl as unknown as typeof fetch,
    ).requestReply(API_KEY, TURNS);
  }

  it("reads prose and proposal out of the same turn", async () => {
    const result = await turnFrom(spoken(FAKE_GENERATED_DRAFT, "Gate-based suits this best."));

    expect(result).toMatchObject({
      ok: true,
      reply: "Gate-based suits this best.",
      draft: FAKE_GENERATED_DRAFT,
    });
  });

  /**
   * Models emit several text blocks around a tool call rather than one. Reading
   * only the first drops whatever was said after the proposal — usually the
   * sentence explaining it.
   */
  it("joins every text block, in order", async () => {
    const result = await turnFrom([
      textBlock("Gate-based suits this best."),
      toolBlock(FAKE_GENERATED_DRAFT),
      textBlock("Worth comparing against Majorana next."),
    ]);

    expect(result).toMatchObject({
      ok: true,
      reply: "Gate-based suits this best.\n\nWorth comparing against Majorana next.",
    });
  });

  /** A proposal with no sentence around it is still a proposal. */
  it("accepts a tool call that arrived without prose", async () => {
    const result = await turnFrom([toolBlock(FAKE_GENERATED_DRAFT)]);

    expect(result).toMatchObject({ ok: true, reply: "", draft: FAKE_GENERATED_DRAFT });
  });

  /** The same contract gate as before, moved to where the draft now arrives. */
  it("refuses a tool call whose arguments miss the contract, naming the field", async () => {
    const result = await turnFrom([
      textBlock("Here you go."),
      toolBlock({ ...FAKE_GENERATED_DRAFT, maxError: "very small" }),
    ]);

    expect(result).toMatchObject({ ok: false, code: "INVALID_RESPONSE" });
    if (result.ok) return;
    expect(result.message).toContain("maxError");
    // Refused whole: the prose must not survive a proposal that did not.
    expect(result.message).not.toContain("Here you go.");
  });

  it("ignores a tool call for a tool it was never given", async () => {
    const result = await turnFrom([
      textBlock("Thinking about it."),
      { type: "tool_use", id: "x", name: "some_other_tool", input: { a: 1 } },
    ]);

    expect(result).toMatchObject({ ok: true, reply: "Thinking about it.", draft: null });
  });
});

describe("AnthropicDraftGenerator — replaying a past proposal", () => {
  const priorDraft = FAKE_GENERATED_DRAFT;
  const transcript: ChatTurn[] = [
    { role: "user", content: "Grover, 20 qubits" },
    { role: "assistant", content: "Here is a starting point.", draft: priorDraft },
    { role: "user", content: "make the gate time 80" },
  ];

  /**
   * Replayed as the tool call it actually was. Sending only the prose would
   * drop the configuration from the context, and a model asked to "make the
   * gate time 80" against a transcript containing no configuration re-derives
   * one from scratch — silently resetting every field the analyst had settled.
   */
  it("reconstructs the assistant turn as prose plus a tool call", () => {
    const { messages } = new AnthropicDraftGenerator().buildRequestBody(transcript);

    expect(messages[1]).toMatchObject({
      role: "assistant",
      content: [
        { type: "text", text: "Here is a starting point." },
        { type: "tool_use", name: "propose_run_config", input: priorDraft },
      ],
    });
  });

  /**
   * The Messages API requires every `tool_use` to be answered by a
   * `tool_result` in the NEXT message, and requires roles to alternate. Emitting
   * the result as its own message would put two user turns back to back; the
   * answer is folded into the user turn that already follows.
   */
  it("answers the tool call inside the user turn that follows it", () => {
    const { messages } = new AnthropicDraftGenerator().buildRequestBody(transcript);

    expect(messages).toHaveLength(3);
    expect(messages.map((message) => message.role)).toEqual(["user", "assistant", "user"]);

    const answer = messages[2]?.content as unknown as { type: string; tool_use_id?: string }[];
    expect(answer[0]).toMatchObject({ type: "tool_result" });
    expect(answer[1]).toMatchObject({ type: "text", text: "make the gate time 80" });
  });

  it("matches each result to the call it answers", () => {
    const { messages } = new AnthropicDraftGenerator().buildRequestBody([
      ...transcript,
      { role: "assistant", content: "Done.", draft: priorDraft },
      { role: "user", content: "and the error budget" },
    ]);

    const blocks = messages.flatMap((message) =>
      Array.isArray(message.content)
        ? (message.content as unknown as { type: string; id?: string; tool_use_id?: string }[])
        : [],
    );
    const calls = blocks.filter((block) => block.type === "tool_use").map((block) => block.id);
    const results = blocks
      .filter((block) => block.type === "tool_result")
      .map((block) => block.tool_use_id);

    // Two proposals in the transcript, two calls, two answers — and the ids are
    // distinct, or the provider would pair the second answer with the first call.
    expect(calls).toHaveLength(2);
    expect(new Set(calls).size).toBe(2);
    expect(results).toEqual(calls);
  });

  /** A proposal at the very end of a transcript still has to be answered. */
  it("answers a trailing tool call with a message of its own", () => {
    const { messages } = new AnthropicDraftGenerator().buildRequestBody([
      { role: "user", content: "Grover, 20 qubits" },
      { role: "assistant", content: "Here it is.", draft: priorDraft },
    ]);

    expect(messages).toHaveLength(3);
    expect(messages[2]?.role).toBe("user");
    expect((messages[2]?.content as unknown as { type: string }[])[0]).toMatchObject({
      type: "tool_result",
    });
  });
});

describe("AnthropicDraftGenerator — a transcript that breaks the alternation rule", () => {
  /**
   * Every `tool_use` must be answered before the next request is accepted. A
   * second assistant turn used to overwrite the pending call id without
   * emitting its answer, so the first block went unanswered and the provider
   * rejected the whole conversation with a 400 naming nothing the analyst did.
   */
  it("answers a pending call before opening another one", () => {
    const { messages } = new AnthropicDraftGenerator().buildRequestBody([
      { role: "user", content: "Grover, 20 qubits" },
      { role: "assistant", content: "One option.", draft: FAKE_GENERATED_DRAFT },
      { role: "assistant", content: "Or this one.", draft: FAKE_GENERATED_DRAFT },
      { role: "user", content: "the second" },
    ]);

    const blocks = messages.flatMap((message) =>
      Array.isArray(message.content)
        ? (message.content as unknown as { type: string; id?: string; tool_use_id?: string }[])
        : [],
    );
    const calls = blocks.filter((block) => block.type === "tool_use").map((block) => block.id);
    const answers = blocks
      .filter((block) => block.type === "tool_result")
      .map((block) => block.tool_use_id);

    expect(calls).toHaveLength(2);
    expect(new Set(answers)).toEqual(new Set(calls));
  });

  it("keeps roles alternating even then", () => {
    const { messages } = new AnthropicDraftGenerator().buildRequestBody([
      { role: "user", content: "Grover, 20 qubits" },
      { role: "assistant", content: "One option.", draft: FAKE_GENERATED_DRAFT },
      { role: "assistant", content: "Or this one.", draft: FAKE_GENERATED_DRAFT },
      { role: "user", content: "the second" },
    ]);

    for (const [index, message] of messages.entries()) {
      if (index === 0) continue;
      expect(message.role).not.toBe(messages[index - 1]?.role);
    }
  });
});
