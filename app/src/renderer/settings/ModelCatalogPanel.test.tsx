// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type {
  ModelCatalogEntry,
  ProviderCatalogResult,
  ProviderCredits,
} from "../../shared/agentTypes";
import { ModelCatalogPanel } from "./ModelCatalogPanel";

const entry = (id: string): ModelCatalogEntry => ({
  id,
  displayName: id,
  contextLength: 200_000,
  promptPricePerMillion: 3,
  completionPricePerMillion: 15,
  promoted: false,
});

const CREDITS: ProviderCredits = { remaining: 8.75, used: 1.25, limit: 10 };

interface Options {
  configured?: boolean;
  catalog?: readonly ModelCatalogEntry[] | null;
  result?: ProviderCatalogResult;
}

function setup(options: Options = {}) {
  const refreshCatalog = vi.fn(
    async (): Promise<ProviderCatalogResult> =>
      options.result ?? {
        ok: true,
        models: [entry("a/one"), entry("b/two"), entry("c/three")],
        credits: CREDITS,
      },
  );
  const onCatalogRefreshed = vi.fn();
  const view = render(
    <ModelCatalogPanel
      provider="openrouter"
      displayName="OpenRouter"
      configured={options.configured ?? true}
      catalog={options.catalog ?? null}
      service={{ refreshCatalog }}
      onCatalogRefreshed={onCatalogRefreshed}
    />,
  );
  return { refreshCatalog, onCatalogRefreshed, container: view.container };
}

const refreshButton = (): HTMLElement =>
  screen.getByRole("button", { name: /refresh model list/i });

describe("ModelCatalogPanel — before a key exists", () => {
  it("explains what is missing instead of offering a button that cannot work", () => {
    setup({ configured: false });

    expect(screen.getByText(/add an openrouter key/i)).toBeVisible();
    expect(screen.queryByRole("button", { name: /refresh model list/i })).toBeNull();
  });

  /**
   * The panel is a section inside a provider card, and `.catalog-panel` is what
   * draws the rule separating it from the key form above. Returning a bare
   * paragraph left this one state of the panel visually merged into the form,
   * where every other state is a distinct block.
   */
  it("is still a separated section, not a loose paragraph", () => {
    const { container } = setup({ configured: false });

    expect(container.querySelector(".catalog-panel")).not.toBeNull();
  });
});

describe("ModelCatalogPanel — fetching the catalogue", () => {
  /**
   * The panel does not fetch on its own. The shell does, once per session per
   * provider, because this component unmounts whenever the analyst navigates
   * away — so a guard living in here retried a failing catalogue on every
   * single visit to Settings, each one costing a ten-second timeout.
   */
  it("does not fetch on arrival — the shell owns that", async () => {
    const { refreshCatalog } = setup();

    await Promise.resolve();
    expect(refreshCatalog).not.toHaveBeenCalled();
  });

  it("reports what came back", async () => {
    const user = userEvent.setup();
    setup();

    await user.click(refreshButton());

    expect(await screen.findByText(/3 models/i)).toBeVisible();
    expect(screen.getByText(/\$8\.75/)).toBeVisible();
  });

  it("tells the shell so every picker sees the new list", async () => {
    const user = userEvent.setup();
    const { onCatalogRefreshed } = setup();

    await user.click(refreshButton());

    await waitFor(() => expect(onCatalogRefreshed).toHaveBeenCalledOnce());
  });

  it("refreshes on request", async () => {
    const user = userEvent.setup();
    const { refreshCatalog } = setup({ catalog: [entry("a/one")] });

    await user.click(refreshButton());

    await waitFor(() => expect(refreshCatalog).toHaveBeenCalledWith("openrouter"));
  });

  /**
   * A fetch that succeeds and matches nothing is not a catalogue of zero.
   *
   * `ModelCatalog` stores an empty result as no catalogue at all, so the picker
   * keeps offering the shipped shortlist — which meant this panel announced
   * "0 models available" directly beside a dropdown holding three. The two
   * halves have to agree, and the shortlist is the half that is true.
   */
  it("does not claim zero models while the picker still offers the shortlist", async () => {
    const user = userEvent.setup();
    setup({ result: { ok: true, models: [], credits: null } });

    await user.click(refreshButton());

    expect(await screen.findByText(/none of them support/i)).toBeVisible();
    expect(screen.queryByText(/0 models available/i)).toBeNull();
  });
});

describe("ModelCatalogPanel — when the fetch fails", () => {
  const failure: ProviderCatalogResult = {
    ok: false,
    code: "RATE_LIMITED",
    message: "OpenRouter rate-limited the model-list request.",
  };

  it("says what went wrong", async () => {
    const user = userEvent.setup();
    setup({ result: failure });

    await user.click(refreshButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(/rate-limited/i);
  });

  /**
   * A failed refresh is not a broken provider. The shipped shortlist still
   * works, and saying so is the difference between a degraded list and an
   * analyst who thinks OpenRouter is unusable.
   */
  it("still offers the shortlist and another attempt", async () => {
    const user = userEvent.setup();
    setup({ result: failure });
    await user.click(refreshButton());

    // Asserted on the alert itself: the panel's own intro also mentions the
    // shortlist, and a page-wide text match would pass on that sentence alone
    // without the failure ever saying what still works.
    expect(await screen.findByRole("alert")).toHaveTextContent(/shortlist is still available/i);
    expect(refreshButton()).toBeEnabled();
  });

  it("does not tell the shell a new catalogue arrived", async () => {
    const user = userEvent.setup();
    const { onCatalogRefreshed } = setup({ result: failure });

    await user.click(refreshButton());
    await screen.findByRole("alert");
    expect(onCatalogRefreshed).not.toHaveBeenCalled();
  });

  it("survives a rejection as well as a typed failure", async () => {
    const user = userEvent.setup();
    const refreshCatalog = vi.fn(async () => {
      throw new Error("preload bridge missing");
    });
    render(
      <ModelCatalogPanel
        provider="openrouter"
        displayName="OpenRouter"
        configured
        catalog={null}
        service={{ refreshCatalog }}
        onCatalogRefreshed={vi.fn()}
      />,
    );
    await user.click(refreshButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(/preload bridge missing/);
  });
});

describe("ModelCatalogPanel — reporting the balance", () => {
  /**
   * An uncapped key has no balance to count down. "$0.00 remaining" would read
   * as spent, which is the opposite of what an unlimited key means.
   */
  it("distinguishes an uncapped key from an exhausted one", async () => {
    const user = userEvent.setup();
    setup({
      result: {
        ok: true,
        models: [entry("a/one")],
        credits: { remaining: null, used: 4, limit: null },
      },
    });
    await user.click(refreshButton());

    expect(await screen.findByText(/no spending limit/i)).toBeVisible();
    expect(screen.queryByText(/\$0\.00 left/i)).toBeNull();
  });

  /** A provider that publishes no balance simply has none shown. */
  it("says nothing about money when the provider reported none", async () => {
    const user = userEvent.setup();
    setup({ result: { ok: true, models: [entry("a/one")], credits: null } });

    await user.click(refreshButton());

    expect(await screen.findByText(/1 model/i)).toBeVisible();
    expect(screen.queryByText(/remaining/i)).toBeNull();
  });
});
