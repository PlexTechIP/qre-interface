import { useEffect, useState } from "react";
import type { ResultsAreaProps } from "../../shared/types";
import { ConfigSummary } from "./ConfigSummary";
import { FieldFilter } from "./FieldFilter";
import { formatMetric } from "./formatMetric";
import { FrontierScatter } from "./FrontierScatter";
import { FrontierTable } from "./FrontierTable";
import { RawExplorer } from "./RawExplorer";
import {
  DEFAULT_FIELD_DEFINITIONS,
  getAdditionalFieldDefinitions,
  getDefaultMetric,
} from "./resultFields";
import { resolveSelectedFrontierRow } from "./selectedRows";
import { SelectedRowDetail } from "./SelectedRowDetail";
import { DefinitionTip, definitionId } from "../components/DefinitionTip";

interface ResultsAreaViewProps extends ResultsAreaProps {
  onConfigure?: () => void;
  /** App-owned representative row for this run; omit for standalone local selection. */
  selectedIndex?: number;
  /** Persists a row choice in app-level session state when supplied. */
  onSelectedIndexChange?: (index: number) => void;
}

export function ResultsArea({
  result,
  phase,
  config = null,
  onConfigure,
  selectedIndex: controlledSelectedIndex,
  onSelectedIndexChange,
}: ResultsAreaViewProps) {
  const [localSelectedIndex, setLocalSelectedIndex] = useState(0);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  // Field-filter selections deliberately persist across result switches this session (SOW Part 1.7)
  // — never reset this alongside selectedIndex.
  const [hiddenAdditionalKeys, setHiddenAdditionalKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    setLocalSelectedIndex(0);
  }, [result?.runId]);

  const selectedIndex = controlledSelectedIndex ?? localSelectedIndex;
  const selectRow = (index: number) => {
    if (controlledSelectedIndex === undefined) {
      setLocalSelectedIndex(index);
    }
    onSelectedIndexChange?.(index);
  };

  // Check the running phase first: while running, `result` is null by design,
  // so the empty-state guard below must not swallow it (otherwise the results
  // surface flashes "No results yet" for the whole run).
  if (phase === "running") {
    return (
      <section className="results-page" aria-labelledby="results-running-title">
        <p className="eyebrow">Results</p>
        <h1 id="results-running-title">Running estimation</h1>
        <div className="state-card" role="status" aria-live="polite">
          <strong>Exploring candidate hardware configurations…</strong>
          <p className="muted">
            Complex benchmarks can take up to a minute. Results will appear here
            automatically.
          </p>
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

  if (phase === "idle" || result === null) {
    return (
      <section className="empty-state" aria-labelledby="results-empty-title">
        <div className="empty-icon" aria-hidden="true">
          ∿
        </div>
        <h1 id="results-empty-title">No results yet</h1>
        <p>Please run an estimation to see results here.</p>
        {onConfigure ? (
          <button type="button" className="run-button" onClick={onConfigure}>
            Configure a run
          </button>
        ) : null}
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
  const selected = resolveSelectedFrontierRow(result, selectedIndex);
  const safeSelectedIndex = selected.index;
  const selectedRow = selected.row;
  const selectedRowNumber = safeSelectedIndex + 1;
  const selectedRowAnnouncement = `Selected row ${selectedRowNumber} of ${frontierCount}`;

  // A run can succeed yet report no feasible frontier points. Give that its own
  // explicit state rather than rendering "0 solutions" over an empty table/chart.
  if (frontierCount === 0) {
    return (
      <section className="results-page" aria-labelledby="results-empty-frontier-title">
        <p className="eyebrow">Results</p>
        <h1 id="results-empty-frontier-title">Estimation Results</h1>
        <div className="state-card" role="status">
          <strong>This run succeeded but produced no Pareto-frontier points.</strong>
          <p className="muted">
            The engine found no feasible configuration for these inputs. Try
            relaxing the maximum error or adjusting the architecture, then rerun.
          </p>
        </div>
        <ConfigSummary config={config} />
        <RawExplorer raw={result.raw} />
      </section>
    );
  }

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
        <span className="solution-pill">
          {frontierCount} Pareto-optimal solution{frontierCount === 1 ? "" : "s"}
        </span>
      </div>

      <div className="metric-grid" aria-label="Default result fields preview">
        {DEFAULT_FIELD_DEFINITIONS.map((definition) => (
          <MetricCard
            key={definition.key}
            fieldKey={definition.key}
            label={definition.label}
            description={definition.description}
            value={formatMetric(
              selectedRow ? getDefaultMetric(selectedRow, definition.key) : undefined,
            )}
          />
        ))}
      </div>

      <div className="foundation-grid">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Frontier Configurations</h2>
              <p>
                Select a row to inspect its full resource profile. History and
                comparison use your selected Pareto point for this run.
              </p>
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
            onSelect={selectRow}
            additionalFields={visibleAdditionalFields}
          />
          <p className="sr-only" aria-live="polite">
            {selectedRowAnnouncement}
          </p>
        </section>

        <section className="panel">
          <h2>Qubits vs. Runtime</h2>
          <p className="chart-help">Click or focus a point to select its matching table row.</p>
          <FrontierScatter rows={frontierRows} selectedIndex={safeSelectedIndex} onSelect={selectRow} />
        </section>
      </div>

      {selectedRow ? (
        <SelectedRowDetail
          row={selectedRow}
          rowNumber={selectedRowNumber}
          hiddenAdditionalKeys={hiddenAdditionalKeys}
        />
      ) : null}
      <ConfigSummary config={config} />
      <RawExplorer raw={result.raw} />
    </section>
  );
}

interface MetricCardProps {
  fieldKey: string;
  label: string;
  description: string;
  value: string;
}

function MetricCard({ fieldKey, label, description, value }: MetricCardProps) {
  const tipId = definitionId(`result-metric-${fieldKey}`);
  return (
    <article className="metric-card">
      <span className="metric-card__label">
        {label}
        <DefinitionTip id={tipId} label={label}>
          {description}
        </DefinitionTip>
      </span>
      <strong aria-describedby={tipId}>{value}</strong>
    </article>
  );
}
