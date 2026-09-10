import { Fragment, useCallback, useEffect, useRef, useState } from "react";

import type {
  AgentProviderStatus,
  AgentService,
  FormContextEntry,
  ProviderId,
} from "../shared/agentTypes";
import { isModelForProvider, isProviderId, PROVIDER_MODELS } from "../shared/providerModels";
import type { RunConfig, RunRecord, RunResult } from "../shared/types";
import { ChatPage, type ChatView } from "./agent/ChatPage";
import type { DraftHandoff } from "./agent/draftToFormState";
import { QRE_VERSION } from "./constants/staticOptions";
import { RunHistoryContainer } from "./history/RunHistoryContainer";
import type { RerunRequest } from "./history/rerun";
import { ResultsPage } from "./results/ResultsPage";
import type { SelectedRowByRunId } from "./results/selectedRows";
import { describeRunForAgent } from "./agent/agentRunReport";
import { formContextFromState } from "./agent/formContext";
import { Modal } from "./Modal";
import { RunConfiguration, type FormSnapshot } from "./RunConfiguration";
import { SettingsButton } from "./settings/SettingsButton";
import { AI_PROVIDERS_TAB_INDEX, SettingsPage } from "./settings/SettingsPage";
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

/**
 * The model to start a provider on, taken from status rather than the constant.
 *
 * They agree for Anthropic and OpenAI, whose model lists are pinned. They can
 * disagree for OpenRouter: main derives `defaultModel` from the catalogue it
 * fetched, so a shipped default the aggregator has stopped routing is already
 * corrected there. Reading `PROVIDER_MODELS` directly here would reintroduce
 * the stale slug at the one moment the app picks a model for the analyst —
 * their first send would fail on a choice they never made.
 *
 * Falls back to the constant when status has nothing to say, which is the state
 * before the first `getStatus` resolves.
 */
function defaultModelFor(status: AgentProviderStatus, provider: ProviderId): string {
  const known = status.providers.find((candidate) => candidate.provider === provider);
  return known?.defaultModel ?? PROVIDER_MODELS[provider].defaultModel;
}

interface NavItem {
  page: Page;
  label: string;
  icon: React.JSX.Element;
}

const NAV_ITEMS: readonly NavItem[] = [
  { page: "agent", label: "AI Agent", icon: <SparkIcon /> },
  { page: "config", label: "Configure", icon: <TargetIcon /> },
  { page: "results", label: "Results", icon: <ActivityIcon /> },
  { page: "history", label: "Run History", icon: <ClockIcon /> },
  { page: "comparison", label: "Comparison", icon: <BarsIcon /> },
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
  /**
   * The run form as it last stood, mirrored up out of `RunConfiguration`.
   *
   * Two jobs, and neither is possible while the form's state lives only inside
   * a page that unmounts on every sidebar click. It survives navigation, so a
   * half-filled form is still there when the analyst comes back from asking the
   * model about it. And it is what tells the model what they have already
   * decided, so a proposal starts from their work instead of resetting it.
   *
   * A REF, not state. The form reports every keystroke, and holding this in
   * state re-rendered the whole shell — and re-derived the model's form context
   * — on each one. Nothing renders from it directly: it is read at mount to
   * seed the form back, and on demand to describe the form to the model.
   *
   * The page stays authoritative while mounted; this is a mirror, not a lift of
   * the state machinery. Normalisation, provenance and the run flow all stay
   * where they were.
   */
  const formSnapshotRef = useRef<FormSnapshot | null>(null);
  /**
   * Mirror the form up, and retire a handoff once it has been taken up.
   *
   * The retirement is what stops a remount re-seeding the original proposal
   * over the analyst's edits to it: while `draftHandoff` is set, it outranks
   * the restored snapshot, so a round trip to the chat and back used to reset
   * the form. The snapshot carries the draft's provenance forward, so retiring
   * the handoff costs nothing.
   */
  const rememberFormState = useCallback((snapshot: FormSnapshot): void => {
    formSnapshotRef.current = snapshot;
    setDraftHandoff((current) => (current === null ? current : null));
  }, []);

  /**
   * The AI agent's inline configuration editor, owned by the shell.
   *
   * The agent is a separate way to configure a run — a proposal is edited in
   * place on that page rather than on the Configure tab — but the AI agent page
   * unmounts on any sidebar click, so the editor and its edits are held here to
   * survive that. `agentEditorOpen` is what re-renders on open/close;
   * `agentEditorSnapshotRef` holds the live edit WITHOUT re-rendering the shell
   * on every keystroke, and is read back when the editor remounts. Kept wholly
   * separate from the Configure tab's `formSnapshotRef` — two editors, two
   * states.
   */
  const [agentEditorOpen, setAgentEditorOpen] = useState(false);
  const agentEditorSnapshotRef = useRef<FormSnapshot | null>(null);
  const rememberAgentEditorState = useCallback((snapshot: FormSnapshot): void => {
    agentEditorSnapshotRef.current = snapshot;
  }, []);
  const openAgentEditor = useCallback((snapshot: FormSnapshot): void => {
    // Seed from the proposal (or whatever the caller hands in) before the editor
    // mounts and reads the snapshot back.
    agentEditorSnapshotRef.current = snapshot;
    setAgentEditorOpen(true);
  }, []);
  const closeAgentEditor = useCallback((): void => {
    agentEditorSnapshotRef.current = null;
    setAgentEditorOpen(false);
  }, []);

  /**
   * What the analyst has already decided, computed when somebody asks.
   *
   * Handed to the chat page as a function so that page can read it on arrival
   * rather than the shell pushing it down on every keystroke. Stable, so it
   * never invalidates anything downstream.
   */
  const getFormContext = useCallback(
    (): readonly FormContextEntry[] =>
      formSnapshotRef.current === null
        ? []
        : formContextFromState(formSnapshotRef.current.state),
    [],
  );
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
   * Whether the Settings overlay is open, and which section it shows.
   *
   * Settings is a modal layered over whatever page is active rather than a page
   * of its own, so it has its own open/closed flag instead of a value in
   * `activePage`. The tab is held here too because the overlay unmounts on
   * close — a selection kept inside it would send the analyst back to General
   * every time they reopened it.
   */
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState(0);

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
        // Marked as the app's own choice, so the catalogue effect above may
        // correct it later. At this moment an aggregator's catalogue is very
        // likely still cold, which is exactly when `defaultModelFor` can only
        // hand back the shipped constant.
        selectionIsAppChosen.current = true;
        setAgentSelection({ provider, model: defaultModelFor(agentStatus, provider) });
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

  /**
   * A provider's model catalogue was re-fetched.
   *
   * Re-reading status is the whole job: `models` and `defaultModel` for that
   * provider are derived from the catalogue in main, so every picker in the app
   * updates from the one status read rather than from a list this component
   * would otherwise have to hold and pass down.
   */
  const handleCatalogRefreshed = useCallback((): void => {
    refreshAgentStatus();
  }, [refreshAgentStatus]);

  /**
   * Providers whose catalogue this session has already asked for.
   *
   * The shell owns this, not the Settings panel, for two reasons. The panel
   * unmounts on every navigation, so a guard held there retried a failing
   * catalogue on each visit — a ten-second timeout per trip to Settings for
   * anyone offline. And an analyst who never opens Settings would never have
   * got a catalogue at all, leaving the chat page's picker on the shipped
   * shortlist while a perfectly good key sat in the vault.
   */
  const catalogRequested = useRef<Set<ProviderId>>(new Set());

  useEffect(() => {
    for (const candidate of agentStatus.providers) {
      // `null` means "has a catalogue, hasn't fetched one". Absent means the
      // provider has no catalogue to fetch, and a list means it already did.
      if (candidate.catalog !== null || !candidate.configured) continue;
      if (catalogRequested.current.has(candidate.provider)) continue;
      catalogRequested.current.add(candidate.provider);
      void resolvedAgentService.refreshCatalog(candidate.provider).then(
        (result) => {
          if (result.ok) refreshAgentStatus();
        },
        () => {
          // A refresh that cannot even resolve leaves the shipped shortlist in
          // place, which is a working picker. Settings shows the failure when
          // the analyst asks for one there; the app does not need to shout
          // about a background attempt it made on their behalf.
        },
      );
    }
  }, [agentStatus, refreshAgentStatus, resolvedAgentService]);

  /**
   * Whether the model in `agentSelection` was chosen by the app or by a person.
   *
   * Only an app-chosen model may be corrected when a catalogue arrives and
   * contradicts it. The distinction matters because both cases look identical
   * in state: the shell auto-activates a provider on its shipped default when
   * the first key is stored, and at that moment OpenRouter's catalogue is still
   * cold, so the default it picks can be a slug the aggregator does not route.
   * Correcting that is finishing a decision the app made badly. Silently
   * repointing a model the analyst picked is overriding them, so that case
   * stays visible instead — the picker marks it "no longer listed" and a send
   * returns a typed failure naming the fix.
   */
  const selectionIsAppChosen = useRef(false);

  const chooseSelection = useCallback(
    (provider: ProviderId, model: string): void => {
      selectionIsAppChosen.current = false;
      setAgentSelection({ provider, model });
    },
    [],
  );

  useEffect(() => {
    if (!selectionIsAppChosen.current) return;
    const active = agentStatus.providers.find(
      (candidate) => candidate.provider === agentSelection.provider,
    );
    // Only for a fetched catalogue: a pinned provider's `models` is this
    // build's own constant, so disagreeing with it would mean the two halves of
    // one bundle disagree — which is a reject, not something to paper over.
    if (active?.catalog == null) return;
    if (active.models.includes(agentSelection.model)) return;
    setAgentSelection({ provider: active.provider, model: active.defaultModel });
  }, [agentStatus, agentSelection]);

  /**
   * Which conversation authored the run now on the Results page.
   *
   * Keyed by run id rather than held as a bare conversation id, because opening
   * an older run from Run History replaces `latestRun` without replacing this —
   * so the control that leads back to a conversation has to be able to tell
   * whether it belongs to the run actually on screen.
   */
  const [runOrigin, setRunOrigin] = useState<
    { runId: string; conversationId: string } | null
  >(null);

  const handleRunComplete = useCallback(
    (config: RunConfig, result: RunResult, conversationId?: string): void => {
      setDraftHandoff(null);
      // The run has happened; the agent's inline editor has done its job. Closing
      // it means a trip back to the AI agent lands on the conversation — with the
      // composer for follow-ups and the "ask about this run" round trip — rather
      // than on a stale editor for a configuration that has already run.
      closeAgentEditor();
      setLatestRun({ config, result });
      setRunOrigin(
        conversationId === undefined ? null : { runId: config.id, conversationId },
      );
      // Surface the finished run on the Results page (and move the sidebar there).
      setActivePage("results");
    },
    [closeAgentEditor],
  );

  /**
   * The conversation this run can lead back to, or null.
   *
   * Derived once. The same rule was written twice — in the callback and in the
   * prop that decides whether to pass it — so a change to when the control is
   * valid had to be remembered in both places.
   */
  const askAgentTarget =
    runOrigin !== null && runOrigin.runId === latestRun?.config.id ? runOrigin : null;

  /**
   * Take the outcome back to the conversation that proposed it.
   *
   * The message lands in the composer rather than being sent. The analyst owns
   * this conversation — they may want to add what they were actually trying to
   * do, or ask something else entirely — and a message that sent itself would
   * spend a provider request on every failed run whether or not anyone wanted
   * the diagnosis.
   */
  const askAgentAboutRun = useCallback(async (): Promise<void> => {
    if (askAgentTarget === null || latestRun === null) return;

    /*
     * Confirmed present before navigating, rather than trusted.
     *
     * A conversation can be deleted from the rail one at a time, and that path
     * tells the shell only that the ACTIVE conversation changed — never which
     * id went. Checking here covers every deletion route, including ones added
     * later, instead of chasing each one. If the thread is gone the origin goes
     * with it, which takes the control off the Results page rather than leaving
     * it pointing at nothing.
     */
    const conversation = await window.chats.get(askAgentTarget.conversationId);
    if (conversation === null) {
      setRunOrigin(null);
      return;
    }

    setActiveConversationId(askAgentTarget.conversationId);
    /*
     * Appended, never substituted. The composer holds the one piece of
     * user-authored prose in this app that is not yet on disk, and the shell
     * keeps it across navigation precisely so a half-typed thought survives a
     * trip to the form. Overwriting it here would destroy that thought with no
     * warning and no undo.
     */
    const report = describeRunForAgent(latestRun.config, latestRun.result);
    setChatComposer((current) =>
      current.trim().length === 0 ? report : `${current.trimEnd()}\n\n${report}`,
    );
    setActivePage("agent");
  }, [askAgentTarget, latestRun]);

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
              <svg viewBox="0 0 24 24" fill="none" role="img">
                <circle cx="12" cy="12" r="2.1" fill="currentColor" />
                <ellipse
                  cx="12"
                  cy="12"
                  rx="10"
                  ry="4.2"
                  stroke="currentColor"
                  strokeWidth="1.6"
                />
                <ellipse
                  cx="12"
                  cy="12"
                  rx="10"
                  ry="4.2"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  transform="rotate(60 12 12)"
                />
                <ellipse
                  cx="12"
                  cy="12"
                  rx="10"
                  ry="4.2"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  transform="rotate(120 12 12)"
                />
              </svg>
            </span>
            <span>Quantum Resource Estimator</span>
          </div>
          <span className="brand-version" title="Current QRE engine version">
            {QRE_VERSION}
          </span>
        </div>
        <div className="top-header__right">
          {/*
            Settings, and the networked-features indicator, in one control.
            They used to be two — a "Network on · …" badge here and a Settings
            entry in the left nav — which meant the badge reported a state
            whose only fix lived somewhere the badge did not point at.
          */}
          <SettingsButton
            status={agentStatus}
            provider={agentSelection.provider}
            model={agentSelection.model}
            active={settingsOpen}
            onOpen={() => setSettingsOpen(true)}
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
                <Fragment key={item.page}>
                  <button
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
                  {/* Split the two model/config entries from the results-oriented
                      trio with a hairline rule. */}
                  {item.page === "config" ? (
                    <hr className="nav-separator" aria-hidden="true" />
                  ) : null}
                </Fragment>
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
              /*
                Read during render, which is safe for exactly this shape: the
                ref is written only by a child effect, never during a render,
                and the value is consumed only by a mount-time initialiser.
              */
              conversationId={draftHandoff?.conversationId}
              restoredState={formSnapshotRef.current ?? undefined}
              onStateChange={rememberFormState}
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
              onSelectionChange={chooseSelection}
              onOpenSettings={() => setSettingsOpen(true)}
              onOpenProviderSettings={() => {
                setSettingsTab(AI_PROVIDERS_TAB_INDEX);
                setSettingsOpen(true);
              }}
              getFormContext={getFormContext}
              /*
                Running a proposal from the AI agent lands on Results and Run
                History exactly like the Configure tab — the two tabs are
                separate ways to build a run, not separate destinations for it.
              */
              onRunComplete={handleRunComplete}
              /*
                The inline editor lives in the shell so it, and any edits in it,
                survive leaving the AI agent page and coming back. Read during
                render, safe for the same reason `restoredState` below is: the ref
                is written only by a child effect and consumed only at mount.
              */
              editorOpen={agentEditorOpen}
              editorSnapshot={agentEditorSnapshotRef.current ?? undefined}
              onOpenEditor={openAgentEditor}
              onCloseEditor={closeAgentEditor}
              onEditorStateChange={rememberAgentEditorState}
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
              /*
                Offered only for the run actually on screen. Opening an older
                run from History replaces `latestRun` without replacing the
                origin, so without the id check the control would carry the
                wrong run's outcome into a conversation.
              */
              onAskAgent={
                askAgentTarget === null ? undefined : () => void askAgentAboutRun()
              }
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

      {/*
        Settings opens over whatever page is active rather than replacing it, so
        a trip to change a key or the theme no longer unmounts a half-filled form
        or the open conversation underneath. The page keeps its own <h1>, so the
        overlay is headerless and labelled by that heading's text instead of
        stamping a second title above it.
      */}
      {settingsOpen ? (
        <Modal
          ariaLabel="Settings"
          className="modal-settings"
          onClose={() => setSettingsOpen(false)}
        >
          <SettingsPage
            service={resolvedAgentService}
            status={agentStatus}
            chats={window.chats}
            appInfo={window.appInfo}
            provider={agentSelection.provider}
            model={agentSelection.model}
            onSelectionChange={chooseSelection}
            onCredentialConfigured={handleCredentialConfigured}
            onCredentialCleared={handleCredentialCleared}
            onCatalogRefreshed={handleCatalogRefreshed}
            /*
              The open conversation was just deleted. Without this the id
              survives and ChatPage's `send` appends to a row the store no
              longer has, which it rejects — so the next message, and every
              one after it, fails to save.
            */
            onConversationsCleared={() => {
              setActiveConversationId(null);
              // The origin points at a conversation that no longer exists.
              // Left standing, Results keeps offering a way back to it and
              // the analyst lands in a blank thread whose id the store has
              // already forgotten — the next send then fails on append.
              setRunOrigin(null);
            }}
            themePreference={themePreference}
            onThemePreferenceChange={setThemePreference}
            activeTab={settingsTab}
            onActiveTabChange={setSettingsTab}
          />
        </Modal>
      ) : null}
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
