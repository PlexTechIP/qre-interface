import { useMemo, useState } from "react";
import { ResultsArea } from "./results/ResultsArea";
import { DEFAULT_FIXTURE_SCENARIO, FIXTURE_SCENARIOS, type FixtureScenarioId } from "./results/fixtures";

export function App() {
  const [scenarioId, setScenarioId] = useState<FixtureScenarioId>("idle");
  const selectedScenario = useMemo(
    () => FIXTURE_SCENARIOS.find((scenario) => scenario.id === scenarioId) ?? DEFAULT_FIXTURE_SCENARIO,
    [scenarioId],
  );

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Primary navigation">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </span>
          <span>Quantum Resource Estimator</span>
        </div>
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
  );
}
