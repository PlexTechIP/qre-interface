import { useCallback, useEffect, useState } from "react";

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
import { ThemeToggle, type Theme } from "./ThemeToggle";

const THEME_STORAGE_KEY = "qre-theme";
const AGENT_SELECTION_STORAGE_KEY = "qre-agent-provider-selection";

type Page = "config" | "agent" | "results" | "history" | "comparison";

const UNAVAILABLE_AGENT_STATUS: AgentProviderStatus = {
  available: false,
  networkEnabled: false,
  providers: (Object.entries(PROVIDER_MODELS) as [ProviderId, (typeof PROVIDER_MODELS)[ProviderId]][]).map(
    ([provider, details]) => ({ provider, configured: false, ...details }),
  ),
  mode: "unavailable",
  message: "No model provider is configured. The rest of the app remains available offline.",
};

function getInitialTheme(): Theme {
  const domTheme = document.documentElement.dataset.theme;
  if (domTheme === "light" || domTheme === "dark") {
    return domTheme;
  }

  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark") {
    return stored;
  }

  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
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
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
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

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

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
          <ThemeToggle theme={theme} onToggle={() => setTheme((current) => (current === "dark" ? "light" : "dark"))} />
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
              onCredentialChange={refreshAgentStatus}
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
              exportMode="complete"
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
