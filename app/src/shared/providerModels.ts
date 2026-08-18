import { PROVIDER_IDS, type ProviderId } from "./agentTypes.js";

/**
 * The models this build promotes for OpenRouter.
 *
 * Not the catalogue — OpenRouter routes to hundreds of models and the list
 * changes weekly, so the real inventory is fetched at runtime (see
 * `main/openRouterCatalog.ts`). This is the promoted path: one strong model
 * from each of the two first-party providers the app already speaks to, plus an
 * open-weights option for the cost-sensitive case. Everything else is reachable
 * through the full catalogue, which is an escape hatch rather than the default.
 *
 * A shortlist entry that OpenRouter has stopped routing simply stops appearing:
 * the picker promotes the intersection of this list and the fetched catalogue,
 * so a stale slug here degrades to an absence, never to a broken option.
 */
export const OPENROUTER_SHORTLIST = [
  "anthropic/claude-sonnet-5",
  "openai/gpt-5.6-terra",
  "deepseek/deepseek-chat",
] as const;

/**
 * The provider/model catalogue is shared by the renderer and main process so
 * a selectable model cannot describe one provider in preview and another at
 * send time. It contains choices the app intentionally supports, not every
 * model a provider happens to list.
 *
 * For `anthropic` and `openai` this list is exhaustive and `isModelForProvider`
 * enforces it literally. For `openrouter` it is only the starting point the app
 * ships with — see `OPENROUTER_SHORTLIST`.
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
  openrouter: {
    displayName: "OpenRouter",
    models: OPENROUTER_SHORTLIST,
    defaultModel: "anthropic/claude-sonnet-5",
  },
} as const satisfies Record<
  ProviderId,
  { readonly displayName: string; readonly models: readonly string[]; readonly defaultModel: string }
>;

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === "string" && (PROVIDER_IDS as readonly string[]).includes(value);
}

/**
 * `vendor/model`, which is how OpenRouter names everything it routes.
 *
 * Exactly one slash with something on both sides and no whitespace anywhere.
 * Deliberately shape-only: a build compiled today cannot know what OpenRouter
 * will list next month, and a check that enumerated known vendors would make
 * this app's release date the ceiling on what the analyst can select.
 */
export function isOpenRouterSlug(value: unknown): value is string {
  return typeof value === "string" && /^[^\s/]+\/[^\s/]+$/.test(value);
}

/**
 * Whether a model may be sent to a provider.
 *
 * Two rules, because the two kinds of provider are different in kind. The
 * first-party providers publish a small stable list this app pins, so an
 * unknown model there means the renderer and main bundles disagree. OpenRouter
 * publishes a catalogue that outlives any pinned list, so the shared check is
 * the slug shape and the tighter check — against the catalogue actually fetched
 * — happens in main, where the fetched data lives. Cold cache degrades to this
 * rule rather than to a hard block; see `main/modelCatalog.ts`.
 */
export function isModelForProvider(provider: ProviderId, model: unknown): model is string {
  if (provider === "openrouter") return isOpenRouterSlug(model);
  return (
    typeof model === "string" &&
    (PROVIDER_MODELS[provider].models as readonly string[]).includes(model)
  );
}
