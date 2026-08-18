import type { AgentFailureCode } from "../shared/agentTypes.js";
import { readProviderErrorReason } from "./providerErrorBody.js";

export type CredentialValidationResult =
  | { ok: true }
  | { ok: false; code: AgentFailureCode; message: string };

export interface CredentialValidator {
  /** Confirms a key actually authenticates, once, before it is ever stored. */
  validate(apiKey: string): Promise<CredentialValidationResult>;
}

const VALIDATION_TIMEOUT_MS = 10_000;

/**
 * Validation is one authenticated GET whose only interesting property is
 * whether it succeeds.
 *
 * Every provider answers the same five ways — authenticated, rejected, rate
 * limited, something else, or nothing at all — and the mapping from those to a
 * typed failure is identical, so it is written once. The providers differ in
 * exactly two places: which URL proves a key works, and how the key is
 * presented. Both are constructor arguments.
 *
 * This was three copies of one method before OpenRouter arrived. Two copies is
 * a smell; three is a maintenance bug waiting for someone to fix a message in
 * one of them.
 */
class GetRequestCredentialValidator implements CredentialValidator {
  constructor(
    private readonly baseUrl: string,
    private readonly authorize: (apiKey: string) => Record<string, string>,
    private readonly fetchImpl: typeof fetch,
  ) {}

  async validate(apiKey: string): Promise<CredentialValidationResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), VALIDATION_TIMEOUT_MS);

    try {
      const response = await this.fetchImpl(this.baseUrl, {
        method: "GET",
        headers: this.authorize(apiKey),
        signal: controller.signal,
      });

      if (response.ok) return { ok: true };

      if (response.status === 401 || response.status === 403) {
        return {
          ok: false,
          code: "AUTHENTICATION",
          message: "The provider rejected this key. Check it was copied correctly and has not been revoked.",
        };
      }
      if (response.status === 429) {
        return {
          ok: false,
          code: "RATE_LIMITED",
          message: "The provider rate-limited the validation request. Wait a moment and try again.",
        };
      }
      // Same reasoning as the draft generators: a bare status code collapses
      // every distinct failure into the same unactionable sentence.
      const reason = await readProviderErrorReason(response);
      return {
        ok: false,
        code: "INVALID_RESPONSE",
        message:
          reason === null
            ? `The provider returned an unexpected status (${response.status}) while validating the key.`
            : `The provider rejected the validation request (${response.status}): ${reason}`,
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return {
          ok: false,
          code: "TIMEOUT",
          message: "Validating the key timed out. Check your network connection and try again.",
        };
      }
      const detail = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        code: "NETWORK",
        message: `Could not reach the provider to validate the key: ${detail}`,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

/**
 * Anthropic: `GET /v1/models` — no prompt, no completion tokens, just an
 * authenticated list call — so "validate the key once on entry" costs nothing
 * beyond the request itself.
 */
export class AnthropicCredentialValidator extends GetRequestCredentialValidator {
  constructor(fetchImpl: typeof fetch = fetch, baseUrl = "https://api.anthropic.com/v1/models") {
    super(
      baseUrl,
      (apiKey) => ({ "x-api-key": apiKey, "anthropic-version": "2023-06-01" }),
      fetchImpl,
    );
  }
}

/** OpenAI's equivalent zero-token authenticated models-list request. */
export class OpenAiCredentialValidator extends GetRequestCredentialValidator {
  constructor(fetchImpl: typeof fetch = fetch, baseUrl = "https://api.openai.com/v1/models") {
    super(baseUrl, (apiKey) => ({ Authorization: `Bearer ${apiKey}` }), fetchImpl);
  }
}

/**
 * OpenRouter: `GET /api/v1/key`, deliberately not `/api/v1/models`.
 *
 * The symmetry with the other two is a trap here. OpenRouter's model list is
 * public — it answers 200 to a request carrying no credential at all — so
 * validating against it would accept literally any string the analyst pasted,
 * store it as validated, and let them discover the typo on their first send
 * with an authentication error the "key validated and stored" message had
 * already ruled out.
 *
 * `/key` is the endpoint that requires the key. It also reports the balance,
 * which is where the credits figure on the Settings card comes from — read by
 * `openRouterCatalog.ts` rather than here, so that validation stays a yes/no
 * and does not grow a second return value nothing checks.
 */
export class OpenRouterCredentialValidator extends GetRequestCredentialValidator {
  constructor(fetchImpl: typeof fetch = fetch, baseUrl = "https://openrouter.ai/api/v1/key") {
    super(baseUrl, (apiKey) => ({ Authorization: `Bearer ${apiKey}` }), fetchImpl);
  }
}
