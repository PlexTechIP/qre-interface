import { useEffect, useMemo, useState } from "react";
import { ResultsArea } from "./results/ResultsArea";
import { DEFAULT_FIXTURE_SCENARIO, FIXTURE_SCENARIOS, type FixtureScenarioId } from "./results/fixtures";
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
  const [scenarioId, setScenarioId] = useState<FixtureScenarioId>("idle");
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const selectedScenario = useMemo(
    () => FIXTURE_SCENARIOS.find((scenario) => scenario.id === scenarioId) ?? DEFAULT_FIXTURE_SCENARIO,
    [scenarioId],
  );

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
            <span>Run Configuration</span>
            <span className="active">Results</span>
            <span>Run History</span>
            <span>Comparison</span>
          </nav>
        </aside>

        <section className="workspace">
          <div className="fixture-toolbar">
            <label htmlFor="fixture-scenario">Fixture scenario</label>
            <select
              id="fixture-scenario"
              value={scenarioId}
              onChange={(event) => setScenarioId(event.target.value as FixtureScenarioId)}
            >
              {FIXTURE_SCENARIOS.map((scenario) => (
                <option key={scenario.id} value={scenario.id}>
                  {scenario.label}
                </option>
              ))}
            </select>
          </div>

          <ResultsArea
            phase={selectedScenario.phase}
            result={selectedScenario.result}
            config={selectedScenario.config}
          />
        </section>
      </main>
    </div>
  );
}
