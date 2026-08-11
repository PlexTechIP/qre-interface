import type { AgentDraftFailureCode, AgentDraftResult } from "../shared/agentTypes.js";
import type { DraftGenerator } from "./agentHandler.js";
import { validateGeneratedDraft } from "./draftValidation.js";
import { DRAFT_SYSTEM_PROMPT, WIRE_GENERATION_SCHEMA } from "./generationSchemaWire.js";
import { readProviderErrorReason } from "./providerErrorBody.js";

const MAX_TOKENS = 16_000;
const REQUEST_TIMEOUT_MS = 120_000;
const DEFAULT_MODEL = "gpt-5.6-terra";
const DEFAULT_BASE_URL = "https://api.openai.com/v1/chat/completions";

export interface OpenAiDraftRequestBody {
  readonly model: string;
  readonly max_completion_tokens: number;
  readonly messages: readonly { role: "system" | "user"; content: string }[];
  readonly response_format: {
    readonly type: "json_schema";
    readonly json_schema: {
      readonly name: "runconfig_generation";
      readonly strict: true;
      readonly schema: unknown;
    };
  };
}

/** Raw-fetch OpenAI adapter; structured output keeps it symmetric with Anthropic. */
export class OpenAiDraftGenerator implements DraftGenerator {
  readonly provider = "OpenAI";

  constructor(
    readonly model: string = DEFAULT_MODEL,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly baseUrl: string = DEFAULT_BASE_URL,
  ) {}

  buildRequestBody(prompt: string): OpenAiDraftRequestBody {
    return {
      model: this.model,
      max_completion_tokens: MAX_TOKENS,
      messages: [
        { role: "system", content: DRAFT_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "runconfig_generation",
          strict: true,
          schema: WIRE_GENERATION_SCHEMA,
        },
      },
    };
  }

  async requestDraft(
    apiKey: string,
    prompt: string,
    cancel?: AbortSignal,
  ): Promise<AgentDraftResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await this.fetchImpl(this.baseUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(this.buildRequestBody(prompt)),
        // Combined, not merged — see the Anthropic twin.
        signal: cancel === undefined
          ? controller.signal
          : AbortSignal.any([controller.signal, cancel]),
      });
      if (!response.ok) return await this.describeHttpFailure(response);
      return this.readDraft(await response.json());
    } catch (error) {
      return this.describeTransportFailure(error, cancel);
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Carries the provider's own reason through — see the Anthropic twin. */
  private async describeHttpFailure(response: Response): Promise<AgentDraftResult> {
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
  private describeTransportFailure(error: unknown, cancel?: AbortSignal): AgentDraftResult {
    if (error instanceof Error && error.name === "AbortError") {
      return cancel?.aborted === true
        ? fail("CANCELLED", "Request cancelled. Nothing was applied to the form.")
        : fail("TIMEOUT", "The provider did not respond in time. Nothing was applied to the form.");
    }
    const detail = error instanceof Error ? error.message : String(error);
    return fail("NETWORK", `Could not reach the provider: ${detail}`);
  }

  private readDraft(payload: unknown): AgentDraftResult {
    const response = asRecord(payload);
    const choice = Array.isArray(response?.["choices"])
      ? asRecord(response["choices"][0])
      : null;
    const message = asRecord(choice?.["message"]);
    if (typeof message?.["refusal"] === "string" && message["refusal"].length > 0) {
      return fail("REFUSED", "The model declined to answer this request. Try describing the run differently.");
    }
    if (choice?.["finish_reason"] === "length") {
      return fail("INVALID_RESPONSE", "The proposal was cut off before it was complete. Try a shorter description.");
    }
    const text = message?.["content"];
    if (typeof text !== "string") {
      return fail("INVALID_RESPONSE", "The provider returned no proposal to read.");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return fail("INVALID_RESPONSE", "The provider's proposal was not valid JSON.");
    }
    if (asRecord(parsed) === null) {
      return fail("INVALID_RESPONSE", "The provider's proposal was not a configuration object.");
    }
    // Same contract check as the Anthropic twin — see `draftValidation.ts`.
    const validated = validateGeneratedDraft(parsed);
    if (!validated.ok) {
      return fail(
        "INVALID_RESPONSE",
        `The provider's proposal did not match the generation contract (${validated.reason}). Nothing was applied to the form.`,
      );
    }
    return { ok: true, draft: validated.draft, provider: this.provider, model: this.model };
  }
}

function fail(code: AgentDraftFailureCode, message: string): AgentDraftResult {
  return { ok: false, code, message };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
