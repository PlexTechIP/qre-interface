import { PROVIDER_IDS, type ProviderId } from "./agentTypes.js";

/**
 * The provider/model catalogue is shared by the renderer and main process so
 * a selectable model cannot describe one provider in preview and another at
 * send time. It contains choices the app intentionally supports, not every
 * model a provider happens to list.
 */
export const PROVIDER_MODELS = {
  anthropic: {
    displayName: "Anthropic",
    models: [
      "claude-haiku-4-5",
      "claude-sonnet-5",
      "claude-opus-5",
    ],
    defaultModel: "claude-sonnet-5",
  },
  openai: {
    displayName: "OpenAI",
    models: ["gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol"],
    defaultModel: "gpt-5.6-terra",
  },
} as const satisfies Record<
  ProviderId,
  { readonly displayName: string; readonly models: readonly string[]; readonly defaultModel: string }
>;

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === "string" && (PROVIDER_IDS as readonly string[]).includes(value);
}

export function isModelForProvider(provider: ProviderId, model: unknown): model is string {
  return (
    typeof model === "string" &&
    (PROVIDER_MODELS[provider].models as readonly string[]).includes(model)
  );
}
