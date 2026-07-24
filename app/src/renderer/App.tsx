import { useCallback, useEffect, useState } from "react";

import { InMemoryRunStore } from "../shared/runStore";
import { makeRunRecord, type RunConfig, type RunResult, type RunStore } from "../shared/types";
import { QRE_VERSION } from "./constants/staticOptions";
import { RunHistoryContainer } from "./history/RunHistoryContainer";
import { ResultsPage } from "./results/ResultsPage";
import { RunConfiguration } from "./RunConfiguration";
import { ThemeToggle, type Theme } from "./ThemeToggle";

const THEME_STORAGE_KEY = "qre-theme";

type Page = "config" | "results" | "history" | "comparison";

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
];

export function App() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [activePage, setActivePage] = useState<Page>("config");

  // The single shared run store: created empty, populated as runs finish. The
  // History/Comparison surfaces read from it; the Run flow saves into it.
  const [store] = useState<RunStore>(() => new InMemoryRunStore());
  const [latestRun, setLatestRun] = useState<{ config: RunConfig; result: RunResult } | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const handleRunComplete = useCallback(
    (config: RunConfig, result: RunResult): void => {
      setLatestRun({ config, result });
      try {
        const record = makeRunRecord(config, result, new Date().toISOString());
        // Fire-and-forget; a duplicate id (same run re-reported) is harmless.
        void store.save(record).catch(() => undefined);
      } catch {
        // Mismatched (config, result) pair — defensive; not expected in practice.
      }
    },
    [store],
  );

  // History and Comparison are two views of the same store instance, so a
  // selection made in History carries into Comparison. Remounting on view
  // change is avoided by keying on "history-comparison" (stable).
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
        <ThemeToggle theme={theme} onToggle={() => setTheme((current) => (current === "dark" ? "light" : "dark"))} />
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
            <RunConfiguration onRunComplete={handleRunComplete} />
          ) : null}
          {activePage === "results" ? (
            <ResultsPage latestRun={latestRun} onRunEstimation={() => setActivePage("config")} />
          ) : null}
          {showHistorySurface ? (
            <RunHistoryContainer
              store={store}
              view={activePage === "comparison" ? "comparison" : "history"}
              onViewChange={setActivePage}
              onNavigateToConfig={() => setActivePage("config")}
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
