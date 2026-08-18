// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type {
  AgentProviderStatus,
  AgentService,
  ModelCatalogEntry,
  ProviderId,
} from "../../shared/agentTypes";
import type { AppInfoService } from "../../shared/appInfoTypes";
import { InMemoryChatStore } from "../../shared/chatStore";
import { fakeAgentService, fakeAppInfoService } from "../../shared/testing";
import { QRE_VERSION } from "../constants/staticOptions";
import type { ThemePreference } from "../theme";
import { SettingsPage } from "./SettingsPage";

const CONFIGURED: AgentProviderStatus = {
  available: true,
  networkEnabled: true,
  mode: "provider",
  providers: [
    {
      provider: "anthropic",
      displayName: "Anthropic",
      configured: true,
      models: ["claude-sonnet-5", "claude-opus-5"],
      defaultModel: "claude-sonnet-5",
    },
    {
      provider: "openai",
      displayName: "OpenAI",
      configured: false,
      models: ["gpt-5.6-terra"],
      defaultModel: "gpt-5.6-terra",
    },
  ],
};

const UNCONFIGURED: AgentProviderStatus = {
  available: false,
  networkEnabled: false,
  mode: "unavailable",
  message: "No model provider is configured.",
  providers: CONFIGURED.providers.map((entry) => ({ ...entry, configured: false })),
};

function setup(
  overrides: {
    status?: AgentProviderStatus;
    service?: Partial<AgentService>;
    chats?: InMemoryChatStore;
    themePreference?: ThemePreference;
    /** The active selection. The page is controlled, so this decides what the
     *  model picker renders — changing the select in a test does not. */
    provider?: ProviderId;
    model?: string;
    /** `null` stands for "no preload bridge", which is a real shipped case. */
    appInfo?: AppInfoService | null;
    /**
     * Which panel the test's subject lives on. Settings shows one at a time, so
     * a test about provider keys has to open that tab first — and which tab a
     * subject lives on is a fact about the page, not about the test.
     */
    tab?: string;
  } = {},
) {
  const chats = overrides.chats ?? new InMemoryChatStore();
  const appInfo =
    overrides.appInfo === undefined ? fakeAppInfoService() : overrides.appInfo;
  const service = { ...fakeAgentService(), ...overrides.service };
  const onSelectionChange = vi.fn();
  const onCredentialConfigured = vi.fn();
  const onCredentialCleared = vi.fn();
  const onCatalogRefreshed = vi.fn();
  const onConversationsCleared = vi.fn();
  const onThemePreferenceChange = vi.fn();

  render(
    <SettingsPage
      service={service}
      status={overrides.status ?? CONFIGURED}
      chats={chats}
      appInfo={appInfo ?? undefined}
      provider={overrides.provider ?? "anthropic"}
      model={overrides.model ?? "claude-sonnet-5"}
      onSelectionChange={onSelectionChange}
      onCredentialConfigured={onCredentialConfigured}
      onCredentialCleared={onCredentialCleared}
      onCatalogRefreshed={onCatalogRefreshed}
      onConversationsCleared={onConversationsCleared}
      themePreference={overrides.themePreference ?? "light"}
      onThemePreferenceChange={onThemePreferenceChange}
    />,
  );

  // `fireEvent` rather than `userEvent`: this runs inside a synchronous
  // `setup()` that every existing test calls without awaiting.
  if (overrides.tab !== undefined) {
    fireEvent.click(screen.getByRole("tab", { name: overrides.tab }));
  }

  return {
    chats,
    service,
    onSelectionChange,
    onCredentialConfigured,
    onCredentialCleared,
    onCatalogRefreshed,
    onConversationsCleared,
    onThemePreferenceChange,
  };
}

describe("SettingsPage", () => {
  it("is titled Settings", () => {
    setup();
    expect(screen.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
  });

  describe("AI providers", () => {
    it("shows one key card per provider the app knows about", () => {
      setup({ tab: "AI providers" });
      expect(screen.getByRole("region", { name: "Anthropic" })).toBeVisible();
      expect(screen.getByRole("region", { name: "OpenAI" })).toBeVisible();
    });

    it("reports each provider's key state independently", () => {
      setup({ tab: "AI providers" });
      const anthropic = screen.getByRole("region", { name: "Anthropic" });
      const openai = screen.getByRole("region", { name: "OpenAI" });
      expect(within(anthropic).getByText("Configured")).toBeVisible();
      expect(within(openai).getByText("Not configured")).toBeVisible();
    });

    it("changes the active provider and model together", async () => {
      const user = userEvent.setup();
      const { onSelectionChange } = setup({ tab: "AI providers" });

      await user.selectOptions(screen.getByLabelText("Provider"), "openai");

      expect(onSelectionChange).toHaveBeenCalledWith("openai", "gpt-5.6-terra");
    });

    it("tells the shell which provider was configured, not merely that something changed", async () => {
      const user = userEvent.setup();
      const configureCredential = vi.fn(async () => ({ ok: true as const }));
      const { onCredentialConfigured } = setup({ tab: "AI providers", service: { configureCredential } });

      const openai = screen.getByRole("region", { name: "OpenAI" });
      await user.type(within(openai).getByLabelText("OpenAI API key"), "sk-openai-value");
      await user.click(within(openai).getByRole("button", { name: /validate and save/i }));

      expect(configureCredential).toHaveBeenCalledWith("openai", "sk-openai-value");
      expect(onCredentialConfigured).toHaveBeenCalledWith("openai");
    });

    it("tells the shell when a key is removed", async () => {
      const user = userEvent.setup();
      const clearCredential = vi.fn(async () => ({ ok: true as const }));
      const { onCredentialCleared } = setup({ tab: "AI providers", service: { clearCredential } });

      const anthropic = screen.getByRole("region", { name: "Anthropic" });
      await user.click(within(anthropic).getByRole("button", { name: "Remove key" }));
      await user.click(within(anthropic).getByRole("button", { name: "Remove Anthropic key" }));

      expect(onCredentialCleared).toHaveBeenCalledWith("anthropic");
    });

    it("says plainly when nothing is configured yet", () => {
      setup({ tab: "AI providers", status: UNCONFIGURED });
      expect(screen.getByText(/no provider is configured/i)).toBeVisible();
    });
  });

  describe("Appearance", () => {
    it("reflects the current preference", () => {
      setup();
      expect(screen.getByRole("radio", { name: "Light" })).toBeChecked();
      expect(screen.getByRole("radio", { name: "Dark" })).not.toBeChecked();
      expect(screen.getByRole("radio", { name: "System" })).not.toBeChecked();
    });

    it("pins a theme", async () => {
      const user = userEvent.setup();
      const { onThemePreferenceChange } = setup();

      await user.click(screen.getByRole("radio", { name: "Dark" }));

      expect(onThemePreferenceChange).toHaveBeenCalledWith("dark");
    });

    /**
     * The only route back to following the OS: the header toggle can offer
     * light or dark and nothing else, because "system" is not a theme a
     * document can be painted as.
     */
    it("hands the choice back to the system", async () => {
      const user = userEvent.setup();
      const { onThemePreferenceChange } = setup({ themePreference: "dark" });

      await user.click(screen.getByRole("radio", { name: "System" }));

      expect(onThemePreferenceChange).toHaveBeenCalledWith("system");
    });

    it("shows System as the one in force when it is", () => {
      setup({ themePreference: "system" });
      expect(screen.getByRole("radio", { name: "System" })).toBeChecked();
    });

    it("says what following the system means", () => {
      setup({ themePreference: "system" });
      expect(screen.getByText(/matches your operating system/i)).toBeVisible();
    });
  });

  describe("Chat history", () => {
    it("asks once before deleting every conversation", async () => {
      const user = userEvent.setup();
      const chats = new InMemoryChatStore();
      await chats.create({ id: "c-1", title: "Keep me", createdAt: new Date().toISOString() });
      setup({ tab: "Data & storage", chats });

      await user.click(screen.getByRole("button", { name: "Delete all conversations" }));

      expect(await chats.list()).toHaveLength(1);
      expect(screen.getByRole("button", { name: "Yes, delete everything" })).toBeVisible();
    });

    it("deletes every conversation once confirmed", async () => {
      const user = userEvent.setup();
      const chats = new InMemoryChatStore();
      await chats.create({ id: "c-1", title: "Goodbye", createdAt: new Date().toISOString() });
      setup({ tab: "Data & storage", chats });

      await user.click(screen.getByRole("button", { name: "Delete all conversations" }));
      await user.click(screen.getByRole("button", { name: "Yes, delete everything" }));

      expect(await screen.findByRole("status")).toHaveTextContent(/conversations were deleted/i);
      expect(await chats.list()).toHaveLength(0);
    });

    it("backs out cleanly", async () => {
      const user = userEvent.setup();
      const chats = new InMemoryChatStore();
      await chats.create({ id: "c-1", title: "Keep me", createdAt: new Date().toISOString() });
      setup({ tab: "Data & storage", chats });

      await user.click(screen.getByRole("button", { name: "Delete all conversations" }));
      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(await chats.list()).toHaveLength(1);
      expect(screen.getByRole("button", { name: "Delete all conversations" })).toBeVisible();
    });

    /**
     * The shell holds which conversation is open, and deleting every one of
     * them leaves that id pointing at a row that no longer exists. `send`
     * then appends to it, which the store rejects — so the analyst's next
     * message fails to save and every one after it does too.
     */
    it("tells the shell the open conversation is gone", async () => {
      const user = userEvent.setup();
      const chats = new InMemoryChatStore();
      await chats.create({ id: "c-1", title: "Goodbye", createdAt: new Date().toISOString() });
      const { onConversationsCleared } = setup({ tab: "Data & storage", chats });

      await user.click(screen.getByRole("button", { name: "Delete all conversations" }));
      await user.click(screen.getByRole("button", { name: "Yes, delete everything" }));

      await waitFor(() => expect(onConversationsCleared).toHaveBeenCalledOnce());
    });

    it("leaves the open conversation alone when the delete fails", async () => {
      const user = userEvent.setup();
      const chats = new InMemoryChatStore();
      vi.spyOn(chats, "clear").mockRejectedValue(new Error("database is locked"));
      const { onConversationsCleared } = setup({ tab: "Data & storage", chats });

      await user.click(screen.getByRole("button", { name: "Delete all conversations" }));
      await user.click(screen.getByRole("button", { name: "Yes, delete everything" }));

      expect(await screen.findByRole("alert")).toBeVisible();
      // The transcripts are still on disk, so the open one is still openable.
      expect(onConversationsCleared).not.toHaveBeenCalled();
    });

    /** A failed delete must not report success — the transcripts are still there. */
    it("surfaces a refused deletion", async () => {
      const user = userEvent.setup();
      const chats = new InMemoryChatStore();
      vi.spyOn(chats, "clear").mockRejectedValue(new Error("database is locked"));
      setup({ tab: "Data & storage", chats });

      await user.click(screen.getByRole("button", { name: "Delete all conversations" }));
      await user.click(screen.getByRole("button", { name: "Yes, delete everything" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(/database is locked/i);
    });
  });

  describe("About", () => {
    it("reports the bundled QRE engine version", () => {
      setup({ tab: "About" });
      expect(screen.getByText(QRE_VERSION)).toBeVisible();
    });
  });

  /**
   * "Where is my data?" is the first question in any bug report from an
   * analyst, and until now the app could not answer it anywhere.
   */
  describe("Storage locations", () => {
    it("shows where each database lives", async () => {
      setup({ tab: "Data & storage" });

      expect(
        await screen.findByText("/fixture/userData/run-history.sqlite"),
      ).toBeVisible();
      expect(screen.getByText("/fixture/userData/chat-history.sqlite")).toBeVisible();
    });

    /**
     * QRE_DB_PATH / QRE_CHAT_DB_PATH are otherwise completely invisible: an
     * analyst running with one set has no way to tell which database they are
     * looking at.
     */
    it("marks a database an environment variable moved", async () => {
      setup({
        tab: "Data & storage",
        appInfo: fakeAppInfoService({
          locations: [
            { id: "runDatabase", path: "/elsewhere/runs.sqlite", overridden: true },
            { id: "chatDatabase", path: "/fixture/chat.sqlite", overridden: false },
          ],
        }),
      });

      const row = (await screen.findByText("/elsewhere/runs.sqlite")).closest(
        ".storage-row",
      );
      if (row === null) throw new Error("Expected a storage row.");
      expect(within(row as HTMLElement).getByText(/set by QRE_DB_PATH/i)).toBeVisible();
    });

    it("opens a database's folder by name, never by path", async () => {
      const user = userEvent.setup();
      const revealed: string[] = [];
      setup({ tab: "Data & storage", appInfo: fakeAppInfoService({ onReveal: (id) => revealed.push(id) }) });

      const buttons = await screen.findAllByRole("button", { name: "Show in folder" });
      await user.click(buttons[0]!);

      expect(revealed).toEqual(["runDatabase"]);
    });

    it("surfaces a folder that would not open", async () => {
      const user = userEvent.setup();
      setup({
        tab: "Data & storage",
        appInfo: fakeAppInfoService({
          revealResult: {
            ok: false,
            code: "REVEAL_FAILED",
            message: "That folder no longer exists.",
          },
        }),
      });

      const buttons = await screen.findAllByRole("button", { name: "Show in folder" });
      await user.click(buttons[0]!);

      expect(await screen.findByRole("alert")).toHaveTextContent(/no longer exists/i);
    });

    /** Component tests render without a preload bridge; a path is informational. */
    it("says nothing at all when running without the preload bridge", async () => {
      setup({ tab: "Data & storage", appInfo: null });

      // The panel is still there — it is named by its tab now, not by a
      // heading — and simply lists no paths.
      expect(await screen.findByRole("tabpanel", { name: "Data & storage" })).toBeVisible();
      expect(screen.queryByRole("button", { name: "Show in folder" })).toBeNull();
    });

    /**
     * The payload crosses IPC, so it is not trusted the way a local value is.
     * An id this build has no copy for used to index straight into the label
     * table and throw inside render, taking the whole page — including the
     * provider-key cards — down with it.
     */
    it("ignores a location this build does not know about", async () => {
      setup({
        tab: "Data & storage",
        appInfo: fakeAppInfoService({
          locations: [
            { id: "runDatabase", path: "/fixture/runs.sqlite", overridden: false },
            {
              id: "vectorIndex" as never,
              path: "/fixture/vectors.sqlite",
              overridden: false,
            },
          ],
        }),
      });

      expect(await screen.findByText("/fixture/runs.sqlite")).toBeVisible();
      expect(screen.queryByText("/fixture/vectors.sqlite")).toBeNull();
      // The rest of the page is still standing. An unknown id used to reach a
      // copy lookup that returned undefined and threw inside render, taking the
      // whole page down rather than one row.
      expect(screen.getAllByRole("tab")).toHaveLength(4);
    });

    /**
     * An empty list and a failed read render identically otherwise: a section
     * that says these files exist, then lists none.
     */
    it("says so when the paths could not be read", async () => {
      setup({
        tab: "Data & storage",
        appInfo: {
          getStorage: () => Promise.reject(new Error("no handler registered")),
          reveal: async () => ({ ok: true as const }),
        },
      });

      expect(await screen.findByRole("alert")).toHaveTextContent(
        /could not be read|no handler registered/i,
      );
    });
  });
});

/**
 * Catalogue controls belong to providers that have a catalogue, and the page
 * works that out from the data rather than from a provider's name — main omits
 * the field entirely for providers whose models are pinned.
 */
describe("SettingsPage — providers with a fetched catalogue", () => {
  const withOpenRouter = (
    catalog: readonly ModelCatalogEntry[] | null,
    configured = true,
  ): AgentProviderStatus => ({
    ...CONFIGURED,
    providers: [
      ...CONFIGURED.providers,
      {
        provider: "openrouter",
        displayName: "OpenRouter",
        configured,
        models: catalog?.map((entry) => entry.id) ?? ["anthropic/claude-sonnet-5"],
        defaultModel: catalog?.[0]?.id ?? "anthropic/claude-sonnet-5",
        catalog,
      },
    ],
  });

  const CATALOGUE: readonly ModelCatalogEntry[] = [
    {
      id: "deepseek/deepseek-chat",
      displayName: "DeepSeek Chat",
      contextLength: 128_000,
      promptPricePerMillion: 0.14,
      completionPricePerMillion: 0.28,
      promoted: true,
    },
  ];

  it("offers a refresh only on the card that has something to refresh", () => {
    setup({ tab: "AI providers", status: withOpenRouter(CATALOGUE) });

    const openrouter = screen.getByRole("region", { name: "OpenRouter" });
    expect(
      within(openrouter).getByRole("button", { name: /refresh model list/i }),
    ).toBeVisible();

    for (const name of ["Anthropic", "OpenAI"]) {
      const card = screen.getByRole("region", { name });
      expect(
        within(card).queryByRole("button", { name: /refresh model list/i }),
      ).toBeNull();
    }
  });

  it("reports how many models the provider is routing", () => {
    setup({ tab: "AI providers", status: withOpenRouter(CATALOGUE) });

    const openrouter = screen.getByRole("region", { name: "OpenRouter" });
    expect(within(openrouter).getByText(/1 model available/i)).toBeVisible();
  });

  it("tells the shell when a refresh lands, so every picker updates", async () => {
    const user = userEvent.setup();
    const { onCatalogRefreshed } = setup({
      tab: "AI providers",
      status: withOpenRouter(CATALOGUE),
      service: {
        async refreshCatalog() {
          return { ok: true as const, models: CATALOGUE, credits: null };
        },
      },
    });

    const openrouter = screen.getByRole("region", { name: "OpenRouter" });
    await user.click(within(openrouter).getByRole("button", { name: /refresh model list/i }));

    await waitFor(() => expect(onCatalogRefreshed).toHaveBeenCalledOnce());
  });

  /**
   * The picker is fed from `status.providers`, so a provider whose catalogue
   * arrived should be selectable with the models that came with it — the whole
   * point of the refresh reaching the shell.
   */
  it("offers the fetched models in the active-model picker", () => {
    setup({
      tab: "AI providers",
      status: withOpenRouter(CATALOGUE),
      provider: "openrouter",
      model: "deepseek/deepseek-chat",
    });

    expect(screen.getByLabelText("Model")).toHaveValue("deepseek/deepseek-chat");
    expect(screen.getByRole("option", { name: /DeepSeek Chat/ })).toBeInTheDocument();
  });

  it("explains what to do first when the provider holds no key", () => {
    setup({ tab: "AI providers", status: withOpenRouter(null, false) });

    const openrouter = screen.getByRole("region", { name: "OpenRouter" });
    expect(within(openrouter).getByText(/add an openrouter key/i)).toBeVisible();
  });
});

/**
 * Settings grew from one scrolling column into four subjects that have nothing
 * to do with each other — provider keys, appearance, stored data, and version
 * information. Tabs are what stop "change the theme" being a scroll past three
 * provider cards.
 */
describe("SettingsPage — tabs", () => {
  const tab = (name: string | RegExp): HTMLElement =>
    screen.getByRole("tab", { name });

  it("offers one tab per subject", () => {
    setup();

    expect(screen.getAllByRole("tab").map((entry) => entry.textContent)).toEqual([
      "General",
      "AI providers",
      "Data & storage",
      "About",
    ]);
  });

  /**
   * AI providers first would put a wall of key entry in front of someone who
   * came to change the theme. General is the one panel that is safe to land on.
   */
  it("opens on General", () => {
    setup();

    expect(tab("General")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("radio", { name: "Light" })).toBeVisible();
  });

  it("shows only the panel whose tab is selected", async () => {
    const user = userEvent.setup();
    setup();

    expect(screen.queryByRole("region", { name: "Anthropic" })).toBeNull();

    await user.click(tab("AI providers"));

    expect(screen.getByRole("region", { name: "Anthropic" })).toBeVisible();
    expect(screen.queryByRole("radio", { name: "Light" })).toBeNull();
  });

  it("reaches every panel", async () => {
    const user = userEvent.setup();
    setup();

    await user.click(tab("Data & storage"));
    expect(screen.getByText(/Run history database/i)).toBeVisible();

    await user.click(tab("About"));
    expect(screen.getByText(QRE_VERSION)).toBeVisible();
  });

  /** A panel has to say which tab it belongs to, or it is an anonymous div. */
  it("names each panel after its tab", async () => {
    const user = userEvent.setup();
    setup();

    await user.click(tab("AI providers"));

    expect(screen.getByRole("tabpanel", { name: "AI providers" })).toBeVisible();
  });

  /**
   * Arrow keys, not Tab. A tablist is one stop in the page's tab order, and
   * moving between the tabs themselves is the arrow keys' job — otherwise
   * reaching the last panel means four presses through controls nobody wanted.
   */
  it("moves between tabs with the arrow keys", async () => {
    const user = userEvent.setup();
    setup();

    await user.click(tab("General"));
    await user.keyboard("{ArrowRight}");

    expect(tab("AI providers")).toHaveAttribute("aria-selected", "true");
    expect(tab("AI providers")).toHaveFocus();
  });

  it("wraps around at either end", async () => {
    const user = userEvent.setup();
    setup();

    await user.click(tab("General"));
    await user.keyboard("{ArrowLeft}");
    expect(tab("About")).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{ArrowRight}");
    expect(tab("General")).toHaveAttribute("aria-selected", "true");
  });

  /** Only the selected tab is a tab stop; the rest are reached with arrows. */
  it("keeps the tablist to one stop in the page's tab order", () => {
    setup();

    expect(tab("General")).toHaveAttribute("tabindex", "0");
    expect(tab("About")).toHaveAttribute("tabindex", "-1");
  });
});
