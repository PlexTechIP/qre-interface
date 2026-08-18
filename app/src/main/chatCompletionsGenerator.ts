import type {
  AgentChatResult,
  AgentFailureCode,
  ChatTurn,
  FormContextEntry,
} from "../shared/agentTypes.js";
import type { DraftGenerator, ReplyOptions } from "./agentHandler.js";
import {
  CHAT_SYSTEM_PROMPT,
  formContextPrompt,
  PROPOSE_RUN_CONFIG_TOOL,
} from "./generationSchemaWire.js";
import { readEventStream } from "./serverSentEvents.js";
import {
  MALFORMED_ARGUMENTS,
  parseBufferedArguments,
  readToolTurn,
  replayToolId,
  TOOL_RESULT_TEXT,
} from "./toolTurn.js";
import { readProviderErrorReason } from "./providerErrorBody.js";

const MAX_TOKENS = 16_000;
const REQUEST_TIMEOUT_MS = 120_000;

/** One tool call as this wire format represents it, going out or coming back. */
interface ChatCompletionsToolCall {
  readonly id: string;
  readonly type: "function";
  readonly function: { readonly name: string; readonly arguments: string };
}

/** One message on the wire. `tool` answers a call; the rest are conversation. */
type ChatCompletionsMessage =
  | { readonly role: "system" | "user"; readonly content: string }
  | {
      readonly role: "assistant";
      readonly content: string;
      readonly tool_calls?: readonly ChatCompletionsToolCall[];
    }
  | { readonly role: "tool"; readonly tool_call_id: string; readonly content: string };

export interface ChatCompletionsRequestBody {
  readonly model: string;
  readonly max_completion_tokens: number;
  /** The system turn, then the whole conversation, oldest first. */
  readonly messages: readonly ChatCompletionsMessage[];
  readonly tools: readonly {
    readonly type: "function";
    readonly function: {
      readonly name: string;
      readonly description: string;
      /** Strict, so the arguments arrive schema-valid rather than plausible. */
      readonly strict: true;
      readonly parameters: unknown;
    };
  }[];
  readonly tool_choice: "auto";
  /**
   * One proposal per turn.
   *
   * The default is `true`, and a model that emits two calls to the same tool
   * streams their argument fragments interleaved by index — which is a shape
   * no reader can reassemble into one configuration, and which the app has no
   * use for anyway: a turn carries at most one draft. Narrowing the request is
   * better than reassembling something we would then throw half of away.
   */
  readonly parallel_tool_calls: false;
}

export interface ChatCompletionsConfig {
  /** How the provider names itself in a completed turn. Shown to the analyst. */
  readonly provider: string;
  readonly model: string;
  readonly baseUrl: string;
  readonly fetchImpl: typeof fetch;
  /**
   * Extra top-level request fields this provider needs.
   *
   * The one real customer is OpenRouter's `provider: { require_parameters: true }`,
   * which is a routing instruction rather than a completion parameter. Merged
   * into the body rather than special-cased in here, so the generator stays
   * ignorant of which aggregator it is talking to.
   */
  readonly bodyExtras?: Readonly<Record<string, unknown>>;
}

/**
 * The OpenAI chat-completions wire format, parameterised by who serves it.
 *
 * OpenAI and OpenRouter speak the same protocol — same endpoint shape, same
 * `Bearer` auth, same strict function tools, same choices/finish_reason
 * response — and differ only in base URL and a routing option. Two copies of
 * this would have meant two copies of the refusal check, the truncation check,
 * the JSON parse, the contract validation, and five status-to-message mappings,
 * with nothing keeping them honest; the OpenRouter tests assert against the
 * OpenAI body precisely to catch that drift.
 *
 * Anthropic is deliberately NOT folded in here. It speaks its own Messages API
 * with a different auth header, a different request shape and a different
 * response shape, so sharing would mean a class of conditionals rather than a
 * class of parameters — see `anthropicDraftGenerator.ts`.
 */
export class ChatCompletionsDraftGenerator implements DraftGenerator {
  readonly provider: string;
  readonly model: string;

  constructor(private readonly config: ChatCompletionsConfig) {
    this.provider = config.provider;
    this.model = config.model;
  }

  buildRequestBody(
    messages: readonly ChatTurn[],
    formContext: readonly FormContextEntry[] = [],
  ): ChatCompletionsRequestBody {
    return {
      ...this.config.bodyExtras,
      model: this.model,
      max_completion_tokens: MAX_TOKENS,
      messages: [
        { role: "system", content: CHAT_SYSTEM_PROMPT + formContextPrompt(formContext) },
        ...lowerTranscript(messages),
      ],
      tools: [
        {
          type: "function",
          function: {
            name: PROPOSE_RUN_CONFIG_TOOL.name,
            description: PROPOSE_RUN_CONFIG_TOOL.description,
            strict: true,
            parameters: PROPOSE_RUN_CONFIG_TOOL.schema,
          },
        },
      ],
      // The model decides whether this turn carries a proposal. Forcing the
      // call would remove the one thing the tool conversion bought: the ability
      // to answer a question without inventing a configuration to go with it.
      tool_choice: "auto",
      parallel_tool_calls: false,
    };
  }

  async requestReply(
    apiKey: string,
    messages: readonly ChatTurn[],
    options: ReplyOptions = {},
  ): Promise<AgentChatResult> {
    const { cancel, onDelta } = options;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const body = this.buildRequestBody(messages, options.formContext ?? []);
      const response = await this.config.fetchImpl(this.config.baseUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        // Streaming only when somebody is listening — see the Anthropic twin.
        body: JSON.stringify(onDelta === undefined ? body : { ...body, stream: true }),
        // Combined, not merged — see the Anthropic twin.
        signal: cancel === undefined
          ? controller.signal
          : AbortSignal.any([controller.signal, cancel]),
      });
      if (!response.ok) return await this.describeHttpFailure(response);
      if (onDelta !== undefined && response.body !== null) {
        return await this.readStream(response.body, onDelta, cancel);
      }
      return this.readReply(await response.json());
    } catch (error) {
      return this.describeTransportFailure(error, cancel);
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Assemble one turn out of a chat-completions stream.
   *
   * Each event carries a `delta` against the message being built: prose in
   * `content`, and tool arguments as fragments of a JSON string under
   * `tool_calls`. Only the prose is forwarded — half a configuration is not a
   * configuration, so the arguments are buffered and parsed once the stream
   * closes.
   */
  private async readStream(
    body: ReadableStream<Uint8Array>,
    onDelta: (fragment: string) => void,
    cancel?: AbortSignal,
  ): Promise<AgentChatResult> {
    let prose = "";
    let toolJson = "";
    /*
     * Which tool call the proposal is being written into.
     *
     * `parallel_tool_calls: false` should make a second call impossible, but a
     * reader that appended every fragment regardless of index would silently
     * corrupt the buffer the moment a provider ignored that flag — and
     * OpenRouter fans requests out to hosts that do not all honour it. First
     * call wins, which is also what the non-streaming path does.
     */
    let toolCallIndex: number | null = null;
    let finishReason: unknown = null;
    let refusal = "";

    for await (const event of readEventStream(body, cancel)) {
      const choices = asRecord(event)?.["choices"];
      const choice = Array.isArray(choices) ? asRecord(choices[0]) : null;
      if (choice === null) continue;

      finishReason = choice["finish_reason"] ?? finishReason;
      const delta = asRecord(choice["delta"]);
      if (delta === null) continue;

      if (typeof delta["content"] === "string" && delta["content"].length > 0) {
        prose += delta["content"];
        onDelta(delta["content"]);
      }
      if (typeof delta["refusal"] === "string") refusal += delta["refusal"];

      for (const raw of Array.isArray(delta["tool_calls"]) ? delta["tool_calls"] : []) {
        const call = asRecord(raw);
        const fn = asRecord(call?.["function"]);
        // `index` identifies which call a fragment belongs to. It defaults to 0
        // for providers that omit it on a single call.
        const index = typeof call?.["index"] === "number" ? call["index"] : 0;
        // The name arrives once, on the first fragment; every later fragment
        // carries arguments only, so which call is ours has to be remembered.
        if (toolCallIndex === null && fn?.["name"] === PROPOSE_RUN_CONFIG_TOOL.name) {
          toolCallIndex = index;
        }
        if (index !== toolCallIndex) continue;
        if (typeof fn?.["arguments"] === "string") toolJson += fn["arguments"];
      }
    }

    // A cancelled stream is not a turn — see the Anthropic twin.
    if (cancel?.aborted === true) {
      return fail("CANCELLED", "Request cancelled. Nothing was added to the conversation.");
    }
    if (refusal.length > 0) {
      return fail(
        "REFUSED",
        "The model declined to answer this request. Try describing the run differently.",
      );
    }
    // A filtered completion carries no `refusal` delta and a finish reason the
    // length check does not match, so without this it read as an ordinary turn
    // — storing a truncated fragment as though the model had meant to stop.
    if (finishReason === "content_filter") {
      return fail(
        "REFUSED",
        "The provider filtered this response. Try describing the run differently.",
      );
    }
    if (finishReason === "length") {
      return fail(
        "INVALID_RESPONSE",
        "The reply was cut off before it was complete. Try a shorter description, or start a new conversation if this one has grown long.",
      );
    }

    return readToolTurn(prose, parseBufferedArguments(toolJson), this.provider, this.model);
  }

  /** Carries the provider's own reason through — see the Anthropic twin. */
  private async describeHttpFailure(response: Response): Promise<AgentChatResult> {
    const reason = await readProviderErrorReason(response);

    if (response.status === 401 || response.status === 403) {
      return fail("AUTHENTICATION", "The provider rejected the stored key. It may have been revoked — re-enter it to continue.");
    }
    if (response.status === 429) {
      return fail("RATE_LIMITED", "The provider rate-limited this request. Wait a moment and try again.");
    }
    return fail(
      "INVALID_RESPONSE",
      reason === null
        ? `The provider returned an unexpected status (${response.status}) and no explanation. Nothing was applied to the form.`
        : `The provider rejected the request (${response.status}): ${reason}. Nothing was applied to the form.`,
    );
  }

  /** Cancel and timeout share an AbortError; the signal is what tells them apart. */
  private describeTransportFailure(error: unknown, cancel?: AbortSignal): AgentChatResult {
    if (error instanceof Error && error.name === "AbortError") {
      return cancel?.aborted === true
        ? fail("CANCELLED", "Request cancelled. Nothing was added to the conversation.")
        : fail(
            "TIMEOUT",
            "The provider did not respond in time. Nothing was added to the conversation.",
          );
    }
    const detail = error instanceof Error ? error.message : String(error);
    return fail("NETWORK", `Could not reach the provider: ${detail}`);
  }

  private readReply(payload: unknown): AgentChatResult {
    const response = asRecord(payload);
    const choice = Array.isArray(response?.["choices"])
      ? asRecord(response["choices"][0])
      : null;
    const message = asRecord(choice?.["message"]);
    if (typeof message?.["refusal"] === "string" && message["refusal"].length > 0) {
      return fail("REFUSED", "The model declined to answer this request. Try describing the run differently.");
    }
    if (choice?.["finish_reason"] === "content_filter") {
      return fail(
        "REFUSED",
        "The provider filtered this response. Try describing the run differently.",
      );
    }
    if (choice?.["finish_reason"] === "length") {
      return fail(
        "INVALID_RESPONSE",
        "The reply was cut off before it was complete. Try a shorter description, or start a new conversation if this one has grown long.",
      );
    }
    const text = message?.["content"];
    const proposal = readProposal(message?.["tool_calls"]);
    // `MALFORMED_ARGUMENTS` and the contract check are both handled by
    // `readToolTurn`, so the streamed and whole-response paths explain the same
    // condition the same way.
    return readToolTurn(
      typeof text === "string" ? text : "",
      proposal,
      this.provider,
      this.model,
    );
  }
}

/**
 * The arguments of a call to OUR tool, parsed.
 *
 * This wire format sends arguments as a JSON *string* rather than as an object,
 * which is the one real difference from the Anthropic path — and the one place
 * a strict schema still cannot save us, because a truncated response yields a
 * string that simply does not close.
 */
function readProposal(value: unknown): unknown {
  if (!Array.isArray(value)) return null;
  const call = value
    .map(asRecord)
    .find(
      (entry) =>
        asRecord(entry?.["function"])?.["name"] === PROPOSE_RUN_CONFIG_TOOL.name,
    );
  const args = asRecord(call?.["function"])?.["arguments"];
  if (typeof args !== "string") return null;
  try {
    return JSON.parse(args);
  } catch {
    return MALFORMED_ARGUMENTS;
  }
}

/**
 * Lower the stored transcript into this wire format's own shape.
 *
 * Simpler than the Anthropic twin in one respect that matters: there is no
 * alternating-role rule here, so a `role: "tool"` answer is its own message and
 * nothing has to be folded into the turn that follows.
 */
function lowerTranscript(turns: readonly ChatTurn[]): ChatCompletionsMessage[] {
  const messages: ChatCompletionsMessage[] = [];

  turns.forEach((turn, index) => {
    if (turn.role === "user") {
      messages.push({ role: "user", content: turn.content });
      return;
    }
    if (turn.draft === undefined || turn.draft === null) {
      messages.push({ role: "assistant", content: turn.content });
      return;
    }
    const id = replayToolId(index);
    messages.push({
      role: "assistant",
      content: turn.content,
      tool_calls: [
        {
          id,
          type: "function",
          function: {
            name: PROPOSE_RUN_CONFIG_TOOL.name,
            arguments: JSON.stringify(turn.draft),
          },
        },
      ],
    });
    // Every call needs an answer or the next request is rejected outright.
    messages.push({ role: "tool", tool_call_id: id, content: TOOL_RESULT_TEXT });
  });

  return messages;
}

function fail(code: AgentFailureCode, message: string): AgentChatResult {
  return { ok: false, code, message };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
