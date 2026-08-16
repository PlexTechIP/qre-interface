// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { ProviderAvailability } from "../../shared/agentTypes";
import { ProviderModelSelect } from "./ProviderModelSelect";

const PROVIDERS: readonly ProviderAvailability[] = [
  {
    provider: "anthropic",
    displayName: "Anthropic",
    configured: true,
    models: ["claude-haiku-4-5", "claude-sonnet-5", "claude-opus-5"],
    defaultModel: "claude-sonnet-5",
  },
  {
    provider: "openai",
    displayName: "OpenAI",
    configured: false,
    models: ["gpt-5.6-luna", "gpt-5.6-terra"],
    defaultModel: "gpt-5.6-terra",
  },
];

function setup(provider: "anthropic" | "openai" = "anthropic", model = "claude-sonnet-5") {
  const onChange = vi.fn();
  render(
    <ProviderModelSelect
      providers={PROVIDERS}
      provider={provider}
      model={model}
      onChange={onChange}
    />,
  );
  return { onChange };
}

describe("ProviderModelSelect", () => {
  it("shows the current provider and model", () => {
    setup();
    expect(screen.getByLabelText("Provider")).toHaveValue("anthropic");
    expect(screen.getByLabelText("Model")).toHaveValue("claude-sonnet-5");
  });

  it("lists only the selected provider's models", () => {
    setup();
    const models = screen.getByLabelText("Model");
    expect(models).toHaveTextContent("claude-sonnet-5");
    // The other provider's models must not be selectable here — picking one
    // would send a model that provider cannot serve.
    expect(models).not.toHaveTextContent("gpt-5.6-terra");
  });

  /**
   * Switching provider carries the model with it. Leaving the old model
   * selected would emit a pair the main process rejects outright
   * (`isModelForProvider`), so the control would look fine and every send
   * would fail.
   */
  it("resets to the new provider's default model when the provider changes", async () => {
    const user = userEvent.setup();
    const { onChange } = setup();

    await user.selectOptions(screen.getByLabelText("Provider"), "openai");

    expect(onChange).toHaveBeenCalledWith("openai", "gpt-5.6-terra");
  });

  it("keeps the provider when only the model changes", async () => {
    const user = userEvent.setup();
    const { onChange } = setup();

    await user.selectOptions(screen.getByLabelText("Model"), "claude-opus-5");

    expect(onChange).toHaveBeenCalledWith("anthropic", "claude-opus-5");
  });

  /** Which providers hold a key is the one thing that decides if a send works. */
  it("marks providers that have a key stored", () => {
    setup();
    expect(screen.getByRole("option", { name: "Anthropic (configured)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "OpenAI" })).toBeInTheDocument();
  });

  /** Two of these render on the chat page and in Settings at the same time. */
  it("does not collide with another instance's label associations", () => {
    render(
      <>
        <ProviderModelSelect
          providers={PROVIDERS}
          provider="anthropic"
          model="claude-sonnet-5"
          onChange={vi.fn()}
        />
        <ProviderModelSelect
          providers={PROVIDERS}
          provider="openai"
          model="gpt-5.6-terra"
          onChange={vi.fn()}
        />
      </>,
    );

    const providerSelects = screen.getAllByLabelText("Provider");
    expect(providerSelects).toHaveLength(2);
    expect(providerSelects[0]).toHaveValue("anthropic");
    expect(providerSelects[1]).toHaveValue("openai");
  });
});
