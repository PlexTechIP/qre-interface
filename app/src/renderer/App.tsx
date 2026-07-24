import { useEffect, useState } from "react";
import { RunConfiguration } from "./RunConfiguration";
import { RunHistoryContainer } from "./history/RunHistoryContainer";
import { ThemeToggle, type Theme } from "./ThemeToggle";

const THEME_STORAGE_KEY = "qre-theme";

/**
 * The four sidebar surfaces. "Run Configuration" and "Results" share the run-flow
 * workspace (results render inline there after a run). "Run History" and
 * "Comparison" are the two views of the injected-store records surface — the same
 * RunHistoryContainer instance, its `view` controlled here so the comparison
 * selection survives switching between them.
 */
type Nav = "config" | "results" | "history" | "comparison";

const NAV_ITEMS: readonly { readonly id: Nav; readonly label: string }[] = [
  { id: "config", label: "Run Configuration" },
  { id: "results", label: "Results" },
  { id: "history", label: "Run History" },
  { id: "comparison", label: "Comparison" },
];

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

export function App() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [nav, setNav] = useState<Nav>("config");

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const showRecords = nav === "history" || nav === "comparison";
  const recordsView = nav === "comparison" ? "comparison" : "history";

  return (
    <div className="app-root">
      <header className="top-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </span>
          <span>Quantum Resource Estimator</span>
        </div>
        <ThemeToggle theme={theme} onToggle={() => setTheme((current) => (current === "dark" ? "light" : "dark"))} />
      </header>

      <main className="app-shell">
        <aside className="sidebar" aria-label="Primary navigation">
          <nav className="nav-list">
            {NAV_ITEMS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                className={nav === id ? "active" : undefined}
                aria-current={nav === id ? "page" : undefined}
                onClick={() => setNav(id)}
              >
                {label}
              </button>
            ))}
          </nav>
        </aside>

        <section className="workspace">
          {showRecords ? (
            <RunHistoryContainer
              store={window.store}
              view={recordsView}
              onViewChange={(view) => setNav(view)}
            />
          ) : (
            <RunConfiguration />
          )}
        </section>
      </main>
    </div>
  );
}
