import { ChatCompletionsDraftGenerator } from "./chatCompletionsGenerator.js";

const DEFAULT_MODEL = "gpt-5.6-terra";
const DEFAULT_BASE_URL = "https://api.openai.com/v1/chat/completions";

/**
 * OpenAI, on the shared chat-completions core.
 *
 * A function rather than a class because there is nothing left to specialise:
 * once base URL, model and display name are parameters, "OpenAI" is three
 * arguments. Subclassing would have re-introduced the thing the extraction was
 * for — a place to quietly add an override that OpenRouter then does not get,
 * or inherits by accident.
 */
export function openAiDraftGenerator(
  model: string = DEFAULT_MODEL,
  fetchImpl: typeof fetch = fetch,
  baseUrl: string = DEFAULT_BASE_URL,
): ChatCompletionsDraftGenerator {
  return new ChatCompletionsDraftGenerator({
    provider: "OpenAI",
    model,
    baseUrl,
    fetchImpl,
    // The gpt-5.6 models are reasoning models, and OpenAI defaults them to a
    // non-"none" reasoning effort. On /v1/chat/completions that default is
    // incompatible with function tools — which this generator ALWAYS sends — and
    // the request is rejected 400 with "Function tools with reasoning_effort are
    // not supported … set reasoning_effort to 'none'." So we set it, exactly as
    // the API instructs. Scoped to OpenAI via bodyExtras rather than the shared
    // body, because it is not a parameter every chat-completions host accepts.
    bodyExtras: { reasoning_effort: "none" },
  });
}
