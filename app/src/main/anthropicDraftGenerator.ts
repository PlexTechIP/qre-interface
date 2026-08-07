import type {
  AgentDraftFailureCode,
  AgentDraftResult,
  GeneratedRunDraft,
} from "../shared/agentTypes.js";
import generationSchema from "../shared/contracts/runconfig-generation.schema.json" with { type: "json" };
import type { DraftGenerator } from "./agentHandler.js";

/**
 * The first — and, per the week-5 brief, only — provider adapter. Anthropic's
 * Messages API, called with `fetch` and an injectable implementation, exactly
 * as `credentialValidator.ts` does. No SDK dependency: the app's offline
 * non-negotiable is easier to defend when the networked feature adds no
 * runtime package, and the two files that talk to a provider stay symmetrical.
 *
 * Structured output uses `output_config.format`, not tool use. The lowered
 * generation schema was built for exactly this: closed objects, every property
 * required, no numeric bounds — the strict-output subset. Feeding it here is
 * what makes the drift test load-bearing rather than decorative.
 */

/** Non-streaming, so this stays well under the SDK's HTTP timeout guidance. */
const MAX_TOKENS = 16_000;
const REQUEST_TIMEOUT_MS = 120_000;
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-opus-5";
const DEFAULT_BASE_URL = "https://api.anthropic.com/v1/messages";

/**
 * The model owns field *values*. It is told nothing about run identity, and
 * the lowered schema gives it nowhere to put one even if it tried — `id`,
 * `createdAt`, `schemaVersion`, `qecCode` and `qreVersion` are absent from the
 * schema and rejected by `additionalProperties: false`.
 */
const SYSTEM_PROMPT = [
  "You translate a quantum-resource-estimation request written in prose into a draft configuration.",
  "",
  "The analyst reviews and edits every field before anything runs, so prefer a complete, plausible draft over a cautious one — but never invent a benchmark, architecture, or factory that is not in the schema's enums.",
  "When the request does not mention a field, choose the value a domain expert would default to and leave optional fields null rather than guessing a specific number.",
  "You are proposing configuration only. You never decide when a run executes, and you never author run identity or timestamps — the application owns those.",
].join("\n");

/** The exact JSON body sent to the provider. No credential appears here. */
export interface AnthropicDraftRequestBody {
  readonly model: string;
  readonly max_tokens: number;
  readonly system: string;
  readonly messages: readonly { role: "user"; content: string }[];
  readonly output_config: {
    readonly effort: "low";
    readonly format: { readonly type: "json_schema"; readonly schema: unknown };
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
  buildRequestBody(prompt: string): AnthropicDraftRequestBody {
    return {
      model: this.model,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
      // Thinking is left at its default (adaptive, on) and paced with a low
      // effort level rather than disabled: drafting one small JSON object does
      // not need deep reasoning, and disabling thinking on this model has
      // documented failure modes that low effort avoids.
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: generationSchema },
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
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify(this.buildRequestBody(prompt)),
        signal: controller.signal,
      });

      if (!response.ok) return this.describeHttpFailure(response.status);

      const payload: unknown = await response.json();
      return this.readDraft(payload);
    } catch (error) {
      return this.describeTransportFailure(error);
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Provider failures are domain outcomes, not exceptions — the estimator
   * convention this surface is required to follow. Every branch resolves.
   */
  private describeHttpFailure(status: number): AgentDraftResult {
    if (status === 401 || status === 403) {
      return fail(
        "AUTHENTICATION",
        "The provider rejected the stored key. It may have been revoked — re-enter it to continue.",
      );
    }
    if (status === 429) {
      return fail(
        "RATE_LIMITED",
        "The provider rate-limited this request. Wait a moment and try again.",
      );
    }
    return fail(
      "INVALID_RESPONSE",
      `The provider returned an unexpected status (${status}). Nothing was applied to the form.`,
    );
  }

  private describeTransportFailure(error: unknown): AgentDraftResult {
    if (error instanceof Error && error.name === "AbortError") {
      return fail(
        "TIMEOUT",
        "The provider did not respond in time. Nothing was applied to the form.",
      );
    }
    const detail = error instanceof Error ? error.message : String(error);
    return fail("NETWORK", `Could not reach the provider: ${detail}`);
  }

  /**
   * Reads the draft out of a Messages response. Two refusal-shaped outcomes
   * are distinguished deliberately: a safety decline is REFUSED (the analyst
   * should rephrase), while a truncated or unparseable body is INVALID_RESPONSE
   * (the analyst should retry). Both leave the form untouched.
   */
  private readDraft(payload: unknown): AgentDraftResult {
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
        "The proposal was cut off before it was complete. Try a shorter description.",
      );
    }

    const content = Array.isArray(message["content"]) ? message["content"] : [];
    const text = content
      .map(asRecord)
      .find((block) => block !== null && block["type"] === "text")?.["text"];
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

    // Deliberately not re-validated against the generation schema here. The
    // draft's real gate is downstream and stricter: draftToFormState refuses
    // anything it cannot map, and the canonical schema still decides what may
    // run. A second Ajv pass in the main process would only duplicate that.
    return {
      ok: true,
      draft: parsed as GeneratedRunDraft,
      provider: this.provider,
      model: this.model,
    };
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
