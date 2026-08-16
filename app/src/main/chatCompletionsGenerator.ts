import type {
  AgentChatResult,
  AgentFailureCode,
  ChatTurn,
} from "../shared/agentTypes.js";
import type { DraftGenerator } from "./agentHandler.js";
import { validateChatReply } from "./draftValidation.js";
import { CHAT_SYSTEM_PROMPT, WIRE_CHAT_SCHEMA } from "./generationSchemaWire.js";
import { readProviderErrorReason } from "./providerErrorBody.js";

const MAX_TOKENS = 16_000;
const REQUEST_TIMEOUT_MS = 120_000;

export interface ChatCompletionsRequestBody {
  readonly model: string;
  readonly max_completion_tokens: number;
  /** The system turn, then the whole conversation, oldest first. */
  readonly messages: readonly ({ role: "system"; content: string } | ChatTurn)[];
  readonly response_format: {
    readonly type: "json_schema";
    readonly json_schema: {
      readonly name: "runconfig_chat";
      readonly strict: true;
      readonly schema: unknown;
    };
  };
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
 * `Bearer` auth, same `response_format: json_schema`, same choices/finish_reason
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

  buildRequestBody(messages: readonly ChatTurn[]): ChatCompletionsRequestBody {
    return {
      ...this.config.bodyExtras,
      model: this.model,
      max_completion_tokens: MAX_TOKENS,
      messages: [{ role: "system", content: CHAT_SYSTEM_PROMPT }, ...messages],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "runconfig_chat",
          strict: true,
          schema: WIRE_CHAT_SCHEMA,
        },
      },
    };
  }

  async requestReply(
    apiKey: string,
    messages: readonly ChatTurn[],
    cancel?: AbortSignal,
  ): Promise<AgentChatResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await this.config.fetchImpl(this.config.baseUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(this.buildRequestBody(messages)),
        // Combined, not merged — see the Anthropic twin.
        signal: cancel === undefined
          ? controller.signal
          : AbortSignal.any([controller.signal, cancel]),
      });
      if (!response.ok) return await this.describeHttpFailure(response);
      return this.readReply(await response.json());
    } catch (error) {
      return this.describeTransportFailure(error, cancel);
    } finally {
      clearTimeout(timeout);
    }
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
    if (choice?.["finish_reason"] === "length") {
      return fail(
        "INVALID_RESPONSE",
        "The reply was cut off before it was complete. Try a shorter description, or start a new conversation if this one has grown long.",
      );
    }
    const text = message?.["content"];
    if (typeof text !== "string") {
      return fail("INVALID_RESPONSE", "The provider returned no reply to read.");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return fail("INVALID_RESPONSE", "The provider's reply was not valid JSON.");
    }
    if (asRecord(parsed) === null) {
      return fail("INVALID_RESPONSE", "The provider's reply was not a chat envelope.");
    }
    // Same contract check as the Anthropic twin — see `draftValidation.ts`.
    const validated = validateChatReply(parsed);
    if (!validated.ok) {
      return fail(
        "INVALID_RESPONSE",
        `The provider's reply did not match the generation contract (${validated.reason}). Nothing was added to the conversation.`,
      );
    }
    return {
      ok: true,
      reply: validated.reply,
      draft: validated.draft,
      provider: this.provider,
      model: this.model,
    };
  }
}

function fail(code: AgentFailureCode, message: string): AgentChatResult {
  return { ok: false, code, message };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
