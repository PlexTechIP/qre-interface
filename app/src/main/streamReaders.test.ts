// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import type { ChatTurn } from "../shared/agentTypes.js";
import { FAKE_GENERATED_DRAFT } from "../shared/testing/fakeAgentService.js";
import { AnthropicDraftGenerator } from "./anthropicDraftGenerator.js";
import { openAiDraftGenerator } from "./openAiDraftGenerator.js";

/**
 * The stream readers, against the event shapes the providers actually send.
 *
 * `serverSentEvents.test.ts` covers the framing — chunk reassembly, `[DONE]`,
 * malformed lines — and stops there. This covers what the payloads MEAN, which
 * is where the two adapters differ and where every interesting bug lives.
 */

const TURNS: readonly ChatTurn[] = [{ role: "user", content: "Grover, 20 qubits" }];
const API_KEY = "sk-secret";

/** A streaming Response whose body hands out the given SSE events. */
function sseResponse(...events: readonly unknown[]): Response {
  const encoder = new TextEncoder();
  return {
    ok: true,
    status: 200,
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        for (const event of events) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n`));
        }
        controller.enqueue(encoder.encode("data: [DONE]\n"));
        controller.close();
      },
    }),
  } as unknown as Response;
}

const fetchOf = (response: Response): typeof fetch =>
  vi.fn(async () => response) as unknown as typeof fetch;

describe("AnthropicDraftGenerator — reading a stream", () => {
  const textDelta = (text: string, index = 0): unknown => ({
    type: "content_block_delta",
    index,
    delta: { type: "text_delta", text },
  });
  const toolStart = (index: number, name = "propose_run_config"): unknown => ({
    type: "content_block_start",
    index,
    content_block: { type: "tool_use", id: `toolu_${index}`, name, input: {} },
  });
  const argsDelta = (partial_json: string, index: number): unknown => ({
    type: "content_block_delta",
    index,
    delta: { type: "input_json_delta", partial_json },
  });

  async function stream(...events: readonly unknown[]) {
    const fragments: string[] = [];
    const result = await new AnthropicDraftGenerator(
      "claude-opus-5",
      fetchOf(sseResponse(...events)),
    ).requestReply(API_KEY, TURNS, { onDelta: (fragment) => fragments.push(fragment) });
    return { result, fragments };
  }

  it("hands each fragment out as it arrives and keeps the whole thing", async () => {
    const { result, fragments } = await stream(
      textDelta("Gate-based "),
      textDelta("suits this."),
    );

    expect(fragments).toEqual(["Gate-based ", "suits this."]);
    expect(result).toMatchObject({ ok: true, reply: "Gate-based suits this.", draft: null });
  });

  it("buffers the tool arguments and validates them once the stream closes", async () => {
    const json = JSON.stringify(FAKE_GENERATED_DRAFT);
    const { result, fragments } = await stream(
      textDelta("Here you go."),
      toolStart(1),
      argsDelta(json.slice(0, 30), 1),
      argsDelta(json.slice(30), 1),
    );

    // Only prose streams. Half a configuration is not a configuration.
    expect(fragments).toEqual(["Here you go."]);
    expect(result).toMatchObject({ ok: true, draft: FAKE_GENERATED_DRAFT });
  });

  /**
   * A turn may contain more than one tool_use block. A single stream-wide "we
   * saw our tool" flag concatenated both blocks' argument fragments into one
   * buffer, producing unparseable JSON and refusing a turn that had a perfectly
   * good first proposal — while the non-streaming path silently kept the first.
   */
  it("keeps the first proposal when the model calls the tool twice", async () => {
    const json = JSON.stringify(FAKE_GENERATED_DRAFT);
    const other = JSON.stringify({ ...FAKE_GENERATED_DRAFT, maxError: 0.5 });
    const { result } = await stream(
      toolStart(0),
      argsDelta(json, 0),
      toolStart(1),
      argsDelta(other, 1),
    );

    expect(result).toMatchObject({ ok: true, draft: FAKE_GENERATED_DRAFT });
  });

  it("ignores a block for a tool it was never given", async () => {
    const { result } = await stream(
      textDelta("Thinking."),
      toolStart(1, "some_other_tool"),
      argsDelta('{"a":1}', 1),
    );

    expect(result).toMatchObject({ ok: true, reply: "Thinking.", draft: null });
  });

  it("reports a truncated stream as truncated, not as a contract failure", async () => {
    const { result } = await stream(
      textDelta("Here you go."),
      toolStart(1),
      argsDelta('{"name":"half', 1),
    );

    expect(result).toMatchObject({ ok: false, code: "INVALID_RESPONSE" });
    if (result.ok) return;
    expect(result.message).toMatch(/not valid JSON/i);
    expect(result.message).not.toMatch(/generation contract/i);
  });

  it("maps a streamed refusal and a streamed truncation to their own codes", async () => {
    const refused = await stream({
      type: "message_delta",
      delta: { stop_reason: "refusal" },
    });
    expect(refused.result).toMatchObject({ ok: false, code: "REFUSED" });

    const cut = await stream(
      textDelta("Starting…"),
      { type: "message_delta", delta: { stop_reason: "max_tokens" } },
    );
    expect(cut.result).toMatchObject({ ok: false, code: "INVALID_RESPONSE" });
  });

  it("asks for a stream only when somebody is listening", async () => {
    const fetchImpl = vi.fn(async () => sseResponse(textDelta("hi")));
    await new AnthropicDraftGenerator(
      "claude-opus-5",
      fetchImpl as unknown as typeof fetch,
    ).requestReply(API_KEY, TURNS);

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.body as string).not.toContain('"stream"');
  });
});

describe("chat completions — reading a stream", () => {
  const chunk = (delta: unknown, finish_reason: unknown = null): unknown => ({
    choices: [{ index: 0, delta, finish_reason }],
  });
  const callDelta = (
    index: number,
    args: string,
    name?: string,
  ): unknown =>
    chunk({
      tool_calls: [
        { index, ...(name === undefined ? {} : { id: `call_${index}` }), function: { ...(name === undefined ? {} : { name }), arguments: args } },
      ],
    });

  async function stream(...events: readonly unknown[]) {
    const fragments: string[] = [];
    const result = await openAiDraftGenerator(
      "gpt-5.6-terra",
      fetchOf(sseResponse(...events)),
    ).requestReply(API_KEY, TURNS, { onDelta: (fragment) => fragments.push(fragment) });
    return { result, fragments };
  }

  it("hands each content fragment out as it arrives", async () => {
    const { result, fragments } = await stream(
      chunk({ content: "Gate-based " }),
      chunk({ content: "suits this." }),
    );

    expect(fragments).toEqual(["Gate-based ", "suits this."]);
    expect(result).toMatchObject({ ok: true, reply: "Gate-based suits this." });
  });

  it("reassembles tool arguments split across chunks", async () => {
    const json = JSON.stringify(FAKE_GENERATED_DRAFT);
    const { result } = await stream(
      chunk({ content: "Here you go." }),
      callDelta(0, json.slice(0, 25), "propose_run_config"),
      callDelta(0, json.slice(25)),
    );

    expect(result).toMatchObject({ ok: true, draft: FAKE_GENERATED_DRAFT });
  });

  /**
   * `parallel_tool_calls` defaults to true, so a model can emit two calls whose
   * argument fragments interleave by index. Appending every fragment to one
   * buffer produced two interleaved JSON objects, which parse as nothing and
   * refused the whole turn — prose included.
   */
  it("does not interleave two concurrent calls into one buffer", async () => {
    const json = JSON.stringify(FAKE_GENERATED_DRAFT);
    const other = JSON.stringify({ ...FAKE_GENERATED_DRAFT, maxError: 0.5 });
    const { result } = await stream(
      callDelta(0, json.slice(0, 20), "propose_run_config"),
      callDelta(1, other.slice(0, 20), "propose_run_config"),
      callDelta(0, json.slice(20)),
      callDelta(1, other.slice(20)),
    );

    expect(result).toMatchObject({ ok: true, draft: FAKE_GENERATED_DRAFT });
  });

  it("reports a truncated stream as truncated", async () => {
    const { result } = await stream(
      chunk({ content: "Here you go." }),
      callDelta(0, '{"name":"half', "propose_run_config"),
    );

    expect(result).toMatchObject({ ok: false, code: "INVALID_RESPONSE" });
    if (result.ok) return;
    expect(result.message).toMatch(/not valid JSON/i);
  });

  it("maps a streamed refusal, truncation and content filter", async () => {
    await expect(stream(chunk({ refusal: "I can't help with that." }))).resolves
      .toMatchObject({ result: { ok: false, code: "REFUSED" } });

    await expect(stream(chunk({ content: "…" }, "length"))).resolves.toMatchObject({
      result: { ok: false, code: "INVALID_RESPONSE" },
    });

    // A filtered completion arrives with no refusal delta and a finish reason
    // the length check does not match, so it used to read as an ordinary turn.
    const filtered = await stream(chunk({ content: "part" }, "content_filter"));
    expect(filtered.result).toMatchObject({ ok: false, code: "REFUSED" });
  });

  it("never asks for parallel tool calls", async () => {
    const fetchImpl = vi.fn(async () => sseResponse(chunk({ content: "hi" })));
    await openAiDraftGenerator(
      "gpt-5.6-terra",
      fetchImpl as unknown as typeof fetch,
    ).requestReply(API_KEY, TURNS, { onDelta: () => {} });

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({ parallel_tool_calls: false });
  });
});
