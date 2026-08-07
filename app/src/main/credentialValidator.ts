import type { AgentDraftFailureCode } from "../shared/agentTypes.js";
import { readProviderErrorReason } from "./providerErrorBody.js";

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

/** OpenAI's equivalent zero-token authenticated models-list request. */
export class OpenAiCredentialValidator implements CredentialValidator {
  constructor(
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly baseUrl = "https://api.openai.com/v1/models",
  ) {}

  async validate(apiKey: string): Promise<CredentialValidationResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), VALIDATION_TIMEOUT_MS);

    try {
      const response = await this.fetchImpl(this.baseUrl, {
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}` },
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
