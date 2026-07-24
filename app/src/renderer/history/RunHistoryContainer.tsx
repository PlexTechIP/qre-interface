import { useCallback, useEffect, useMemo, useState } from "react";
 
import {
  reconstructConfig,
  type RunConfig,
  type RunFilter,
  type RunRecord,
  type RunStore,
} from "../../shared/types";
import { RunHistoryList } from "./RunHistoryList";
import { RunHistoryFilters } from "./RunHistoryFilters";
import { RunDetailPanel } from "./RunDetailPanel";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import { ExportStubDialog } from "./ExportStubDialog";
import { RerunDialog } from "./RerunDialog";
import { ComparisonView } from "./ComparisonView";
import { ComparisonExportStubDialog } from "./ComparisonExportStubDialog";
 
/**
 * Container for the Run History + Comparison surfaces.
 *
 * The record store is INJECTED (see props). Everything below talks to it only
 * through the `RunStore` interface, so this surface is a pure function of the
 * store + callbacks and never learns whether it's the in-memory mock or the real
 * SQLite store reached over IPC. `view` (History vs Comparison) is controlled by
 * the app shell so the sidebar and the in-surface tab strip stay in sync and the
 * comparison selection survives switching between the two.
 */
 
/** A Rerun handoff payload: the reconstructed pre-fill config for a new run. */
export interface RerunRequest {
  sourceRecord: RunRecord;
  config: RunConfig;
}
 
function makeStamp(): { id: string; createdAt: string } {
  return { id: crypto.randomUUID(), createdAt: new Date().toISOString() };
}
 
interface RunHistoryContainerProps {
  /** The run store to read from. Defaults to a mock-seeded in-memory store so
   *  the surface is demonstrable standalone; the app shell injects a shared,
   *  initially-empty store that its Run flow saves into. */
  store?: RunStore;
  /** Controlled view. When provided, the internal History/Comparison tab strip
   *  is replaced by shell-level navigation (sidebar + header cross-nav). */
  view?: "history" | "comparison";
  onViewChange?: (view: "history" | "comparison") => void;
  /** Navigate to the Run Configuration surface (empty-state / CTA hand-off). */
  onNavigateToConfig?: () => void;
}

export function RunHistoryContainer({
  store: providedStore,
  view: controlledView,
  onViewChange,
  onNavigateToConfig,
}: RunHistoryContainerProps = {}) {
  // The store is created once and never recreated across renders. Kept behind
  // the RunStore type so nothing here depends on it being in-memory.
  const [store] = useState<RunStore>(
    () => providedStore ?? new InMemoryRunStore(MOCK_RUN_RECORDS),
  );
 
  const [records, setRecords] = useState<RunRecord[]>([]);
  // The full, unfiltered record set — used only to derive the filter bar's
  // option lists ("what values exist at all"), so dropdowns don't shrink as
  // filters combine. Loaded once; refreshed after a delete so a removed run's
  // now-absent value can drop out of the options.
  const [allRecords, setAllRecords] = useState<RunRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
 
  const [filter, setFilter] = useState<RunFilter>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
 
  // Multi-select for Comparison: the set of record ids checked in History.
  const [comparisonIds, setComparisonIds] = useState<string[]>([]);
 
  // The Rerun handoff payload, surfaced this week instead of navigated (week-4).
  const [rerunRequest, setRerunRequest] = useState<RerunRequest | null>(null);

  // The record awaiting delete confirmation (null = no pending delete).
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  // The record whose Export-Markdown stub preview is open (null = closed).
  const [exportRecord, setExportRecord] = useState<RunRecord | null>(null);

  // Which of Team 1's two surfaces is showing. Standalone, a local tab strip
  // drives it; inside the app shell it's controlled by the sidebar (via the
  // `view`/`onViewChange` props), which hides the tab strip.
  const [internalView, setInternalView] = useState<"history" | "comparison">("history");
  const isControlled = controlledView !== undefined;
  const view = controlledView ?? internalView;
  const setView = onViewChange ?? setInternalView;
  // Whether the comparison-set export stub preview is open.
  const [isComparisonExportOpen, setIsComparisonExportOpen] = useState(false);
 
  /**
   * Re-read the store through the query API so the view always reflects stored
   * state (post-delete especially). Runs the active filter server-side, exactly
   * as the real SQLite store will.
   */
  const refresh = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      // Filtered set feeds the table; full set feeds the filter-bar options.
      const [filtered, all] = await Promise.all([store.query(filter), store.list()]);
      setRecords(filtered);
      setAllRecords(all);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to load runs.");
      setRecords([]);
      setAllRecords([]);
    } finally {
      setIsLoading(false);
    }
  }, [store, filter]);
 
  // Reload whenever the filter changes (initial load included).
  useEffect(() => {
    void refresh();
  }, [refresh]);
 
  // Drop the open selection if its record leaves the visible set (deleted, or
  // hidden by a filter). The comparison set self-heals separately: comparisonRecords
  // resolves ids against the present records, and delete prunes comparisonIds.
  const visibleIds = useMemo(() => new Set(records.map((r) => r.id)), [records]);
 
  useEffect(() => {
    if (selectedId !== null && !visibleIds.has(selectedId)) {
      setSelectedId(null);
    }
  }, [selectedId, visibleIds]);
 
  // ---- Per-run action callbacks handed down to the History list -----------
 
  const onViewDetails = useCallback((id: string) => {
    setSelectedId(id);
  }, []);
 
  // Delete is destructive and records are immutable, so it goes behind an
  // explicit confirm: the list/detail request it, the dialog's onConfirm runs it.
  const requestDelete = useCallback((id: string) => setPendingDeleteId(id), []);
  const cancelDelete = useCallback(() => setPendingDeleteId(null), []);
  const confirmDelete = useCallback(async () => {
    if (pendingDeleteId === null) return;
    const id = pendingDeleteId;
    setPendingDeleteId(null);
    await store.delete(id);
    setComparisonIds((ids) => ids.filter((existing) => existing !== id));
    // Close the detail view if we were viewing the run we just removed.
    setSelectedId((current) => (current === id ? null : current));
    await refresh();
  }, [pendingDeleteId, store, refresh]);
 
  const onRerun = useCallback((record: RunRecord) => {
    // reconstructConfig is PROVIDED — call it, never re-implement. It carries
    // the saved config forward with a fresh id + createdAt for the new run.
    const config = reconstructConfig(record, makeStamp());
    // This week we surface the reconstructed payload; wiring it into the live
    // Run Configuration form is week-4 integration.
    setRerunRequest({ sourceRecord: record, config });
  }, []);
 
  const onExport = useCallback((record: RunRecord) => {
    // Seam only — the real Markdown generator is Part 3 (week 6). Opens the stub
    // preview dialog; nothing is generated here.
    setExportRecord(record);
  }, []);
 
  // ---- Comparison selection helpers ---------------------------------------
 
  const toggleComparison = useCallback((id: string) => {
    setComparisonIds((ids) =>
      ids.includes(id) ? ids.filter((existing) => existing !== id) : [...ids, id],
    );
  }, []);
 
  const clearComparison = useCallback(() => setComparisonIds([]), []);
 
  // The records currently chosen for comparison, in selection order, filtered
  // to those still present (a deleted record drops out of the set).
  const comparisonRecords = useMemo(
    () => comparisonIds.map((id) => records.find((r) => r.id === id)).filter((r): r is RunRecord => r != null),
    [comparisonIds, records],
  );
 
  const selectedRecord = useMemo(
    () => (selectedId == null ? null : records.find((r) => r.id === selectedId) ?? null),
    [selectedId, records],
  );
 
  // The record awaiting delete confirmation, resolved from its id for the dialog.
  const pendingDeleteRecord = useMemo(
    () => (pendingDeleteId == null ? null : records.find((r) => r.id === pendingDeleteId) ?? null),
    [pendingDeleteId, records],
  );

  // Total count is needed to distinguish "no runs yet" from "no matches":
  // records.length reflects the active filter, so an unfiltered empty store is
  // the true empty state. Children receive both signals.
  const hasActiveFilter = useMemo(
    () =>
      Boolean(
        filter.nameSearch?.trim() ||
          filter.application ||
          filter.architecture ||
          filter.qecCode ||
          filter.magicStateFactory ||
          filter.qreVersion,
      ),
    [filter],
  );
 
  return (
    <div className="run-history-container">
      <header className="surface-header">
        <div>
          <h1>{view === "history" ? "Run History" : "Comparison"}</h1>
          <p>
            {view === "history"
              ? "Search, filter, rerun, export, or select runs for comparison."
              : "Compare runs across result fields, configurations, timestamps, and QRE engine versions."}
          </p>
        </div>
        {isControlled ? (
          <div className="surface-header__actions">
            {view === "history" ? (
              <button
                type="button"
                className="surface-action"
                onClick={() => setView("comparison")}
              >
                Compare Selected{comparisonIds.length > 0 ? ` (${comparisonIds.length})` : ""}
              </button>
            ) : (
              <button
                type="button"
                className="surface-action"
                onClick={() => setView("history")}
              >
                ← Back to History
              </button>
            )}
          </div>
        ) : null}
      </header>

      {/*
        Standalone, a local tab strip keeps both surfaces reachable. Inside the
        app shell the sidebar drives the view (isControlled), so the tab strip is
        hidden in favour of the header cross-nav above.
      */}
      {isControlled ? null : (
        <div className="surface-tabs" role="tablist" aria-label="Run surfaces">
          <button
            type="button"
            role="tab"
            aria-selected={view === "history"}
            className={view === "history" ? "surface-tab active" : "surface-tab"}
            onClick={() => setView("history")}
          >
            History
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "comparison"}
            className={view === "comparison" ? "surface-tab active" : "surface-tab"}
            onClick={() => setView("comparison")}
          >
            Comparison{comparisonIds.length > 0 ? ` (${comparisonIds.length})` : ""}
          </button>
        </div>
      )}

      {loadError ? <p role="alert">{loadError}</p> : null}
      {isLoading ? <p className="muted">Loading runs…</p> : null}

      {/*
        Master-detail (History tab): a selected record swaps the list for the
        detail view (View Details). Otherwise the search + filter bar + list show.
        The Comparison tab is a pure function of the checked records.
      */}
      {view === "comparison" ? (
        <ComparisonView
          records={comparisonRecords}
          onClear={clearComparison}
          onRemove={toggleComparison}
          onExport={() => setIsComparisonExportOpen(true)}
          embedded={isControlled}
          {...(isControlled ? { onGoToHistory: () => setView("history") } : {})}
        />
      ) : selectedRecord ? (
        <RunDetailPanel
          record={selectedRecord}
          onClose={() => setSelectedId(null)}
          onRerun={onRerun}
          onExport={onExport}
          onDelete={requestDelete}
        />
      ) : (
        <>
          <RunHistoryFilters allRecords={allRecords} filter={filter} onFilterChange={setFilter} />
          <RunHistoryList
            records={records}
            selectedId={selectedId}
            comparisonIds={comparisonIds}
            hasActiveFilter={hasActiveFilter}
            onViewDetails={onViewDetails}
            onRerun={onRerun}
            onDelete={requestDelete}
            onExport={onExport}
            onToggleComparison={toggleComparison}
            {...(onNavigateToConfig ? { onNavigateToConfig } : {})}
          />
        </>
      )}

      {pendingDeleteRecord ? (
        <DeleteConfirmDialog
          record={pendingDeleteRecord}
          onConfirm={confirmDelete}
          onCancel={cancelDelete}
        />
      ) : null}
      {exportRecord ? (
        <ExportStubDialog record={exportRecord} onClose={() => setExportRecord(null)} />
      ) : null}
      {rerunRequest ? (
        <RerunDialog request={rerunRequest} onClose={() => setRerunRequest(null)} />
      ) : null}
      {isComparisonExportOpen ? (
        <ComparisonExportStubDialog
          records={comparisonRecords}
          onClose={() => setIsComparisonExportOpen(false)}
        />
      ) : null}
    </div>
  );
}