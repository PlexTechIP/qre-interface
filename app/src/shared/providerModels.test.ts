import { describe, expect, it } from "vitest";

import { PROVIDER_IDS } from "./agentTypes.js";
import {
  isModelForProvider,
  isOpenRouterSlug,
  OPENROUTER_SHORTLIST,
  PROVIDER_MODELS,
} from "./providerModels.js";

describe("provider model registry", () => {
  it("offers six scoped selectable models", () => {
    expect(PROVIDER_MODELS.anthropic.models).toEqual([
      "claude-haiku-4-5",
      "claude-sonnet-5",
      "claude-opus-5",
    ]);
    expect(PROVIDER_MODELS.openai.models).toEqual([
      "gpt-5.6-luna",
      "gpt-5.6-terra",
      "gpt-5.6-sol",
    ]);
    expect(isModelForProvider("anthropic", "gpt-5.6-sol")).toBe(false);
  });

  it("describes every provider it claims to support", () => {
    for (const provider of PROVIDER_IDS) {
      const entry = PROVIDER_MODELS[provider];
      expect(entry.models).toContain(entry.defaultModel);
      expect(entry.displayName.length).toBeGreaterThan(0);
    }
  });
});

/**
 * OpenRouter aggregates hundreds of models that change weekly, so its catalogue
 * cannot be a compile-time list the way the first-party providers' are. What
 * ships is a curated shortlist — the promoted path — while the real gate is the
 * slug shape here and, in main, the catalogue actually fetched from the API.
 */
describe("OpenRouter's dynamic catalogue", () => {
  it("promotes a shortlist rather than a three-hundred-item dropdown", () => {
    expect(PROVIDER_MODELS.openrouter.models).toEqual(OPENROUTER_SHORTLIST);
    expect(OPENROUTER_SHORTLIST.length).toBeGreaterThanOrEqual(3);
    for (const slug of OPENROUTER_SHORTLIST) {
      expect(isOpenRouterSlug(slug)).toBe(true);
    }
  });

  /**
   * A `vendor/model` slug this build has never heard of is accepted, because
   * refusing it would make the app's compile date the ceiling on what OpenRouter
   * can route to — exactly the coupling a dynamic catalogue exists to remove.
   */
  it("accepts a well-formed slug it has never seen", () => {
    expect(isModelForProvider("openrouter", "mistralai/mistral-large-2512")).toBe(true);
  });

  it("rejects anything that is not vendor-qualified", () => {
    expect(isOpenRouterSlug("claude-sonnet-5")).toBe(false);
    expect(isOpenRouterSlug("/claude-sonnet-5")).toBe(false);
    expect(isOpenRouterSlug("anthropic/")).toBe(false);
    expect(isOpenRouterSlug("anthropic/claude/sonnet")).toBe(false);
    expect(isOpenRouterSlug("anthropic claude-sonnet-5")).toBe(false);
    expect(isOpenRouterSlug("")).toBe(false);
    expect(isOpenRouterSlug(null)).toBe(false);
  });

  /**
   * The permissive slug rule belongs to OpenRouter alone. Letting it leak into
   * the first-party providers would turn their fixed lists into suggestions.
   */
  it("does not lend its permissiveness to the first-party providers", () => {
    expect(isModelForProvider("anthropic", "anthropic/claude-sonnet-5")).toBe(false);
    expect(isModelForProvider("openai", "openai/gpt-5.6-terra")).toBe(false);
    expect(isModelForProvider("openrouter", "claude-sonnet-5")).toBe(false);
  });
});
