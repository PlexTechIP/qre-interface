import type { RunConfig, RunResult } from "../../shared/types";
import { ResultsArea } from "./ResultsArea";

interface ResultsPageProps {
  /** The most recent finished run, or null before any run this session. */
  latestRun: { config: RunConfig; result: RunResult } | null;
  /** Navigate to Run Configuration to start an estimate. */
  onRunEstimation: () => void;
}

/**
 * The Results sidebar page. Shows the latest run's result (via Team 2's
 * ResultsArea), or a first-run empty state with a call to action.
 */
export function ResultsPage({ latestRun, onRunEstimation }: ResultsPageProps): React.JSX.Element {
  if (latestRun === null) {
    return (
      <section className="empty-state" aria-labelledby="results-empty-title">
        <div className="empty-icon" aria-hidden="true">
          <ActivityGlyph />
        </div>
        <h1 id="results-empty-title">No results yet</h1>
        <p>Please run an estimation to see results here.</p>
        <button type="button" className="run-button empty-state__cta" onClick={onRunEstimation}>
          Run an Estimation
        </button>
      </section>
    );
  }

  return <ResultsArea phase="done" result={latestRun.result} config={latestRun.config} />;
}

/** Waveform glyph for the empty results state. */
function ActivityGlyph(): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width="40"
      height="40"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M3 12h3.5l2.5-7 4 14 2.5-7H21" />
    </svg>
  );
}
