import { ChatCompletionsDraftGenerator } from "./chatCompletionsGenerator.js";
import { PROVIDER_MODELS } from "../shared/providerModels.js";

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1/chat/completions";

/**
 * OpenRouter, on the shared chat-completions core.
 *
 * An aggregator rather than a provider: the slug it takes names an upstream
 * model (`anthropic/claude-sonnet-5`) that some other company actually serves.
 * That is the whole reason `require_parameters` is here — see below — and the
 * reason the model list is fetched instead of pinned, since OpenRouter's
 * inventory is not this app's to know at compile time.
 *
 * The first-party providers keep their own direct paths. OpenRouter is an
 * additional route to more models, not a replacement for talking to Anthropic
 * and OpenAI directly, and routing a first-party key through an aggregator
 * would add a hop, a bill, and a third party to a request that needs none.
 */
export function openRouterDraftGenerator(
  model: string = PROVIDER_MODELS.openrouter.defaultModel,
  fetchImpl: typeof fetch = fetch,
  baseUrl: string = DEFAULT_BASE_URL,
): ChatCompletionsDraftGenerator {
  return new ChatCompletionsDraftGenerator({
    provider: "OpenRouter",
    model,
    baseUrl,
    fetchImpl,
    bodyExtras: {
      /*
       * Only route this to a host that will honour the whole request.
       *
       * OpenRouter load-balances one slug across several upstream hosts, and
       * they do not all implement `response_format`. A host that silently drops
       * it answers with prose, which arrives here as "the reply did not match
       * the generation contract" — a message that blames the model for a
       * routing decision, and one the analyst cannot act on because retrying
       * may land on a different host and work.
       *
       * The catalogue filter and this option are two halves of one guarantee:
       * the filter decides which models may be offered, this decides which
       * hosts may serve them.
       */
      provider: { require_parameters: true },
    },
  });
}
