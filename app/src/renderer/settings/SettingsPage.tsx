import { useEffect, useId, useState } from "react";

import type {
  AgentProviderStatus,
  AgentService,
  ProviderId,
} from "../../shared/agentTypes";
import {
  isStorageLocationId,
  type AppInfoService,
  type StorageLocation,
  type StorageLocationId,
  type McpSetup,
} from "../../shared/appInfoTypes";
import type { ChatStore } from "../../shared/chatTypes";
import { ProviderModelSelect } from "../components/ProviderModelSelect";
import { CopyButton } from "../CopyButton";
import { QRE_VERSION } from "../constants/staticOptions";
import type { ThemePreference } from "../theme";
import { ModelCatalogPanel } from "./ModelCatalogPanel";
import { ProviderKeyCard } from "./ProviderKeyCard";
import { SettingsTabs, type SettingsTab } from "./SettingsTabs";

interface SettingsPageProps {
  service: Pick<AgentService, "configureCredential" | "clearCredential" | "refreshCatalog">;
  status: AgentProviderStatus;
  /** Reaches the chat database and never a provider. */
  chats: ChatStore;
  /**
   * Absent outside Electron, where there is no preload bridge to ask.
   * Explicitly `| undefined` because the shell passes `window.appInfo`
   * straight through and `exactOptionalPropertyTypes` distinguishes "omitted"
   * from "present and undefined".
   */
  appInfo?: AppInfoService | undefined;
  provider: ProviderId;
  model: string;
  onSelectionChange: (provider: ProviderId, model: string) => void;
  onCredentialConfigured: (provider: ProviderId) => void;
  onCredentialCleared: (provider: ProviderId) => void;
  /**
   * A provider's model catalogue was re-fetched.
   *
   * Separate from the credential callbacks even though the shell answers all
   * three by re-reading status: a refresh changes which models exist, not
   * whether a provider is usable, so a shell that later wants to react
   * differently to the two is not forced to unpick one callback.
   */
  onCatalogRefreshed: () => void;
  /**
   * Every conversation was deleted.
   *
   * The shell owns which conversation is open, and it has just been deleted
   * out from under it. Without this the id survives the delete, `send` takes
   * its "append to the open conversation" branch, and the store rejects an
   * append to a row that no longer exists — so the analyst's next message,
   * and every one after it, fails to save.
   */
  onConversationsCleared: () => void;
  themePreference: ThemePreference;
  onThemePreferenceChange: (preference: ThemePreference) => void;
  /**
   * Which section is open, and how to change it.
   *
   * Held by the shell because this page unmounts on every sidebar click — a
   * selection kept here sent the analyst back to General each time they looked
   * at something else and came back.
   */
  activeTab: number;
  onActiveTabChange: (index: number) => void;
}

/** Labels, in the order they are offered. */
const THEME_CHOICES: readonly { value: ThemePreference; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

/**
 * Copy for each stored file. Kept in the renderer rather than sent from main:
 * main knows where the files are, the UI decides what to call them.
 */
const STORAGE_COPY: Record<
  StorageLocationId,
  { label: string; description: string; envVar: string }
> = {
  runDatabase: {
    label: "Run history database",
    description: "Every saved estimation run and its results.",
    envVar: "QRE_DB_PATH",
  },
  chatDatabase: {
    label: "Chat history database",
    description: "Conversations from Describe a Run, and nothing else.",
    envVar: "QRE_CHAT_DB_PATH",
  },
};

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Everything that configures the app rather than a run.
 *
 * Before this page the only settings surface was a `<details>` panel folded
 * into the chat page, which meant provider keys were reachable only from the
 * one tab that happened to need them — and invisible to an analyst who had not
 * opened it. Consolidating them here is mostly a move; the one genuine change
 * is that keys are now managed per provider instead of through a single
 * dropdown that also repointed the chat.
 */
/**
 * The clients this panel offers, and how each one is set up.
 *
 * A table rather than four hand-written blocks: every entry is the same shape —
 * a heading, one line of instruction, a copyable string — and writing them out
 * separately is how the fifth one ends up missing its Copy button.
 */
const MCP_CLIENTS: readonly {
  readonly id: string;
  readonly label: string;
  readonly intro: string;
  readonly copyLabel: string;
  readonly value: (setup: McpSetup) => string;
}[] = [
  {
    id: "claude-code",
    label: "Claude Code",
    intro: "Run this once, from any folder.",
    copyLabel: "Copy command",
    value: (setup) => setup.claudeCodeCommand,
  },
  {
    id: "codex",
    label: "Codex CLI",
    intro: "Run this once, from any folder.",
    copyLabel: "Copy command",
    value: (setup) => setup.codexCommand,
  },
  {
    id: "claude-desktop",
    label: "Claude Desktop and other JSON clients",
    intro:
      "Merge this into the client\u2019s configuration file, then restart it.",
    copyLabel: "Copy configuration",
    value: (setup) => setup.configJson,
  },
  {
    id: "codex-toml",
    label: "Codex, by hand",
    intro: "Or add this to ~/.codex/config.toml yourself.",
    copyLabel: "Copy TOML",
    value: (setup) => setup.codexConfigToml,
  },
];

export function SettingsPage({
  service,
  status,
  chats,
  appInfo,
  provider,
  model,
  onSelectionChange,
  onCredentialConfigured,
  onCredentialCleared,
  onCatalogRefreshed,
  onConversationsCleared,
  themePreference,
  onThemePreferenceChange,
  activeTab,
  onActiveTabChange,
}: SettingsPageProps): React.JSX.Element {
  const themeName = useId();
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);
  const [locations, setLocations] = useState<readonly StorageLocation[]>([]);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [revealError, setRevealError] = useState<string | null>(null);
  const [mcpSetup, setMcpSetup] = useState<McpSetup | null>(null);
  const [mcpError, setMcpError] = useState<string | null>(null);

  const anyConfigured = status.providers.some((candidate) => candidate.configured);

  useEffect(() => {
    if (appInfo === undefined) return;
    let current = true;
    void appInfo.getStorage().then(
      (info) => {
        if (!current) return;
        /*
         * Narrowed, because this crossed IPC.
         *
         * `location.id` types as StorageLocationId but arrives as whatever
         * main sent, and it indexes STORAGE_COPY directly below. An id this
         * build has no copy for — a database added to main without a label
         * here, or a packaged build whose main bundle is newer than this one —
         * would make that lookup undefined and throw inside render, taking the
         * provider-key cards down along with the paths.
         */
        setLocations(info.locations.filter((entry) => isStorageLocationId(entry.id)));
        setStorageError(null);
      },
      (caught: unknown) => {
        // An empty list renders identically to a successful read that found
        // nothing: a section claiming these files exist, then listing none.
        if (!current) return;
        setLocations([]);
        setStorageError(describeError(caught));
      },
    );
    return () => {
      current = false;
    };
  }, [appInfo]);

  useEffect(() => {
    if (appInfo === undefined) return;
    let current = true;
    void appInfo.getMcpSetup().then(
      (setup) => {
        if (!current) return;
        setMcpSetup(setup);
        setMcpError(null);
      },
      (caught: unknown) => {
        // Same reason the storage read reports rather than renders empty: a
        // blank block looks like "there is nothing to connect", which is a
        // different and wrong answer.
        if (!current) return;
        setMcpSetup(null);
        setMcpError(describeError(caught));
      },
    );
    return () => {
      current = false;
    };
  }, [appInfo]);

  const reveal = async (id: StorageLocationId): Promise<void> => {
    if (appInfo === undefined) return;
    setRevealError(null);
    try {
      const result = await appInfo.reveal(id);
      if (!result.ok) setRevealError(result.message);
    } catch (caught) {
      setRevealError(describeError(caught));
    }
  };

  const clearHistory = async (): Promise<void> => {
    setClearing(true);
    setClearError(null);
    try {
      await chats.clear();
      setCleared(true);
      // Only after the store actually emptied: on a failure the transcripts
      // are still there, and so is the conversation the shell has open.
      onConversationsCleared();
    } catch (caught) {
      // Reporting success here would claim transcripts are gone while they are
      // still on disk — the one failure this control must not paper over.
      setClearError(describeError(caught));
    } finally {
      setConfirmingClear(false);
      setClearing(false);
    }
  };

  const TABS: readonly SettingsTab[] = [
    {
      id: "general",
      label: "General",
      panel: (
        <>
          <section className="form-section">
            <h2 className="form-section__title">Appearance</h2>
            <fieldset className="settings-fieldset">
              <legend className="settings-subhead">Theme</legend>
              {THEME_CHOICES.map((choice) => (
                <label key={choice.value} className="settings-radio">
                  <input
                    type="radio"
                    name={themeName}
                    value={choice.value}
                    checked={themePreference === choice.value}
                    onChange={() => onThemePreferenceChange(choice.value)}
                  />
                  <span>{choice.label}</span>
                </label>
              ))}
            </fieldset>
            {themePreference === "system" ? (
              <p className="agent-note settings-note">
                The app matches your operating system and changes with it, including
                while it is open.
              </p>
            ) : null}
          </section>
        </>
      ),
    },
    {
      id: "providers",
      label: "AI providers",
      panel: (
        <>
          <section className="form-section">
            {/*
              No heading here: the tab above says "AI providers" and labels this
              panel through `aria-labelledby`. Repeating it would be a second
              accessible name for one region, and a word the reader has already
              read directly above.
            */}
            <p className="form-section__intro">
              Describe a Run needs a key from one of these providers. Keys are
              validated once, then encrypted by your operating system's key store —
              the app can use a key but can never read one back.
            </p>

            {anyConfigured ? null : (
              <p className="agent-note">
                No provider is configured yet. Add a key below to turn on the
                Describe a Run tab.
              </p>
            )}

            <div className="settings-active-model">
              <h3 className="settings-subhead">Active provider and model</h3>
              <p className="agent-note">
                What Describe a Run sends to next. The same control sits on that page.
              </p>
              <ProviderModelSelect
                providers={status.providers}
                provider={provider}
                model={model}
                onChange={onSelectionChange}
              />
            </div>

            <div className="settings-provider-cards">
              {status.providers.map((candidate) => (
                <ProviderKeyCard
                  key={candidate.provider}
                  provider={candidate.provider}
                  displayName={candidate.displayName}
                  configured={candidate.configured}
                  service={service}
                  onConfigured={onCredentialConfigured}
                  onCleared={onCredentialCleared}
                >
                  {/*
                    Only providers that actually keep a catalogue get the controls
                    for one. The test is `catalog !== undefined`, not the provider's
                    name: main omits the field entirely for providers whose models
                    are pinned, and sends null for one that has a catalogue it has
                    not fetched yet. Checking the name here would put the list of
                    aggregators in two places and let them disagree.
                  */}
                  {candidate.catalog === undefined ? null : (
                    <ModelCatalogPanel
                      provider={candidate.provider}
                      displayName={candidate.displayName}
                      configured={candidate.configured}
                      catalog={candidate.catalog}
                      service={service}
                      onCatalogRefreshed={onCatalogRefreshed}
                    />
                  )}
                </ProviderKeyCard>
              ))}
            </div>
          </section>
        </>
      ),
    },
    {
      id: "mcp",
      label: "MCP Server",
      panel: (
        <section className="form-section">
          <p className="form-section__intro">
            Claude, Codex and other MCP clients can read your saved runs — to
            compare them, explain a failure, or check a configuration before you
            run it. Access is read-only: an agent cannot start a run, change
            one, or write to these files.
          </p>
          <p className="form-section__intro">
            The paths below belong to this installation on this machine, and are
            worked out when the app starts. If you move or update the app, come
            back and copy them again.
          </p>

          {mcpError !== null ? (
            <p className="agent-error" role="alert">
              The connection details could not be read: {mcpError}
            </p>
          ) : null}

          {mcpSetup !== null ? (
            <>
              {mcpSetup.problems.map((problem, index) => (
                // Keyed by position: these are plain sentences with no identity
                // of their own, and two could legitimately read the same.
                <p key={index} className="agent-note">
                  {problem}
                </p>
              ))}

              {MCP_CLIENTS.map((client) => (
                <div key={client.id} className="mcp-client">
                  <h3 className="settings-subhead">{client.label}</h3>
                  <p className="form-section__intro">{client.intro}</p>
                  <div role="group" aria-label={`${client.label} setup`}>
                    <pre className="settings-code">{client.value(mcpSetup)}</pre>
                    <div className="agent-actions">
                      <CopyButton
                        value={client.value(mcpSetup)}
                        label={client.copyLabel}
                        className="agent-secondary"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </>
          ) : null}
        </section>
      ),
    },
    {
      id: "storage",
      label: "Data & storage",
      panel: (
        <>
          <section className="form-section">
            {/*
              Named by its tab — see the AI providers panel. "Chat history"
              below stays, because it is a genuine second subject inside this
              one rather than a repeat of the tab.
            */}
            <p className="form-section__intro">
              Everything this app records lives in these files, on this machine.
              Nothing is uploaded, and you can copy or back them up like any other
              file.
            </p>

            {locations.length > 0 ? (
              <div className="storage-list">
                {locations.map((location) => {
                  const copy = STORAGE_COPY[location.id];
                  return (
                    <div className="storage-row" key={location.id}>
                      <div className="storage-row__head">
                        <h3 className="settings-subhead">{copy.label}</h3>
                        {location.overridden ? (
                          <span className="storage-row__badge">
                            Set by {copy.envVar}
                          </span>
                        ) : null}
                      </div>
                      <p className="storage-row__description">{copy.description}</p>
                      <p className="storage-row__path">{location.path}</p>
                      <div className="agent-actions">
                        <button
                          type="button"
                          className="agent-secondary"
                          onClick={() => void reveal(location.id)}
                        >
                          Show in folder
                        </button>
                        {/*
                          The neighbour's class, not a bespoke one. CopyButton
                          leaves styling to the caller, so a class no rule defines
                          renders it as a bare button beside "Show in folder".
                        */}
                        <CopyButton
                          value={location.path}
                          label="Copy path"
                          className="agent-secondary"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
            {storageError !== null ? (
              <p className="agent-error" role="alert">
                The storage locations could not be read: {storageError}
              </p>
            ) : null}
            {revealError !== null ? (
              <p className="agent-error" role="alert">
                That folder could not be opened: {revealError}
              </p>
            ) : null}

            <h3 className="settings-subhead settings-subhead--spaced">Chat history</h3>
            <p className="form-section__intro">
              Conversations from Describe a Run are stored separately from your run
              history. Deleting them here does not touch saved runs.
            </p>
            <div className="agent-actions">
              {confirmingClear ? (
                <>
                  <button
                    type="button"
                    className="agent-secondary agent-secondary--danger"
                    disabled={clearing}
                    onClick={() => void clearHistory()}
                  >
                    {clearing ? "Deleting…" : "Yes, delete everything"}
                  </button>
                  <button
                    type="button"
                    className="agent-secondary"
                    disabled={clearing}
                    onClick={() => setConfirmingClear(false)}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="agent-secondary"
                  onClick={() => {
                    setCleared(false);
                    setClearError(null);
                    setConfirmingClear(true);
                  }}
                >
                  Delete all conversations
                </button>
              )}
            </div>
            {confirmingClear ? (
              <p className="agent-note">
                Every conversation and every message in it is deleted from this
                machine. This cannot be undone.
              </p>
            ) : null}
            {clearError !== null ? (
              <p className="agent-error" role="alert">
                The chat history could not be deleted: {clearError}
              </p>
            ) : null}
            {cleared ? (
              <p className="agent-success" role="status">
                All conversations were deleted.
              </p>
            ) : null}
          </section>
        </>
      ),
    },
    {
      id: "about",
      label: "About",
      panel: (
        <>
          <section className="form-section">
            {/* Named by its tab — see the AI providers panel. */}
            <dl className="settings-facts">
              <div className="settings-facts__row">
                <dt>QRE engine</dt>
                <dd>{QRE_VERSION}</dd>
              </div>
              <div className="settings-facts__row">
                <dt>Model providers</dt>
                <dd>
                  {status.providers.filter((candidate) => candidate.configured).length} of{" "}
                  {status.providers.length} configured
                </dd>
              </div>
              <div className="settings-facts__row">
                <dt>Networked features</dt>
                <dd>{status.networkEnabled ? "On" : "Off"}</dd>
              </div>
            </dl>
            <p className="agent-note">
              Estimation runs entirely on this machine. The only network requests
              this app makes are the ones Describe a Run sends to the provider you
              configured under AI providers.
            </p>
          </section>
        </>
      ),
    },
  ];

  return (
    <div className="settings-page">
      <header className="run-config__header">
        <h1>Settings</h1>
        <p className="run-config__subtitle">
          Provider keys, appearance, and stored data. Everything here stays on
          this machine.
        </p>
      </header>

      <SettingsTabs tabs={TABS} active={activeTab} onActiveChange={onActiveTabChange} />
    </div>
  );
}
