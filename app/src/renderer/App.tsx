import { useCallback, useEffect, useRef, useState } from "react";

import type { AgentProviderStatus, AgentService, ProviderId } from "../shared/agentTypes";
import { isModelForProvider, isProviderId, PROVIDER_MODELS } from "../shared/providerModels";
import type { RunConfig, RunRecord, RunResult } from "../shared/types";
import { ChatPage, type ChatView } from "./agent/ChatPage";
import type { DraftHandoff } from "./agent/draftToFormState";
import { NetworkStatus } from "./agent/NetworkStatus";
import { QRE_VERSION } from "./constants/staticOptions";
import { RunHistoryContainer } from "./history/RunHistoryContainer";
import type { RerunRequest } from "./history/rerun";
import { ResultsPage } from "./results/ResultsPage";
import type { SelectedRowByRunId } from "./results/selectedRows";
import { RunConfiguration } from "./RunConfiguration";
import { SettingsPage } from "./settings/SettingsPage";
import {
  DARK_QUERY,
  readStoredPreference,
  resolveTheme,
  systemPrefersDark,
  type ThemePreference,
} from "./theme";
import { ThemeToggle } from "./ThemeToggle";

const THEME_STORAGE_KEY = "qre-theme";
const AGENT_SELECTION_STORAGE_KEY = "qre-agent-provider-selection";

type Page = "config" | "agent" | "results" | "history" | "comparison" | "settings";

const UNAVAILABLE_AGENT_STATUS: AgentProviderStatus = {
  available: false,
  networkEnabled: false,
  providers: (Object.entries(PROVIDER_MODELS) as [ProviderId, (typeof PROVIDER_MODELS)[ProviderId]][]).map(
    ([provider, details]) => ({ provider, configured: false, ...details }),
  ),
  mode: "unavailable",
  message: "No model provider is configured. The rest of the app remains available offline.",
};

/**
 * What was chosen, not what is painted.
 *
 * This deliberately does NOT read `document.documentElement.dataset.theme`
 * the way it used to. That attribute is written by the boot script in
 * index.html and is already RESOLVED, so reading it back could only tell us
 * light or dark — "system" would round-trip to whichever it happened to
 * resolve to at launch, and the option would silently un-set itself.
 */
function getInitialThemePreference(): ThemePreference {
  return readStoredPreference(window.localStorage.getItem(THEME_STORAGE_KEY));
}

function getInitialAgentSelection(): { provider: ProviderId; model: string } {
  const fallback = {
    provider: "anthropic" as const,
    model: PROVIDER_MODELS.anthropic.defaultModel,
  };
  try {
    const stored = JSON.parse(
      window.localStorage.getItem(AGENT_SELECTION_STORAGE_KEY) ?? "null",
    ) as unknown;
    // `isProviderId` rather than `provider in PROVIDER_MODELS`: `in` walks the
    // prototype chain, so a stored value of "constructor" or "toString" would
    // pass and then blow up on the `.models` lookup below.
    if (
      typeof stored === "object" && stored !== null &&
      "provider" in stored && "model" in stored &&
      isProviderId(stored.provider) &&
      isModelForProvider(stored.provider, stored.model)
    ) {
      return { provider: stored.provider, model: stored.model };
    }
  } catch {
    // A malformed non-secret preference must not block the page.
  }
  return fallback;
}

interface NavItem {
  page: Page;
  label: string;
  icon: React.JSX.Element;
}

const NAV_ITEMS: readonly NavItem[] = [
  { page: "config", label: "Run Configuration", icon: <TargetIcon /> },
  { page: "results", label: "Results", icon: <ActivityIcon /> },
  { page: "history", label: "Run History", icon: <ClockIcon /> },
  { page: "comparison", label: "Comparison", icon: <BarsIcon /> },
  { page: "agent", label: "Describe a Run", icon: <SparkIcon /> },
  { page: "settings", label: "Settings", icon: <GearIcon /> },
];

/**
 * The agent seam, in resolution order: an explicitly injected service, then the
 * preload surface. There is no third branch.
 *
 * There used to be — `?? demoAgentService`, a fixture that lived in this tree.
 * `preload.ts` exposes `window.agent` unconditionally, so that branch could
 * never run in Electron and ran only under test, which meant the suite proved
 * out a seam the shipped app never takes. Failing loudly is the whole point:
 * the one configuration this cannot silently paper over is a build where the
 * preload bridge did not load.
 */
export function resolveAgentService(injected?: AgentService): AgentService {
  const service = injected ?? window.agent;
  if (service === undefined) {
    throw new Error(
      "No agent service is available: window.agent is defined by preload in every " +
        "shipped build, so its absence means this renderer is running outside Electron. " +
        "Tests must inject one (see fakeAgentService).",
    );
  }
  return service;
}

export function App({ agentService }: { agentService?: AgentService } = {}) {
  const resolvedAgentService = resolveAgentService(agentService);
  const [themePreference, setThemePreference] = useState<ThemePreference>(
    getInitialThemePreference,
  );
  const [systemDark, setSystemDark] = useState<boolean>(systemPrefersDark);
  const theme = resolveTheme(themePreference, systemDark);
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [activePage, setActivePage] = useState<Page>("config");
  const [agentSelection, setAgentSelection] = useState(getInitialAgentSelection);

  // The most recent finished run, surfaced on the Results page. The Run flow
  // (useRunFlow) already persists every finished run to the real SQLite store
  // over IPC (window.store); here we only capture it for the Results page.
  const [latestRun, setLatestRun] = useState<{ config: RunConfig; result: RunResult } | null>(null);
  // Presentation-only session state: a saved record remains immutable while
  // each run can be represented by the frontier row the user last selected.
  const [selectedRowByRunId, setSelectedRowByRunId] = useState<SelectedRowByRunId>({});
  // A reconstructed config queued by a Rerun, pre-filled into the form.
  const [rerunConfig, setRerunConfig] = useState<RunConfig | null>(null);
  const [agentStatus, setAgentStatus] = useState<AgentProviderStatus>(
    UNAVAILABLE_AGENT_STATUS,
  );
  const [draftHandoff, setDraftHandoff] = useState<DraftHandoff | null>(null);
  /**
   * Which conversation is open, and the unsent text in its composer — held by
   * the shell rather than by the page.
   *
   * Every page here is a conditional render, so `ChatPage` unmounts on any
   * sidebar click and would otherwise take both with it: check a default on Run
   * Configuration, come back, and find no conversation selected and an empty
   * box. That round trip — draft, look at the form, come back and rephrase — is
   * the entire point of the page.
   *
   * The composer text is session state only, deliberately NOT localStorage like
   * the theme and the provider selection beside it, and deliberately not in the
   * chat store either. A SENT message is a record of something that happened
   * and belongs on disk; a half-typed one is a thought in progress, and quitting
   * the app is a reasonable way to abandon it.
   */
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [chatComposer, setChatComposer] = useState("");
  const [chatView, setChatView] = useState<ChatView>("conversation");

  /**
   * Following the system is a subscription, not a reading.
   *
   * Consulting `prefers-color-scheme` once at mount would satisfy every
   * first-paint check and still leave the app light at sunset until the
   * analyst relaunched it — a "follow the system" option that follows it
   * exactly once.
   *
   * Subscribed unconditionally rather than only while the preference is
   * "system": if the OS changed while a theme was pinned, a subscription
   * gated on the preference would hold a stale value and switching back to
   * System would paint the wrong theme until the OS changed again.
   */
  useEffect(() => {
    const query = window.matchMedia?.(DARK_QUERY);
    if (query === undefined) return;
    const onChange = (event: MediaQueryListEvent): void => setSystemDark(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    // The document is painted with the RESOLVED theme; what is stored is the
    // PREFERENCE. Storing `theme` here would turn "system" into whichever it
    // happened to resolve to on the first launch that wrote it.
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, themePreference);
  }, [theme, themePreference]);

  useEffect(() => {
    window.localStorage.setItem(
      AGENT_SELECTION_STORAGE_KEY,
      JSON.stringify(agentSelection),
    );
  }, [agentSelection]);

  // Provider status drives the permanent header indicator, so it is re-read
  // on mount and again whenever a key is stored — the indicator would
  // otherwise keep claiming "off" until the next launch.
  const [agentStatusToken, setAgentStatusToken] = useState(0);
  const refreshAgentStatus = useCallback(() => {
    setAgentStatusToken((token) => token + 1);
  }, []);

  useEffect(() => {
    let current = true;
    void resolvedAgentService.getStatus().then(
      (status) => {
        if (current) setAgentStatus(status);
      },
      () => {
        if (current) setAgentStatus(UNAVAILABLE_AGENT_STATUS);
      },
    );
    return () => {
      current = false;
    };
  }, [resolvedAgentService, agentStatusToken]);

  /**
   * Providers whose key was stored during THIS session.
   *
   * `agentStatus` refreshes over IPC, so between storing a key and the new
   * status arriving it still reports that provider as unconfigured. Deciding
   * the switch below from that snapshot alone meant saving two keys in
   * succession read the second decision against a status that predated the
   * first — so the second save switched away from the provider the first had
   * just made active, which is precisely what the rule below forbids.
   *
   * A ref rather than state: nothing renders from it, and it must be readable
   * by the callback that just wrote to it.
   */
  const configuredSinceMount = useRef<Set<ProviderId>>(new Set());

  /**
   * A key was stored for `provider`.
   *
   * Beyond re-reading status, this decides whether the app should start USING
   * that provider. It should exactly when the active one cannot be used: the
   * default selection is Anthropic, so an analyst whose only key is OpenAI
   * would otherwise add it, return to Describe a Run, and be told again that
   * no key is configured — with the fix sitting in a dropdown they have no
   * reason to suspect.
   */
  const handleCredentialConfigured = useCallback(
    (provider: ProviderId): void => {
      configuredSinceMount.current.add(provider);
      refreshAgentStatus();
      const active = agentSelection.provider;
      // The session's own record first, because `agentStatus` may still
      // predate a key stored moments ago.
      const activeIsConfigured =
        configuredSinceMount.current.has(active) ||
        agentStatus.providers.some(
          (candidate) => candidate.provider === active && candidate.configured,
        );
      // Adding a second key is not a request to switch away from a working one.
      if (!activeIsConfigured && active !== provider) {
        setAgentSelection({ provider, model: PROVIDER_MODELS[provider].defaultModel });
      }
    },
    [agentStatus, agentSelection.provider, refreshAgentStatus],
  );

  /** A key was deleted, so this session's record of it has to go too. */
  const handleCredentialCleared = useCallback(
    (provider: ProviderId): void => {
      configuredSinceMount.current.delete(provider);
      refreshAgentStatus();
    },
    [refreshAgentStatus],
  );

  const handleRunComplete = useCallback((config: RunConfig, result: RunResult): void => {
    setDraftHandoff(null);
    setLatestRun({ config, result });
    // Surface the finished run on the Results page (and move the sidebar there).
    setActivePage("results");
  }, []);

  // Opening a saved run from History shows it on the Results page too, so the
  // sidebar always reflects where the run detail is displayed.
  const handleViewRun = useCallback((record: RunRecord): void => {
    setLatestRun({ config: record.config, result: record.result });
    setActivePage("results");
  }, []);

  const handleSelectedRowChange = useCallback((runId: string, selectedIndex: number): void => {
    setSelectedRowByRunId((previous) =>
      previous[runId] === selectedIndex
        ? previous
        : { ...previous, [runId]: selectedIndex },
    );
  }, []);

  const handleRerunRequest = useCallback(
    ({ config }: RerunRequest): void => {
      // `config.name` already carries the incrementing "(n)" rerun suffix from
      // createRerunRequest, so the shell just uses it verbatim.
      setRerunConfig(config);
      setDraftHandoff(null);
      setActivePage("config");
    },
    [],
  );

  // History and Comparison are two views of the same store, so a selection made
  // in History carries into Comparison.
  const showHistorySurface = activePage === "history" || activePage === "comparison";

  return (
    <div className="app-root">
      <header className="top-header">
        <div className="top-header__left">
          <button
            type="button"
            className="nav-toggle"
            aria-label={navCollapsed ? "Expand navigation" : "Collapse navigation"}
            aria-expanded={!navCollapsed}
            onClick={() => setNavCollapsed((collapsed) => !collapsed)}
          >
            <HamburgerIcon />
          </button>
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
            </span>
            <span>Quantum Resource Estimator</span>
          </div>
          <span className="brand-version" title="Current QRE engine version">
            {QRE_VERSION}
          </span>
        </div>
        <div className="top-header__right">
          <NetworkStatus
            status={agentStatus}
            provider={agentSelection.provider}
            model={agentSelection.model}
          />
          {/*
            A quick binary override. It pins the opposite of what is CURRENTLY
            PAINTED, which is the only thing it can offer while following the
            system — "system" is not a theme you can toggle to. Getting back to
            following it is a deliberate trip to Settings, and the button's
            tooltip says as much before it is pressed.
          */}
          <ThemeToggle
            theme={theme}
            preference={themePreference}
            onToggle={() => setThemePreference(theme === "dark" ? "light" : "dark")}
          />
        </div>
      </header>

      <main className={`app-shell${navCollapsed ? " app-shell--collapsed" : ""}`}>
        <aside className="sidebar" aria-label="Primary navigation">
          <nav className="nav-list">
            {NAV_ITEMS.map((item) => {
              const active = item.page === activePage;
              return (
                <button
                  key={item.page}
                  type="button"
                  className={`nav-item${active ? " nav-item--active" : ""}`}
                  title={item.label}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setActivePage(item.page)}
                >
                  <span className="nav-item__icon" aria-hidden="true">
                    {item.icon}
                  </span>
                  <span className="nav-item__label">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        <section className="workspace">
          {activePage === "config" ? (
            <RunConfiguration
              onRunComplete={handleRunComplete}
              initialConfig={rerunConfig}
              initialDraft={draftHandoff?.state}
              provenance={draftHandoff?.provenance}
              proposed={draftHandoff?.proposed}
            />
          ) : null}
          {activePage === "agent" ? (
            <ChatPage
              service={resolvedAgentService}
              store={window.chats}
              status={agentStatus}
              provider={agentSelection.provider}
              model={agentSelection.model}
              activeConversationId={activeConversationId}
              onActiveConversationChange={setActiveConversationId}
              composer={chatComposer}
              onComposerChange={setChatComposer}
              view={chatView}
              onViewChange={setChatView}
              onSelectionChange={(provider, model) => setAgentSelection({ provider, model })}
              onOpenSettings={() => setActivePage("settings")}
              onReviewDraft={(handoff) => {
                setRerunConfig(null);
                setDraftHandoff(handoff);
                setActivePage("config");
              }}
            />
          ) : null}
          {activePage === "results" ? (
            <ResultsPage
              latestRun={latestRun}
              onRunEstimation={() => setActivePage("config")}
              selectedIndex={
                latestRun ? (selectedRowByRunId[latestRun.result.runId] ?? 0) : 0
              }
              onSelectedIndexChange={(selectedIndex) => {
                if (latestRun) {
                  handleSelectedRowChange(latestRun.result.runId, selectedIndex);
                }
              }}
              store={window.store}
              onRerunRequest={handleRerunRequest}
            />
          ) : null}
          {activePage === "settings" ? (
            <SettingsPage
              service={resolvedAgentService}
              status={agentStatus}
              chats={window.chats}
              appInfo={window.appInfo}
              provider={agentSelection.provider}
              model={agentSelection.model}
              onSelectionChange={(provider, model) => setAgentSelection({ provider, model })}
              onCredentialConfigured={handleCredentialConfigured}
              onCredentialCleared={handleCredentialCleared}
              /*
                The open conversation was just deleted. Without this the id
                survives and ChatPage's `send` appends to a row the store no
                longer has, which it rejects — so the next message, and every
                one after it, fails to save.
              */
              onConversationsCleared={() => setActiveConversationId(null)}
              themePreference={themePreference}
              onThemePreferenceChange={setThemePreference}
            />
          ) : null}
          {showHistorySurface ? (
            <RunHistoryContainer
              store={window.store}
              view={activePage === "comparison" ? "comparison" : "history"}
              onViewChange={setActivePage}
              onNavigateToConfig={() => setActivePage("config")}
              onViewRun={handleViewRun}
              selectedRowByRunId={selectedRowByRunId}
              onSelectedRowChange={handleSelectedRowChange}
              onRerunRequest={handleRerunRequest}
            />
          ) : null}
        </section>
      </main>
    </div>
  );
}

/** Common wrapper for the line-style nav/header icons (stroke = currentColor). */
function Icon({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

function HamburgerIcon(): React.JSX.Element {
  return (
    <Icon>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Icon>
  );
}

/** Run Configuration — a "scope"/target glyph, matching the prototype's (o). */
function TargetIcon(): React.JSX.Element {
  return (
    <Icon>
      <circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none" />
      <path d="M7.5 6a8 8 0 0 0 0 12M16.5 6a8 8 0 0 1 0 12" />
    </Icon>
  );
}

function ActivityIcon(): React.JSX.Element {
  return (
    <Icon>
      <path d="M3 12h3.5l2.5-7 4 14 2.5-7H21" />
    </Icon>
  );
}

function SparkIcon(): React.JSX.Element {
  return (
    <Icon>
      <path d="m12 3 1.3 4.2L17.5 9l-4.2 1.7L12 15l-1.3-4.3L6.5 9l4.2-1.8L12 3Z" />
      <path d="m18.5 14 .7 2.3 2.3.7-2.3.8-.7 2.2-.8-2.2-2.2-.8 2.2-.7.8-2.3Z" />
    </Icon>
  );
}

function ClockIcon(): React.JSX.Element {
  return (
    <Icon>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 1.8" />
    </Icon>
  );
}

function BarsIcon(): React.JSX.Element {
  return (
    <Icon>
      <path d="M6 20v-6M12 20V6M18 20v-9" />
    </Icon>
  );
}

function GearIcon(): React.JSX.Element {
  return (
    <Icon>
      <circle cx="12" cy="12" r="3.1" />
      <path d="M12 2.8v2.4M12 18.8v2.4M4.5 4.5l1.7 1.7M17.8 17.8l1.7 1.7M2.8 12h2.4M18.8 12h2.4M4.5 19.5l1.7-1.7M17.8 6.2l1.7-1.7" />
    </Icon>
  );
}
