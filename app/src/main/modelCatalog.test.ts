// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { ModelCatalogEntry } from "../shared/agentTypes.js";
import { ModelCatalog } from "./modelCatalog.js";

const SHORTLIST = ["anthropic/claude-sonnet-5", "openai/gpt-5.6-terra"] as const;

const entry = (id: string, contextLength: number | null = 200_000): ModelCatalogEntry => ({
  id,
  displayName: id,
  contextLength,
  promptPricePerMillion: 3,
  completionPricePerMillion: 15,
  promoted: false,
});

const catalog = (): ModelCatalog => new ModelCatalog("openrouter", SHORTLIST);

describe("ModelCatalog — before anything has been fetched", () => {
  it("has nothing to list", () => {
    expect(catalog().list()).toBeNull();
  });

  /**
   * A cold cache must not become a block. The analyst may have no key yet, or
   * the catalogue request may have failed; in both cases the app still knows
   * what a valid OpenRouter model looks like, and refusing every send until a
   * list arrives would make an optional network call a hard dependency.
   */
  it("falls back to the slug-shape rule rather than refusing everything", () => {
    expect(catalog().accepts("mistralai/mistral-large-2512")).toBe(true);
    expect(catalog().accepts("claude-sonnet-5")).toBe(false);
  });
});

describe("ModelCatalog — once a catalogue has been fetched", () => {
  it("accepts only what the provider actually listed", () => {
    const cache = catalog();
    cache.replace([entry("anthropic/claude-sonnet-5"), entry("meta-llama/llama-4-scout")]);

    expect(cache.accepts("meta-llama/llama-4-scout")).toBe(true);
    // Well-formed, and no longer good enough: the provider has told us what it
    // routes, so a slug it did not list is a 404 waiting to happen.
    expect(cache.accepts("mistralai/mistral-large-2512")).toBe(false);
  });

  it("pins the shortlist to the top, in shortlist order", () => {
    const cache = catalog();
    cache.replace([
      entry("zzz/last-alphabetically"),
      entry("openai/gpt-5.6-terra"),
      entry("aaa/first-alphabetically"),
      entry("anthropic/claude-sonnet-5"),
    ]);

    expect(cache.list()?.map((model) => model.id)).toEqual([
      "anthropic/claude-sonnet-5",
      "openai/gpt-5.6-terra",
      "zzz/last-alphabetically",
      "aaa/first-alphabetically",
    ]);
    expect(cache.list()?.map((model) => model.promoted)).toEqual([true, true, false, false]);
  });

  /**
   * The shortlist is this build's opinion; the catalogue is the provider's
   * fact. A promoted slug OpenRouter has stopped routing has to disappear, not
   * be conjured into the list — the picker would otherwise offer an option that
   * fails on send, which is the one thing the promoted path must never do.
   */
  it("does not invent a shortlist entry the provider no longer lists", () => {
    const cache = catalog();
    cache.replace([entry("openai/gpt-5.6-terra")]);

    expect(cache.list()?.map((model) => model.id)).toEqual(["openai/gpt-5.6-terra"]);
    expect(cache.accepts("anthropic/claude-sonnet-5")).toBe(false);
  });

  /** A later refresh replaces the list outright; entries do not accumulate. */
  it("replaces rather than merges", () => {
    const cache = catalog();
    cache.replace([entry("openai/gpt-5.6-terra")]);
    cache.replace([entry("deepseek/deepseek-chat")]);

    expect(cache.list()?.map((model) => model.id)).toEqual(["deepseek/deepseek-chat"]);
    expect(cache.accepts("openai/gpt-5.6-terra")).toBe(false);
  });

  /**
   * An empty catalogue is a real answer — every model was filtered out for
   * lacking structured-output support — but treating it as "warm and empty"
   * would block every send. It reverts to the cold rule instead, which is the
   * same degradation a failed fetch gets.
   */
  it("treats an empty result as no catalogue at all", () => {
    const cache = catalog();
    cache.replace([]);

    expect(cache.list()).toBeNull();
    expect(cache.accepts("mistralai/mistral-large-2512")).toBe(true);
  });
});
