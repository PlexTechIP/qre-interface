import type { AgentDraftFailureCode } from "../shared/agentTypes.js";

export type CredentialValidationResult =
  | { ok: true }
  | { ok: false; code: AgentDraftFailureCode; message: string };

export interface CredentialValidator {
  /** Confirms a key actually authenticates, once, before it is ever stored. */
  validate(apiKey: string): Promise<CredentialValidationResult>;
}

const VALIDATION_TIMEOUT_MS = 10_000;

/**
 * First provider adapter: Anthropic. Validates a key with `GET /v1/models` —
 * no prompt, no completion tokens, just an authenticated list call — so
 * "validate the key once on entry" costs nothing beyond the request itself.
 */
export class AnthropicCredentialValidator implements CredentialValidator {
  constructor(
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly baseUrl = "https://api.anthropic.com/v1/models",
  ) {}

  async validate(apiKey: string): Promise<CredentialValidationResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), VALIDATION_TIMEOUT_MS);

    try {
      const response = await this.fetchImpl(this.baseUrl, {
        method: "GET",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
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
      return {
        ok: false,
        code: "INVALID_RESPONSE",
        message: `The provider returned an unexpected status (${response.status}) while validating the key.`,
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
