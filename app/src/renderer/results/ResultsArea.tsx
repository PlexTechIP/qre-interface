import { useEffect, useState } from "react";
import type { ResultsAreaProps } from "../../shared/types";
import { ConfigSummary } from "./ConfigSummary";
import { FieldFilter } from "./FieldFilter";
import { formatMetric } from "./formatMetric";
import { FrontierScatter } from "./FrontierScatter";
import { FrontierTable } from "./FrontierTable";
import { RawExplorer } from "./RawExplorer";
import { getAdditionalFieldDefinitions } from "./resultFields";
import { SelectedRowDetail } from "./SelectedRowDetail";

export function ResultsArea({ result, phase, config = null }: ResultsAreaProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  // Field-filter selections deliberately persist across result switches this session (SOW Part 1.7)
  // — never reset this alongside selectedIndex.
  const [hiddenAdditionalKeys, setHiddenAdditionalKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSelectedIndex(0);
  }, [result?.runId]);

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
            Try adjusting the run configuration, then rerun the estimate. Engine diagnostics, when the engine
            produced any, are available below in the raw output explorer.
          </p>
        </div>
        <RawExplorer raw={result.raw} />
      </section>
    );
  }

  const frontierRows = result.frontier ?? [];
  const frontierCount = frontierRows.length;
  const safeSelectedIndex = frontierCount > 0 ? Math.min(selectedIndex, frontierCount - 1) : 0;
  const selectedRow = frontierRows[safeSelectedIndex] ?? null;
  const selectedRowNumber = safeSelectedIndex + 1;
  const selectedRowAnnouncement = `Selected row ${selectedRowNumber} of ${frontierCount}`;

  const additionalFieldDefinitions = getAdditionalFieldDefinitions(frontierRows);
  const visibleAdditionalFields = additionalFieldDefinitions.filter(
    (field) => !hiddenAdditionalKeys.has(field.key),
  );

  const toggleAdditionalField = (key: string) => {
    setHiddenAdditionalKeys((previous) => {
      const next = new Set(previous);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const showAllFields = () => {
    setHiddenAdditionalKeys((previous) => {
      const next = new Set(previous);
      additionalFieldDefinitions.forEach((field) => next.delete(field.key));
      return next;
    });
  };

  const showDefaultsOnly = () => {
    setHiddenAdditionalKeys((previous) => {
      const next = new Set(previous);
      additionalFieldDefinitions.forEach((field) => next.add(field.key));
      return next;
    });
  };

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
        <MetricCard label="Physical Qubits" value={formatMetric(selectedRow?.physicalQubits)} />
        <MetricCard label="Runtime" value={formatMetric(selectedRow?.runtime)} />
        <MetricCard label="Total Error" value={formatMetric(selectedRow?.totalError)} />
        <MetricCard label="Factories" value={formatMetric(selectedRow?.factories)} />
        <MetricCard label="Code Distance" value={formatMetric(selectedRow?.codeDistance)} />
        <MetricCard label="Logical Cycle Time" value={formatMetric(selectedRow?.logicalCycleTime)} />
      </div>

      <div className="foundation-grid">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Frontier Configurations</h2>
              <p>Selected row represents this run in History & Comparison.</p>
            </div>
            {additionalFieldDefinitions.length > 0 ? (
              <button
                type="button"
                className="filter-toggle"
                aria-expanded={isFilterOpen}
                aria-controls="field-filter-panel"
                onClick={() => setIsFilterOpen((open) => !open)}
              >
                Filter fields ({visibleAdditionalFields.length}/{additionalFieldDefinitions.length} extra shown)
                <span aria-hidden="true">{isFilterOpen ? "▲" : "▼"}</span>
              </button>
            ) : (
              <span className="muted">6 default fields shown — this run reported no extra fields</span>
            )}
          </div>
          {isFilterOpen && additionalFieldDefinitions.length > 0 ? (
            <FieldFilter
              id="field-filter-panel"
              fields={additionalFieldDefinitions}
              hiddenKeys={hiddenAdditionalKeys}
              onToggle={toggleAdditionalField}
              onShowAll={showAllFields}
              onShowDefaultsOnly={showDefaultsOnly}
            />
          ) : null}
          <FrontierTable
            rows={frontierRows}
            selectedIndex={safeSelectedIndex}
            onSelect={setSelectedIndex}
            additionalFields={visibleAdditionalFields}
          />
          <p className="sr-only" aria-live="polite">
            {selectedRowAnnouncement}
          </p>
        </section>

        <section className="panel">
          <h2>Qubits vs. Runtime</h2>
          <p className="chart-help">Click or focus a point to select its matching table row.</p>
          <FrontierScatter rows={frontierRows} selectedIndex={safeSelectedIndex} onSelect={setSelectedIndex} />
        </section>
      </div>

      {selectedRow ? (
        <SelectedRowDetail
          row={selectedRow}
          rowNumber={selectedRowNumber}
          hiddenAdditionalKeys={hiddenAdditionalKeys}
        />
      ) : null}
      <ConfigSummary config={config} qreVersion={result.qreVersion} />
      <RawExplorer raw={result.raw} />
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
