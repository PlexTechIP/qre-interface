// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { ModelCatalogEntry, ProviderAvailability } from "../../shared/agentTypes";
import { ProviderModelSelect } from "./ProviderModelSelect";

const entry = (
  id: string,
  promoted: boolean,
  overrides: Partial<ModelCatalogEntry> = {},
): ModelCatalogEntry => ({
  id,
  displayName: id,
  contextLength: 200_000,
  promptPricePerMillion: 3,
  completionPricePerMillion: 15,
  promoted,
  ...overrides,
});

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

/**
 * A three-item list needs no structure. A three-hundred-item one does, and
 * OpenRouter's is the latter — so when a provider hands back a fetched
 * catalogue the picker stops being a flat dropdown and starts being something
 * an analyst can choose from.
 */
describe("ProviderModelSelect — a fetched catalogue", () => {
  const withCatalogue: readonly ProviderAvailability[] = [
    {
      provider: "openrouter",
      displayName: "OpenRouter",
      configured: true,
      models: ["anthropic/claude-sonnet-5", "zzz/long-tail", "unpriced/model"],
      defaultModel: "anthropic/claude-sonnet-5",
      catalog: [
        entry("anthropic/claude-sonnet-5", true),
        entry("zzz/long-tail", false, { contextLength: 32_768, promptPricePerMillion: 0.25 }),
        entry("unpriced/model", false, {
          contextLength: null,
          promptPricePerMillion: null,
          completionPricePerMillion: null,
        }),
      ],
    },
  ];

  const renderCatalogue = (model = "anthropic/claude-sonnet-5") =>
    render(
      <ProviderModelSelect
        providers={withCatalogue}
        provider="openrouter"
        model={model}
        onChange={vi.fn()}
      />,
    );

  it("separates the models it promotes from the long tail", () => {
    renderCatalogue();

    const groups = screen
      .getAllByRole("group")
      .map((group) => group.getAttribute("label"));
    expect(groups).toEqual(["Recommended", "All models"]);
  });

  /**
   * A slug alone does not distinguish two plausible options. Context window and
   * price are what an analyst is actually choosing between, and they are the
   * only things OpenRouter reports that bear on the decision.
   */
  it("says what separates one model from another", () => {
    renderCatalogue();

    expect(
      screen.getByRole("option", { name: /^zzz\/long-tail/ }),
    ).toHaveAccessibleName(/33K context/);
    expect(
      screen.getByRole("option", { name: /^zzz\/long-tail/ }),
    ).toHaveAccessibleName(/\$0\.25\/M in/);
  });

  /** A missing figure is left out rather than rendered as a zero or a dash. */
  it("says nothing about a model whose details the provider withheld", () => {
    renderCatalogue();

    expect(screen.getByRole("option", { name: "unpriced/model" })).toBeInTheDocument();
  });

  /**
   * The selection can outlive the catalogue: OpenRouter drops a model, or the
   * analyst last used one before the list was fetched. A `<select>` whose value
   * matches no option silently shows the first one instead, so the control
   * would claim a model the next send does not use.
   */
  it("keeps showing a selected model the catalogue no longer lists", () => {
    renderCatalogue("mistralai/gone-away");

    expect(screen.getByLabelText("Model")).toHaveValue("mistralai/gone-away");
    expect(
      screen.getByRole("option", { name: /mistralai\/gone-away/ }),
    ).toHaveAccessibleName(/no longer listed/i);
  });

  it("falls back to a flat list when there is no catalogue", () => {
    render(
      <ProviderModelSelect
        providers={PROVIDERS}
        provider="anthropic"
        model="claude-sonnet-5"
        onChange={vi.fn()}
      />,
    );

    expect(screen.queryAllByRole("group")).toHaveLength(0);
    expect(screen.getByRole("option", { name: "claude-sonnet-5" })).toBeInTheDocument();
  });
});

/**
 * The option label is the only place these numbers are ever shown, so the
 * formatting IS the feature — a figure an analyst cannot read is the same as
 * no figure at all.
 */
describe("ProviderModelSelect — formatting the numbers", () => {
  const withEntries = (
    entries: readonly ModelCatalogEntry[],
  ): readonly ProviderAvailability[] => [
    {
      provider: "openrouter",
      displayName: "OpenRouter",
      configured: true,
      models: entries.map((candidate) => candidate.id),
      defaultModel: entries[0]?.id ?? "a/b",
      catalog: entries,
    },
  ];

  const renderWith = (entries: readonly ModelCatalogEntry[]) =>
    render(
      <ProviderModelSelect
        providers={withEntries(entries)}
        provider="openrouter"
        model={entries[0]?.id ?? "a/b"}
        onChange={vi.fn()}
      />,
    );

  /**
   * `toPrecision(1)` switches to exponential notation below 1e-6, so a genuinely
   * cheap model rendered as "$1e-7/M in" — the same class of unreadable as the
   * "$0.00" the sub-cent branch exists to avoid.
   */
  it("never falls back to exponential notation for a tiny price", () => {
    renderWith([entry("cheap/model", false, { promptPricePerMillion: 1e-7 })]);

    const option = screen.getByRole("option", { name: /^cheap\/model/ });
    expect(option).toHaveAccessibleName(/\$0\.0000001\/M in/);
    expect(option.textContent).not.toMatch(/e-/);
  });

  it("still shows two decimals for an ordinary price", () => {
    renderWith([entry("normal/model", false, { promptPricePerMillion: 3 })]);

    expect(screen.getByRole("option", { name: /^normal\/model/ })).toHaveAccessibleName(
      /\$3\.00\/M in/,
    );
  });

  it("keeps free distinct from cheap", () => {
    renderWith([entry("free/model", false, { promptPricePerMillion: 0 })]);

    expect(screen.getByRole("option", { name: /^free\/model/ })).toHaveAccessibleName(
      /\$0\.00\/M in/,
    );
  });

  /**
   * The M threshold was tested against the raw token count while the K branch
   * rounded afterwards, so a context window just under a million rendered as a
   * four-digit K value.
   */
  it("rolls up to M rather than printing a four-digit K", () => {
    renderWith([entry("wide/model", false, { contextLength: 999_999 })]);

    const option = screen.getByRole("option", { name: /^wide\/model/ });
    expect(option).toHaveAccessibleName(/1M context/);
    expect(option.textContent).not.toMatch(/1000K/);
  });

  it("still reads small windows as themselves", () => {
    renderWith([
      entry("small/model", false, { contextLength: 512 }),
      entry("mid/model", false, { contextLength: 32_768 }),
    ]);

    expect(screen.getByRole("option", { name: /^small\/model/ })).toHaveAccessibleName(
      /512 context/,
    );
    expect(screen.getByRole("option", { name: /^mid\/model/ })).toHaveAccessibleName(
      /33K context/,
    );
  });
});
