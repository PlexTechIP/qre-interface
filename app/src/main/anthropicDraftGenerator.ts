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
  parseBufferedArguments,
  readToolTurn,
  replayToolId,
  TOOL_RESULT_TEXT,
} from "./toolTurn.js";
import { readProviderErrorReason } from "./providerErrorBody.js";

/**
 * The first — and, per the week-5 brief, only — provider adapter. Anthropic's
 * Messages API, called with `fetch` and an injectable implementation, exactly
 * as `credentialValidator.ts` does. No SDK dependency: the app's offline
 * non-negotiable is easier to defend when the networked feature adds no
 * runtime package, and the two files that talk to a provider stay symmetrical.
 *
 * Proposals are tool calls, not structured output. The lowered generation
 * schema suits either — closed objects, every property required, no numeric
 * bounds is equally the strict-tool-parameter subset — so feeding it as
 * `input_schema` keeps the drift test load-bearing rather than decorative.
 *
 * It moved because the envelope it used to ride in forced three things at once:
 * nothing could stream, the prose could not use markdown, and the model wrote
 * like something filling in a form. See `PROPOSE_RUN_CONFIG_TOOL`.
 */

/** Generous, because a streamed reply is watched rather than waited out. */
const MAX_TOKENS = 16_000;
const REQUEST_TIMEOUT_MS = 120_000;
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-sonnet-5";
const DEFAULT_BASE_URL = "https://api.anthropic.com/v1/messages";

/**
 * Models that reject `output_config.effort` outright.
 *
 * Effort is a property of the 5-generation reasoning models. Haiku 4.5 predates
 * it and answers the parameter with a 400 — so shipping it unconditionally made
 * the cheapest entry in the model menu the one that could never succeed, and the
 * failure arrived as an opaque provider rejection rather than as anything
 * naming the real cause.
 *
 * Omitting it is the whole fix, not a degradation: Haiku 4.5 without a thinking
 * block is exactly the fast, cheap path someone picking Haiku is asking for, and
 * structured output — the part that actually matters here — is supported on it.
 */
const EFFORT_UNSUPPORTED_MODELS: ReadonlySet<string> = new Set(["claude-haiku-4-5"]);

/** A tool call, or its answer, as the Messages API represents one. */
type AnthropicContentBlock =
  | { readonly type: "text"; readonly text: string }
  | {
      readonly type: "tool_use";
      readonly id: string;
      readonly name: string;
      readonly input: unknown;
    }
  | {
      readonly type: "tool_result";
      readonly tool_use_id: string;
      readonly content: string;
    };

/** One message on the wire: prose, or the block list a tool exchange needs. */
interface AnthropicMessage {
  readonly role: "user" | "assistant";
  readonly content: string | readonly AnthropicContentBlock[];
}

/** The exact JSON body sent to the provider. No credential appears here. */
export interface AnthropicDraftRequestBody {
  readonly model: string;
  readonly max_tokens: number;
  readonly system: string;
  /** The whole conversation, oldest first. Main holds none of it between calls. */
  readonly messages: readonly AnthropicMessage[];
  readonly tools: readonly {
    readonly name: string;
    readonly description: string;
    readonly input_schema: unknown;
  }[];
  readonly output_config: {
    /** Absent on models that reject it — see `EFFORT_UNSUPPORTED_MODELS`. */
    readonly effort?: "low";
  };
}

export class AnthropicDraftGenerator implements DraftGenerator {
  readonly provider = "Anthropic";

  constructor(
    readonly model: string = DEFAULT_MODEL,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly baseUrl: string = DEFAULT_BASE_URL,
  ) {}

  /**
   * The literal request body, built without a credential so the renderer can
   * show the analyst what leaves the machine *before* it leaves. Constraint 8
   * of the brief asks for exactly what will be sent, not a summary of it —
   * this is the function that keeps that promise honest.
   */
  buildRequestBody(
    messages: readonly ChatTurn[],
    formContext: readonly FormContextEntry[] = [],
  ): AnthropicDraftRequestBody {
    return {
      model: this.model,
      max_tokens: MAX_TOKENS,
      system: CHAT_SYSTEM_PROMPT + formContextPrompt(formContext),
      messages: lowerTranscript(messages),
      tools: [
        {
          name: PROPOSE_RUN_CONFIG_TOOL.name,
          description: PROPOSE_RUN_CONFIG_TOOL.description,
          input_schema: PROPOSE_RUN_CONFIG_TOOL.schema,
        },
      ],
      // On the 5-generation models thinking is left at its default (adaptive,
      // on) and paced with a low effort level rather than disabled: drafting one
      // small JSON object does not need deep reasoning, and disabling thinking
      // on those models has documented failure modes that low effort avoids.
      // Where `effort` is not a parameter at all the key is omitted entirely,
      // which on those models means no thinking — the right trade for this task.
      //
      // `format` is gone: the draft is a tool call now, and asking for
      // structured output as well would put the prose back inside a JSON string.
      output_config: {
        ...(EFFORT_UNSUPPORTED_MODELS.has(this.model) ? {} : { effort: "low" as const }),
      },
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
      const response = await this.fetchImpl(this.baseUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        // `stream` is added only when somebody is listening. An adapter asked
        // for a stream with nowhere to send the pieces would buy the latency of
        // SSE parsing and none of its benefit.
        body: JSON.stringify(onDelta === undefined ? body : { ...body, stream: true }),
        // Two independent reasons to give up, combined rather than merged, so
        // the catch below can still tell which one fired. Aborting the timeout
        // controller from the cancel path would have collapsed them.
        signal: cancel === undefined
          ? controller.signal
          : AbortSignal.any([controller.signal, cancel]),
      });

      if (!response.ok) return await this.describeHttpFailure(response);

      if (onDelta !== undefined && response.body !== null) {
        return await this.readStream(response.body, onDelta, cancel);
      }
      const payload: unknown = await response.json();
      return this.readReply(payload);
    } catch (error) {
      return this.describeTransportFailure(error, cancel);
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Assemble one turn out of a Messages stream.
   *
   * The events are deltas against indexed content blocks, so the reader keeps
   * two accumulators and joins them at the end — the same two halves
   * `readReply` pulls out of a whole response, arriving a piece at a time.
   *
   * The tool call is buffered rather than forwarded: its `input_json_delta`
   * fragments are pieces of a JSON string that means nothing until it closes,
   * and half a configuration is not a configuration. Only the prose streams,
   * which is exactly what the analyst is waiting to read.
   */
  private async readStream(
    body: ReadableStream<Uint8Array>,
    onDelta: (fragment: string) => void,
    cancel?: AbortSignal,
  ): Promise<AgentChatResult> {
    let prose = "";
    let toolJson = "";
    /*
     * Which content block the proposal is being written into.
     *
     * Scoped to one block rather than tracked as a stream-wide "we saw our
     * tool" flag. A turn may contain several `tool_use` blocks, and a flag let
     * the second block's `input_json_delta` fragments append to the first
     * block's buffer — two JSON objects end to end, which parse as nothing and
     * refused a turn whose first proposal was perfectly good. First call wins,
     * which is also what the non-streaming path does.
     */
    let toolBlockIndex: number | null = null;
    let stopReason: unknown = null;

    for await (const event of readEventStream(body, cancel)) {
      const record = asRecord(event);
      if (record === null) continue;

      const type = record["type"];
      if (type === "content_block_start") {
        const block = asRecord(record["content_block"]);
        if (
          toolBlockIndex === null &&
          block?.["type"] === "tool_use" &&
          block["name"] === PROPOSE_RUN_CONFIG_TOOL.name &&
          typeof record["index"] === "number"
        ) {
          toolBlockIndex = record["index"];
        }
        continue;
      }
      if (type === "content_block_delta") {
        const delta = asRecord(record["delta"]);
        if (delta?.["type"] === "text_delta" && typeof delta["text"] === "string") {
          // Emitted as it arrives, then kept: the renderer paints the fragment
          // and main still needs the whole thing to store the turn.
          prose += delta["text"];
          onDelta(delta["text"]);
        } else if (
          delta?.["type"] === "input_json_delta" &&
          typeof delta["partial_json"] === "string" &&
          record["index"] === toolBlockIndex
        ) {
          toolJson += delta["partial_json"];
        }
        continue;
      }
      if (type === "message_delta") {
        stopReason = asRecord(record["delta"])?.["stop_reason"] ?? stopReason;
      }
    }

    // A cancelled stream is not a turn. Returning what arrived so far would put
    // half a sentence in the transcript as though the model had finished it.
    if (cancel?.aborted === true) {
      return fail("CANCELLED", "Request cancelled. Nothing was added to the conversation.");
    }
    if (stopReason === "refusal") {
      return fail(
        "REFUSED",
        "The model declined to answer this request. Try describing the run differently.",
      );
    }
    if (stopReason === "max_tokens") {
      return fail(
        "INVALID_RESPONSE",
        "The reply was cut off before it was complete. Try a shorter description, or start a new conversation if this one has grown long.",
      );
    }

    return readToolTurn(prose, parseBufferedArguments(toolJson), this.provider, this.model);
  }

  /**
   * Provider failures are domain outcomes, not exceptions — the estimator
   * convention this surface is required to follow. Every branch resolves.
   *
   * The provider's own reason is carried through. A 400 in particular is the
   * API telling us which field it disliked (an unsupported schema keyword, a
   * bad parameter); reporting only the status code discards the single thing
   * that makes it fixable.
   */
  private async describeHttpFailure(response: Response): Promise<AgentChatResult> {
    const reason = await readProviderErrorReason(response);

    if (response.status === 401 || response.status === 403) {
      return fail(
        "AUTHENTICATION",
        "The provider rejected the stored key. It may have been revoked — re-enter it to continue.",
      );
    }
    if (response.status === 429) {
      return fail(
        "RATE_LIMITED",
        "The provider rate-limited this request. Wait a moment and try again.",
      );
    }
    return fail(
      "INVALID_RESPONSE",
      reason === null
        ? `The provider returned an unexpected status (${response.status}) and no explanation. Nothing was applied to the form.`
        : `The provider rejected the request (${response.status}): ${reason}. Nothing was applied to the form.`,
    );
  }

  /**
   * Both giving-up paths surface as the same `AbortError`, so the signal itself
   * is what distinguishes them — telling someone who just pressed Cancel that
   * the provider was slow would be a claim about the provider, made about their
   * own action.
   */
  private describeTransportFailure(
    error: unknown,
    cancel?: AbortSignal,
  ): AgentChatResult {
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

  /**
   * Reads one assistant turn out of a Messages response. Two refusal-shaped
   * outcomes are distinguished deliberately: a safety decline is REFUSED (the
   * analyst should rephrase), while a truncated or unparseable body is
   * INVALID_RESPONSE (the analyst should retry). Both leave the transcript
   * untouched.
   */
  private readReply(payload: unknown): AgentChatResult {
    const message = asRecord(payload);
    if (message === null) {
      return fail("INVALID_RESPONSE", "The provider returned a response this app could not read.");
    }

    if (message["stop_reason"] === "refusal") {
      return fail(
        "REFUSED",
        "The model declined to answer this request. Try describing the run differently.",
      );
    }
    if (message["stop_reason"] === "max_tokens") {
      return fail(
        "INVALID_RESPONSE",
        "The reply was cut off before it was complete. Try a shorter description, or start a new conversation if this one has grown long.",
      );
    }

    const content = Array.isArray(message["content"]) ? message["content"] : [];
    return readToolTurn(
      collectProse(content),
      findProposal(content),
      this.provider,
      this.model,
    );
  }
}

/**
 * Every text block, in order, joined into one reply.
 *
 * Models routinely emit prose either side of a tool call — the reason, then the
 * suggestion. Reading only the first block dropped whatever was said after the
 * proposal, which is usually the half explaining it.
 */
export function collectProse(content: readonly unknown[]): string {
  return content
    .map(asRecord)
    .filter((block): block is Record<string, unknown> => block?.["type"] === "text")
    .map((block) => (typeof block["text"] === "string" ? block["text"] : ""))
    .filter((text) => text.length > 0)
    .join("\n\n");
}

/** The arguments of a call to OUR tool, or null. */
function findProposal(content: readonly unknown[]): unknown {
  const call = content
    .map(asRecord)
    .find(
      (block) =>
        block?.["type"] === "tool_use" && block["name"] === PROPOSE_RUN_CONFIG_TOOL.name,
    );
  return call?.["input"] ?? null;
}

/**
 * Lower the stored transcript into the Messages API's own shape.
 *
 * A stored assistant turn is `{text, draft}` — this app's format, deliberately
 * provider-neutral. Anthropic wants that same turn as a `tool_use` block, and
 * requires two things this function exists to satisfy: every call is answered
 * by a `tool_result` in the NEXT message, and roles alternate. Emitting each
 * result as its own message would satisfy the first and break the second, so
 * the answer is folded into the user turn that already follows.
 */
export function lowerTranscript(turns: readonly ChatTurn[]): AnthropicMessage[] {
  const messages: AnthropicMessage[] = [];
  /** The call awaiting an answer, so the next user turn can carry one. */
  let unanswered: string | null = null;

  turns.forEach((turn, index) => {
    if (turn.role === "user") {
      messages.push(
        unanswered === null
          ? { role: "user", content: turn.content }
          : {
              role: "user",
              content: [
                { type: "tool_result", tool_use_id: unanswered, content: TOOL_RESULT_TEXT },
                { type: "text", text: turn.content },
              ],
            },
      );
      unanswered = null;
      return;
    }

    /*
     * A pending call is answered before anything else is said.
     *
     * Two assistant turns in a row used to overwrite `unanswered` without
     * emitting the first one's `tool_result`, leaving a `tool_use` block the
     * provider never saw answered — which rejects the whole conversation with a
     * 400 that names nothing the analyst did. Answering here also keeps roles
     * alternating, since the answer is a user message either way.
     */
    if (unanswered !== null) {
      messages.push({
        role: "user",
        content: [{ type: "tool_result", tool_use_id: unanswered, content: TOOL_RESULT_TEXT }],
      });
      unanswered = null;
    }

    if (turn.draft === undefined || turn.draft === null) {
      messages.push({ role: "assistant", content: turn.content });
      return;
    }

    const id = replayToolId(index);
    messages.push({
      role: "assistant",
      content: [
        { type: "text", text: turn.content },
        { type: "tool_use", id, name: PROPOSE_RUN_CONFIG_TOOL.name, input: turn.draft },
      ],
    });
    unanswered = id;
  });

  // A transcript ending on a proposal still has to answer it. The renderer only
  // sends transcripts ending on the analyst's new turn, so this is the guard for
  // a caller that does not — not a shape the app produces today.
  if (unanswered !== null) {
    messages.push({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: unanswered, content: TOOL_RESULT_TEXT }],
    });
  }
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
