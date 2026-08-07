import { describe, expect, it } from "vitest";

import { isModelForProvider, PROVIDER_MODELS } from "./providerModels.js";

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
});
