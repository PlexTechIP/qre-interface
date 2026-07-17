import { useEffect, useState } from "react";
import { RunConfiguration } from "./RunConfiguration";
import { ThemeToggle, type Theme } from "./ThemeToggle";

const THEME_STORAGE_KEY = "qre-theme";

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

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

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
            <span className="active">Run Configuration</span>
            <span>Results</span>
            <span>Run History</span>
            <span>Comparison</span>
          </nav>
        </aside>

        <section className="workspace">
          <RunConfiguration />
        </section>
      </main>
    </div>
  );
}
