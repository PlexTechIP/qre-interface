import type { ResultsAreaProps } from "../../shared/types";
import { formatMetric } from "./formatMetric";

export function ResultsArea({ result, phase, config = null }: ResultsAreaProps) {
  if (phase === "idle" || result === null) {
    return (
      <section className="empty-state" aria-labelledby="results-empty-title">
        <div className="empty-icon" aria-hidden="true">
          ∿
        </div>
        <h1 id="results-empty-title">No results yet</h1>
        <p>Please run an estimation to see results here.</p>
      </section>
    );
  }

  if (phase === "running") {
    return (
      <section className="results-page" aria-labelledby="results-running-title">
        <p className="eyebrow">Results</p>
        <h1 id="results-running-title">Running estimation</h1>
        <div className="state-card" role="status" aria-live="polite">
          <div className="skeleton-line wide" />
          <div className="skeleton-line" />
          <div className="skeleton-grid">
            <span />
            <span />
            <span />
          </div>
        </div>
      </section>
    );
  }

  if (result.status === "failed") {
    return (
      <section className="results-page" aria-labelledby="results-failed-title">
        <p className="eyebrow">Run failed</p>
        <h1 id="results-failed-title">Estimation Results</h1>
        <div className="alert-card" role="alert">
          <strong>{result.error?.code ?? "UNKNOWN_ERROR"}</strong>
          <p>{result.error?.message ?? "The estimator failed without a detailed message."}</p>
          <p className="muted">
            Try adjusting the run configuration, then rerun the estimate. Engine diagnostics will appear in the raw
            output explorer when available.
          </p>
        </div>
      </section>
    );
  }

  const firstRow = result.frontier?.[0] ?? null;
  const frontierCount = result.frontier?.length ?? 0;

  return (
    <section className="results-page" aria-labelledby="results-title">
      <div className="results-header">
        <div>
          <h1 id="results-title">Estimation Results</h1>
          <p className="run-line">
            <span>Run</span>
            <strong>{config?.name ?? result.runId}</strong>
          </p>
        </div>
        <span className="solution-pill">{frontierCount} Pareto-optimal solutions</span>
      </div>

      <div className="metric-grid" aria-label="Default result fields preview">
        <MetricCard label="Physical Qubits" value={formatMetric(firstRow?.physicalQubits)} />
        <MetricCard label="Runtime" value={formatMetric(firstRow?.runtime)} />
        <MetricCard label="Total Error" value={formatMetric(firstRow?.totalError)} />
        <MetricCard label="Factories" value={formatMetric(firstRow?.factories)} />
        <MetricCard label="Code Distance" value={formatMetric(firstRow?.codeDistance)} />
        <MetricCard label="Logical Cycle Time" value={formatMetric(firstRow?.logicalCycleTime)} />
      </div>

      <div className="foundation-grid">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Frontier Configurations</h2>
              <p>Table, filtering, and row selection build on this fixture-backed surface.</p>
            </div>
            <button type="button">Columns 6</button>
          </div>
          <p className="placeholder-copy">
            Foundation branch: the component receives {frontierCount} frontier row{frontierCount === 1 ? "" : "s"} from
            props. The formatted table lands in the next display feature.
          </p>
        </section>

        <section className="panel">
          <h2>Qubits vs. Runtime</h2>
          <p className="placeholder-copy">The hand-rolled scatter graph will consume the same frontier rows.</p>
        </section>
      </div>
    </section>
  );
}

interface MetricCardProps {
  label: string;
  value: string;
}

function MetricCard({ label, value }: MetricCardProps) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}
