import type {
  AgentDraftFailureCode,
  AgentDraftResult,
  GeneratedRunDraft,
} from "../shared/agentTypes.js";
import generationSchema from "../shared/contracts/runconfig-generation.schema.json" with { type: "json" };
import type { DraftGenerator } from "./agentHandler.js";

const MAX_TOKENS = 16_000;
const REQUEST_TIMEOUT_MS = 120_000;
const DEFAULT_MODEL = "gpt-5.6-terra";
const DEFAULT_BASE_URL = "https://api.openai.com/v1/chat/completions";

const SYSTEM_PROMPT = [
  "You translate a quantum-resource-estimation request written in prose into a draft configuration.",
  "",
  "The analyst reviews and edits every field before anything runs, so prefer a complete, plausible draft over a cautious one — but never invent a benchmark, architecture, or factory that is not in the schema's enums.",
  "When the request does not mention a field, choose the value a domain expert would default to and leave optional fields null rather than guessing a specific number.",
  "You are proposing configuration only. You never decide when a run executes, and you never author run identity or timestamps — the application owns those.",
].join("\n");

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
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "runconfig_generation",
          strict: true,
          schema: generationSchema,
        },
      },
    };
  }

  async requestDraft(apiKey: string, prompt: string): Promise<AgentDraftResult> {
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
        signal: controller.signal,
      });
      if (!response.ok) return this.describeHttpFailure(response.status);
      return this.readDraft(await response.json());
    } catch (error) {
      return this.describeTransportFailure(error);
    } finally {
      clearTimeout(timeout);
    }
  }

  private describeHttpFailure(status: number): AgentDraftResult {
    if (status === 401 || status === 403) {
      return fail("AUTHENTICATION", "The provider rejected the stored key. It may have been revoked — re-enter it to continue.");
    }
    if (status === 429) {
      return fail("RATE_LIMITED", "The provider rate-limited this request. Wait a moment and try again.");
    }
    return fail("INVALID_RESPONSE", `The provider returned an unexpected status (${status}). Nothing was applied to the form.`);
  }

  private describeTransportFailure(error: unknown): AgentDraftResult {
    if (error instanceof Error && error.name === "AbortError") {
      return fail("TIMEOUT", "The provider did not respond in time. Nothing was applied to the form.");
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
    return { ok: true, draft: parsed as GeneratedRunDraft, provider: this.provider, model: this.model };
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
