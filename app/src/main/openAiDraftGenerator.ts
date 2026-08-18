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
  });
}
