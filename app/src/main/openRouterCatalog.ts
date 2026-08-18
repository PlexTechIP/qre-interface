import type {
  AgentFailureCode,
  ModelCatalogEntry,
  ProviderCatalogResult,
  ProviderCredits,
} from "../shared/agentTypes.js";
import { readProviderErrorReason } from "./providerErrorBody.js";

/** The same budget the credential validators spend; this is the same kind of call. */
const CATALOG_TIMEOUT_MS = 10_000;
const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

/**
 * What a model must advertise to be offered at all.
 *
 * Both, not either. A proposal is a call to `propose_run_config`, so a model
 * that cannot call tools cannot ever produce one — and the call's parameters
 * are sent `strict: true`, which is what `structured_outputs` promises to
 * honour. A model missing either is not a weaker choice; it is one that fails
 * on every send that needed a configuration.
 *
 * Load-bearing rather than cosmetic: OpenRouter routes a single slug across
 * many upstream hosts with different capabilities. Filtering here is what makes
 * `provider: { require_parameters: true }` on the outbound request a narrowing
 * rather than a wall.
 */
const REQUIRED_PARAMETERS = ["tools", "structured_outputs"] as const;

/**
 * Reads what OpenRouter will route to, and what the key has left to spend.
 *
 * Deliberately not a `DraftGenerator`: this makes no completion, costs no
 * tokens, and answers questions about the account rather than about a run. It
 * is the piece that makes OpenRouter's model list data instead of a constant —
 * see `modelCatalog.ts` for where the answer is kept and `agentHandler.ts` for
 * where it becomes a gate.
 *
 * The two requests go out together because neither needs the other's answer,
 * and a refresh that took two round trips in sequence would spend the analyst's
 * patience for no reason.
 */
export class OpenRouterCatalogClient {
  constructor(
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly baseUrl: string = DEFAULT_BASE_URL,
  ) {}

  async fetch(apiKey: string): Promise<ProviderCatalogResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CATALOG_TIMEOUT_MS);
    try {
      const [models, balance] = await Promise.all([
        this.readModels(apiKey, controller.signal),
        // Never rejects — see `readBalance`.
        this.readBalance(apiKey, controller.signal),
      ]);
      /*
       * The rejected-key check comes FIRST, and it comes from the balance
       * lookup rather than from the catalogue.
       *
       * `/models` is public: it answers 200 to a request with no credential at
       * all, which is why `OpenRouterCredentialValidator` validates against
       * `/key`. The same fact means a revoked key produces a perfectly good
       * catalogue here, and `/key` is the only half of this call that can tell.
       * Reporting success would hand back a model list under a key that cannot
       * send anything.
       */
      if (!balance.authorized) {
        return fail(
          "AUTHENTICATION",
          "OpenRouter rejected the stored key. It may have been revoked — re-enter it to continue.",
        );
      }
      if (!models.ok) return models;
      return { ok: true, models: models.models, credits: balance.credits };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return fail(
          "TIMEOUT",
          "OpenRouter did not return its model list in time. The shipped shortlist is still available.",
        );
      }
      const detail = error instanceof Error ? error.message : String(error);
      return fail("NETWORK", `Could not reach OpenRouter to read its model list: ${detail}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async readModels(
    apiKey: string,
    signal: AbortSignal,
  ): Promise<
    { ok: true; models: readonly ModelCatalogEntry[] } | Extract<ProviderCatalogResult, { ok: false }>
  > {
    const response = await this.fetchImpl(`${this.baseUrl}/models`, {
      method: "GET",
      // No `HTTP-Referer` and no `X-Title`. Those are OpenRouter's optional
      // app-attribution headers and they list the app on a public leaderboard,
      // which is the opposite of this product's no-telemetry posture.
      headers: { Authorization: `Bearer ${apiKey}` },
      signal,
    });
    if (!response.ok) return await describeHttpFailure(response);

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return fail("INVALID_RESPONSE", "OpenRouter's model list was not valid JSON.");
    }
    const data = asRecord(payload)?.["data"];
    if (!Array.isArray(data)) {
      return fail(
        "INVALID_RESPONSE",
        "OpenRouter returned something other than a model list. The shipped shortlist is still available.",
      );
    }
    return {
      ok: true,
      models: data
        .filter(canProposeConfigurations)
        .map(readEntry)
        .filter((entry): entry is ModelCatalogEntry => entry !== null),
    };
  }

  /**
   * Whether the key still authenticates, and what it has left.
   *
   * Two answers rather than one, because they carry different weight. The
   * balance is a courtesy — a 500, a timeout or an unparseable body costs the
   * analyst a dollar figure and nothing else, so it is contained here rather
   * than allowed to fail a refresh that got the model list. A 401 or 403 is
   * not a courtesy failure: it is the only signal in this whole call that the
   * stored key is dead, and swallowing it reported a healthy refresh under a
   * revoked key.
   *
   * `authorized` defaults to true on every non-auth failure, so an unreachable
   * endpoint never accuses a working key.
   */
  private async readBalance(
    apiKey: string,
    signal: AbortSignal,
  ): Promise<{ authorized: boolean; credits: ProviderCredits | null }> {
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/key`, {
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}` },
        signal,
      });
      if (response.status === 401 || response.status === 403) {
        return { authorized: false, credits: null };
      }
      if (!response.ok) return { authorized: true, credits: null };
      return { authorized: true, credits: readCredits(await response.json()) };
    } catch {
      return { authorized: true, credits: null };
    }
  }
}

/**
 * Whether OpenRouter says this model can do what a proposal requires.
 *
 * An entry with no `supported_parameters` at all is excluded rather than
 * assumed capable: the promoted path has to work, and an optimistic guess here
 * shows up as a failed send with a message about the generation contract.
 */
function canProposeConfigurations(candidate: unknown): boolean {
  const parameters = asRecord(candidate)?.["supported_parameters"];
  if (!Array.isArray(parameters)) return false;
  return REQUIRED_PARAMETERS.every((required) => parameters.includes(required));
}

/**
 * One catalogue row, or null when there is no slug to send.
 *
 * The id is the whole point of an entry: it is what the picker selects, what
 * `ModelCatalog.accepts` matches on, and what travels in the request body. An
 * entry without one would render as a blank option that fails the moment it is
 * chosen, so it is dropped rather than defaulted to an empty string.
 */
function readEntry(candidate: unknown): ModelCatalogEntry | null {
  const record = asRecord(candidate);
  if (record === null) return null;
  const id = record["id"];
  if (typeof id !== "string" || id.length === 0) return null;
  const name = record["name"];
  const pricing = asRecord(record["pricing"]);
  const contextLength = record["context_length"];
  return {
    id,
    // The slug when there is no prettier name. It is what the request carries
    // anyway, so it is never a placeholder for something the analyst cannot see.
    displayName: typeof name === "string" && name.length > 0 ? name : id,
    contextLength:
      typeof contextLength === "number" && Number.isFinite(contextLength) && contextLength > 0
        ? contextLength
        : null,
    promptPricePerMillion: readPricePerMillion(pricing?.["prompt"]),
    completionPricePerMillion: readPricePerMillion(pricing?.["completion"]),
    // The shortlist is applied by `ModelCatalog.replace`, which is the only
    // place that knows which slugs this build promotes.
    promoted: false,
  };
}

/**
 * OpenRouter quotes USD per token, as a string, at magnitudes like `0.000003`.
 * Nobody reads that; the industry quotes per million. Converted here so exactly
 * one place in the app knows the units, and the UI only has to format.
 *
 * Null for anything unparseable, and specifically NOT zero — OpenRouter lists
 * genuinely free models, so collapsing "no price given" into "free" would
 * advertise a cost the app does not actually know.
 */
function readPricePerMillion(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value * 1_000_000 : null;
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed * 1_000_000 : null;
}

function readCredits(payload: unknown): ProviderCredits | null {
  const data = asRecord(asRecord(payload)?.["data"]);
  if (data === null) return null;
  const used = data["usage"];
  if (typeof used !== "number" || !Number.isFinite(used)) return null;
  return {
    used,
    // Null means uncapped, which is a different fact from a zero balance and
    // has to survive as one — see the type.
    limit: readOptionalNumber(data["limit"]),
    remaining: readOptionalNumber(data["limit_remaining"]),
  };
}

function readOptionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** The same status-to-message mapping the generators and validators use. */
async function describeHttpFailure(
  response: Response,
): Promise<Extract<ProviderCatalogResult, { ok: false }>> {
  if (response.status === 401 || response.status === 403) {
    return fail(
      "AUTHENTICATION",
      "OpenRouter rejected the stored key while reading its model list. It may have been revoked — re-enter it to continue.",
    );
  }
  if (response.status === 429) {
    return fail(
      "RATE_LIMITED",
      "OpenRouter rate-limited the model-list request. Wait a moment and try again.",
    );
  }
  const reason = await readProviderErrorReason(response);
  return fail(
    "INVALID_RESPONSE",
    reason === null
      ? `OpenRouter returned an unexpected status (${response.status}) while reading its model list.`
      : `OpenRouter rejected the model-list request (${response.status}): ${reason}`,
  );
}

function fail(
  code: AgentFailureCode,
  message: string,
): Extract<ProviderCatalogResult, { ok: false }> {
  return { ok: false, code, message };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
