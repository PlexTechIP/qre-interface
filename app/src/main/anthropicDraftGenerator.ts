import type { AgentDraftFailureCode, AgentDraftResult } from "../shared/agentTypes.js";
import type { DraftGenerator } from "./agentHandler.js";
import { validateGeneratedDraft } from "./draftValidation.js";
import { DRAFT_SYSTEM_PROMPT, WIRE_GENERATION_SCHEMA } from "./generationSchemaWire.js";
import { readProviderErrorReason } from "./providerErrorBody.js";

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

/** The exact JSON body sent to the provider. No credential appears here. */
export interface AnthropicDraftRequestBody {
  readonly model: string;
  readonly max_tokens: number;
  readonly system: string;
  readonly messages: readonly { role: "user"; content: string }[];
  readonly output_config: {
    /** Absent on models that reject it — see `EFFORT_UNSUPPORTED_MODELS`. */
    readonly effort?: "low";
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
      system: DRAFT_SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
      // On the 5-generation models thinking is left at its default (adaptive,
      // on) and paced with a low effort level rather than disabled: drafting one
      // small JSON object does not need deep reasoning, and disabling thinking
      // on those models has documented failure modes that low effort avoids.
      // Where `effort` is not a parameter at all the key is omitted entirely,
      // which on those models means no thinking — the right trade for this task.
      output_config: {
        ...(EFFORT_UNSUPPORTED_MODELS.has(this.model) ? {} : { effort: "low" as const }),
        format: { type: "json_schema", schema: WIRE_GENERATION_SCHEMA },
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
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify(this.buildRequestBody(prompt)),
        // Two independent reasons to give up, combined rather than merged, so
        // the catch below can still tell which one fired. Aborting the timeout
        // controller from the cancel path would have collapsed them.
        signal: cancel === undefined
          ? controller.signal
          : AbortSignal.any([controller.signal, cancel]),
      });

      if (!response.ok) return await this.describeHttpFailure(response);

      const payload: unknown = await response.json();
      return this.readDraft(payload);
    } catch (error) {
      return this.describeTransportFailure(error, cancel);
    } finally {
      clearTimeout(timeout);
    }
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
  private async describeHttpFailure(response: Response): Promise<AgentDraftResult> {
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
  ): AgentDraftResult {
    if (error instanceof Error && error.name === "AbortError") {
      return cancel?.aborted === true
        ? fail("CANCELLED", "Request cancelled. Nothing was applied to the form.")
        : fail(
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

    // Checked against the generation schema before anything downstream treats
    // it as a draft. The gate further down IS stricter, but it is silent about
    // a type-confused value — see `draftValidation.ts` for the dead end that
    // produced.
    const validated = validateGeneratedDraft(parsed);
    if (!validated.ok) {
      return fail(
        "INVALID_RESPONSE",
        `The provider's proposal did not match the generation contract (${validated.reason}). Nothing was applied to the form.`,
      );
    }

    return {
      ok: true,
      draft: validated.draft,
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
