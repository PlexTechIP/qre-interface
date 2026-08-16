// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { AgentProviderStatus, AgentService } from "../../shared/agentTypes";
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
    /** `null` stands for "no preload bridge", which is a real shipped case. */
    appInfo?: AppInfoService | null;
  } = {},
) {
  const chats = overrides.chats ?? new InMemoryChatStore();
  const appInfo =
    overrides.appInfo === undefined ? fakeAppInfoService() : overrides.appInfo;
  const service = { ...fakeAgentService(), ...overrides.service };
  const onSelectionChange = vi.fn();
  const onCredentialConfigured = vi.fn();
  const onCredentialCleared = vi.fn();
  const onConversationsCleared = vi.fn();
  const onThemePreferenceChange = vi.fn();

  render(
    <SettingsPage
      service={service}
      status={overrides.status ?? CONFIGURED}
      chats={chats}
      appInfo={appInfo ?? undefined}
      provider="anthropic"
      model="claude-sonnet-5"
      onSelectionChange={onSelectionChange}
      onCredentialConfigured={onCredentialConfigured}
      onCredentialCleared={onCredentialCleared}
      onConversationsCleared={onConversationsCleared}
      themePreference={overrides.themePreference ?? "light"}
      onThemePreferenceChange={onThemePreferenceChange}
    />,
  );

  return {
    chats,
    onSelectionChange,
    onCredentialConfigured,
    onCredentialCleared,
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
      setup();
      expect(screen.getByRole("region", { name: "Anthropic" })).toBeVisible();
      expect(screen.getByRole("region", { name: "OpenAI" })).toBeVisible();
    });

    it("reports each provider's key state independently", () => {
      setup();
      const anthropic = screen.getByRole("region", { name: "Anthropic" });
      const openai = screen.getByRole("region", { name: "OpenAI" });
      expect(within(anthropic).getByText("Configured")).toBeVisible();
      expect(within(openai).getByText("Not configured")).toBeVisible();
    });

    it("changes the active provider and model together", async () => {
      const user = userEvent.setup();
      const { onSelectionChange } = setup();

      await user.selectOptions(screen.getByLabelText("Provider"), "openai");

      expect(onSelectionChange).toHaveBeenCalledWith("openai", "gpt-5.6-terra");
    });

    it("tells the shell which provider was configured, not merely that something changed", async () => {
      const user = userEvent.setup();
      const configureCredential = vi.fn(async () => ({ ok: true as const }));
      const { onCredentialConfigured } = setup({ service: { configureCredential } });

      const openai = screen.getByRole("region", { name: "OpenAI" });
      await user.type(within(openai).getByLabelText("OpenAI API key"), "sk-openai-value");
      await user.click(within(openai).getByRole("button", { name: /validate and save/i }));

      expect(configureCredential).toHaveBeenCalledWith("openai", "sk-openai-value");
      expect(onCredentialConfigured).toHaveBeenCalledWith("openai");
    });

    it("tells the shell when a key is removed", async () => {
      const user = userEvent.setup();
      const clearCredential = vi.fn(async () => ({ ok: true as const }));
      const { onCredentialCleared } = setup({ service: { clearCredential } });

      const anthropic = screen.getByRole("region", { name: "Anthropic" });
      await user.click(within(anthropic).getByRole("button", { name: "Remove key" }));
      await user.click(within(anthropic).getByRole("button", { name: "Remove Anthropic key" }));

      expect(onCredentialCleared).toHaveBeenCalledWith("anthropic");
    });

    it("says plainly when nothing is configured yet", () => {
      setup({ status: UNCONFIGURED });
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
      setup({ chats });

      await user.click(screen.getByRole("button", { name: "Delete all conversations" }));

      expect(await chats.list()).toHaveLength(1);
      expect(screen.getByRole("button", { name: "Yes, delete everything" })).toBeVisible();
    });

    it("deletes every conversation once confirmed", async () => {
      const user = userEvent.setup();
      const chats = new InMemoryChatStore();
      await chats.create({ id: "c-1", title: "Goodbye", createdAt: new Date().toISOString() });
      setup({ chats });

      await user.click(screen.getByRole("button", { name: "Delete all conversations" }));
      await user.click(screen.getByRole("button", { name: "Yes, delete everything" }));

      expect(await screen.findByRole("status")).toHaveTextContent(/conversations were deleted/i);
      expect(await chats.list()).toHaveLength(0);
    });

    it("backs out cleanly", async () => {
      const user = userEvent.setup();
      const chats = new InMemoryChatStore();
      await chats.create({ id: "c-1", title: "Keep me", createdAt: new Date().toISOString() });
      setup({ chats });

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
      const { onConversationsCleared } = setup({ chats });

      await user.click(screen.getByRole("button", { name: "Delete all conversations" }));
      await user.click(screen.getByRole("button", { name: "Yes, delete everything" }));

      await waitFor(() => expect(onConversationsCleared).toHaveBeenCalledOnce());
    });

    it("leaves the open conversation alone when the delete fails", async () => {
      const user = userEvent.setup();
      const chats = new InMemoryChatStore();
      vi.spyOn(chats, "clear").mockRejectedValue(new Error("database is locked"));
      const { onConversationsCleared } = setup({ chats });

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
      setup({ chats });

      await user.click(screen.getByRole("button", { name: "Delete all conversations" }));
      await user.click(screen.getByRole("button", { name: "Yes, delete everything" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(/database is locked/i);
    });
  });

  describe("About", () => {
    it("reports the bundled QRE engine version", () => {
      setup();
      expect(screen.getByText(QRE_VERSION)).toBeVisible();
    });
  });

  /**
   * "Where is my data?" is the first question in any bug report from an
   * analyst, and until now the app could not answer it anywhere.
   */
  describe("Storage locations", () => {
    it("shows where each database lives", async () => {
      setup();

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
      setup({ appInfo: fakeAppInfoService({ onReveal: (id) => revealed.push(id) }) });

      const buttons = await screen.findAllByRole("button", { name: "Show in folder" });
      await user.click(buttons[0]!);

      expect(revealed).toEqual(["runDatabase"]);
    });

    it("surfaces a folder that would not open", async () => {
      const user = userEvent.setup();
      setup({
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
      setup({ appInfo: null });

      expect(await screen.findByRole("heading", { name: "Data & storage" })).toBeVisible();
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
      // The rest of the page is still standing.
      expect(screen.getByRole("region", { name: "Anthropic" })).toBeVisible();
    });

    /**
     * An empty list and a failed read render identically otherwise: a section
     * that says these files exist, then lists none.
     */
    it("says so when the paths could not be read", async () => {
      setup({
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
