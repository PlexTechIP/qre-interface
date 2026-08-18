import { useEffect, useState } from "react";

import type {
  RunConfig,
  RunRecord,
  RunResult,
  RunStore,
} from "../../shared/types";
import { ExportDialog } from "../history/ExportDialog";
import {
  createRerunRequest,
  type RerunRequest,
} from "../history/rerun";
import { ResultsArea } from "./ResultsArea";

interface ResultsPageProps {
  /** The most recent finished run, or null before any run this session. */
  latestRun: { config: RunConfig; result: RunResult } | null;
  /** Navigate to Run Configuration to start an estimate. */
  onRunEstimation: () => void;
  /** Session-selected representative frontier row for the latest run. */
  selectedIndex?: number;
  onSelectedIndexChange?: (index: number) => void;
  /** Resolve the immutable record persisted by save-after-run. */
  store: Pick<RunStore, "get">;
  /** Reuse the shell handoff that History uses for Rerun. */
  onRerunRequest: (request: RerunRequest) => void;
  /**
   * Take this run's outcome back to the conversation that proposed it.
   *
   * Absent when there is nowhere to go back to — a configuration the analyst
   * wrote themselves, or a run opened from History in a later session, where
   * the thread is no longer something the shell can point at.
   */
  onAskAgent?: (() => void) | undefined;
}

type RecordResolution =
  | { status: "loading" }
  | { status: "ready"; record: RunRecord }
  | { status: "error"; message: string };

/**
 * The Results sidebar page. Shows the latest run's result (via Team 2's
 * ResultsArea), or a first-run empty state with a call to action.
 */
export function ResultsPage({
  latestRun,
  onRunEstimation,
  selectedIndex,
  onSelectedIndexChange,
  store,
  onRerunRequest,
  onAskAgent,
}: ResultsPageProps): React.JSX.Element {
  const [recordResolution, setRecordResolution] =
    useState<RecordResolution>({ status: "loading" });
  const [lookupAttempt, setLookupAttempt] = useState(0);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const runId = latestRun?.result.runId ?? null;

  useEffect(() => {
    if (runId === null) return;

    let active = true;
    setRecordResolution({ status: "loading" });
    setIsExportOpen(false);

    void store
      .get(runId)
      .then((record) => {
        if (!active) return;
        setRecordResolution(
          record
            ? { status: "ready", record }
            : {
                status: "error",
                message:
                  "This run has not appeared in saved history yet. Retry the lookup in a moment.",
              },
        );
      })
      .catch((error: unknown) => {
        if (!active) return;
        setRecordResolution({
          status: "error",
          message:
            error instanceof Error
              ? `Unable to load saved run actions: ${error.message}`
              : "Unable to load saved run actions.",
        });
      });

    return () => {
      active = false;
    };
  }, [lookupAttempt, runId, store]);

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

  const record =
    recordResolution.status === "ready" ? recordResolution.record : null;

  return (
    <div className="results-page-frame">
      <div className="results-page-toolbar">
        <div className="detail-actions" aria-label="Run actions">
          <button
            type="button"
            disabled={record === null}
            aria-describedby={record === null ? "results-actions-status" : undefined}
            onClick={() => setIsExportOpen(true)}
          >
            Export
          </button>
          <button
            type="button"
            disabled={record === null}
            aria-describedby={record === null ? "results-actions-status" : undefined}
            onClick={() => {
              if (record) onRerunRequest(createRerunRequest(record));
            }}
          >
            Rerun
          </button>
          {/*
            Only for a run a model proposed, and only while the shell still
            knows which conversation proposed it. A failed run is where this
            earns its place: the one participant who could explain the error is
            the one who never learns the run happened.
          */}
          {onAskAgent === undefined ? null : (
            <button type="button" onClick={onAskAgent}>
              {latestRun.result.status === "failed"
                ? "Ask the agent what went wrong"
                : "Ask the agent about this run"}
            </button>
          )}
        </div>
        {recordResolution.status === "loading" ? (
          <p id="results-actions-status" className="muted" role="status">
            Loading saved run actions…
          </p>
        ) : null}
        {recordResolution.status === "error" ? (
          <div id="results-actions-status" className="results-actions-error" role="alert">
            <span>{recordResolution.message}</span>
            <button
              type="button"
              className="link-button"
              onClick={() => setLookupAttempt((attempt) => attempt + 1)}
            >
              Retry lookup
            </button>
          </div>
        ) : null}
      </div>

      <ResultsArea
        phase="done"
        result={latestRun.result}
        config={latestRun.config}
        {...(selectedIndex !== undefined ? { selectedIndex } : {})}
        {...(onSelectedIndexChange ? { onSelectedIndexChange } : {})}
      />

      {isExportOpen && record ? (
        <ExportDialog record={record} onClose={() => setIsExportOpen(false)} />
      ) : null}
    </div>
  );
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
