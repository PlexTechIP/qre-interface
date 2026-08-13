import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { InMemoryRunStore } from "../../shared/runStore";
import {
  type RunFilter,
  type RunRecord,
  type RunStore,
} from "../../shared/types";
import { RunHistoryList } from "./RunHistoryList";
import { RunHistoryFilters } from "./RunHistoryFilters";
import { RunDetailPanel } from "./RunDetailPanel";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import { BulkDeleteConfirmDialog } from "./BulkDeleteConfirmDialog";
import { ExportStubDialog } from "./ExportStubDialog";
import { RerunDialog } from "./RerunDialog";
import { ComparisonView } from "./ComparisonView";
import { ComparisonExportStubDialog } from "./ComparisonExportStubDialog";
import type { SelectedRowByRunId } from "../results/selectedRows";
import { COMPARE_MIN_SELECTION } from "./comparisonModel";
import {
  createRerunRequest,
  type RerunRequest,
} from "./rerun";

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

interface RunHistoryContainerProps {
  /** The run store to read from. Defaults to an empty in-memory store; the app
   *  shell injects the shared store its Run flow saves into, and tests inject a
   *  seeded one. */
  store?: RunStore;
  /** Controlled view. When provided, the internal History/Comparison tab strip
   *  is replaced by shell-level navigation (sidebar + header cross-nav). */
  view?: "history" | "comparison";
  onViewChange?: (view: "history" | "comparison") => void;
  /** Navigate to the Run Configuration surface (empty-state / CTA hand-off). */
  onNavigateToConfig?: () => void;
  /** App-shell handoff: open a saved run on the Results page (moves the sidebar
   *  there). When omitted, View Details shows the in-surface detail panel. */
  onViewRun?: (record: RunRecord) => void;
  /** App-shell handoff: load a reconstructed config into the live form (Rerun).
   *  When omitted, Rerun falls back to the read-only preview dialog. */
  onRerunRequest?: (request: RerunRequest) => void;
  /** The app ships the complete Markdown export; isolated tests keep the stub. */
  exportMode?: "preview" | "complete";
  /** App-level session selection for each immutable run record. */
  selectedRowByRunId?: SelectedRowByRunId;
  onSelectedRowChange?: (runId: string, selectedIndex: number) => void;
}

export function RunHistoryContainer({
  store: providedStore,
  view: controlledView,
  onViewChange,
  onNavigateToConfig,
  onViewRun,
  onRerunRequest,
  exportMode = "preview",
  selectedRowByRunId: controlledSelectedRows,
  onSelectedRowChange,
}: RunHistoryContainerProps = {}) {
  // The store is created once and never recreated across renders. Kept behind
  // the RunStore type so nothing here depends on it being in-memory.
  const [store] = useState<RunStore>(
    () => providedStore ?? new InMemoryRunStore(),
  );

  const [records, setRecords] = useState<RunRecord[]>([]);
  // The full, unfiltered record set — used only to derive the filter bar's
  // option lists ("what values exist at all"), so dropdowns don't shrink as
  // filters combine. Loaded once; refreshed after a delete so a removed run's
  // now-absent value can drop out of the options.
  const [allRecords, setAllRecords] = useState<RunRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // True once the first load settles. Gates the full-screen loading state so a
  // background refresh (e.g. a filter change) never flashes it over existing rows.
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [filter, setFilter] = useState<RunFilter>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // The unified selection: the set of record ids checked in History. Both
  // "Compare Selected" and "Delete Selected" operate on this one set.
  const [comparisonIds, setComparisonIds] = useState<string[]>([]);
  const [isBulkDeleteConfirmOpen, setIsBulkDeleteConfirmOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Transient popup shown when an action is pressed with too small a selection.
  // Keyed by an incrementing seq so a repeat press mounts a NEW live-region node
  // — a screen reader does not re-announce an identical one — and it auto-clears.
  const [toast, setToast] = useState<{ key: number; message: string } | null>(null);
  const toastSeq = useRef(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((message: string) => {
    toastSeq.current += 1;
    setToast({ key: toastSeq.current, message });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1400);
  }, []);
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );
  const [internalSelectedRows, setInternalSelectedRows] = useState<SelectedRowByRunId>({});
  const selectedRowByRunId = controlledSelectedRows ?? internalSelectedRows;
  const selectRow = useCallback(
    (runId: string, selectedIndex: number) => {
      if (controlledSelectedRows === undefined) {
        setInternalSelectedRows((previous) =>
          previous[runId] === selectedIndex
            ? previous
            : { ...previous, [runId]: selectedIndex },
        );
      }
      onSelectedRowChange?.(runId, selectedIndex);
    },
    [controlledSelectedRows, onSelectedRowChange],
  );

  // Fallback Rerun preview state, used only when no app-shell handoff is supplied.
  const [rerunRequest, setRerunRequest] = useState<RerunRequest | null>(null);

  // The record awaiting delete confirmation (null = no pending delete).
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  // The record whose Export-Markdown dialog is open (null = closed).
  const [exportRecord, setExportRecord] = useState<RunRecord | null>(null);

  // Which of Team 1's two surfaces is showing. Standalone, a local tab strip
  // drives it; inside the app shell it's controlled by the sidebar (via the
  // `view`/`onViewChange` props), which hides the tab strip.
  const [internalView, setInternalView] = useState<"history" | "comparison">("history");
  const isControlled = controlledView !== undefined;
  const view = controlledView ?? internalView;
  const setView = onViewChange ?? setInternalView;
  // The comparison-set export dialog: the fields the Comparison surface was
  // hiding when Export was pressed, or null when the dialog is closed. The
  // hidden set is view state owned by `ComparisonView`, so it is captured at
  // press time rather than read back out of a child.
  const [comparisonExportHiddenKeys, setComparisonExportHiddenKeys] =
    useState<ReadonlySet<string> | null>(null);

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
      setHasLoaded(true);
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

  const onViewDetails = useCallback(
    (id: string) => {
      // App-shell handoff opens the run on the Results page; standalone/tests
      // fall back to the in-surface detail panel.
      if (onViewRun) {
        const record = records.find((r) => r.id === id);
        if (record) onViewRun(record);
      } else {
        setSelectedId(id);
      }
    },
    [onViewRun, records],
  );

  // Delete is destructive and records are immutable, so it goes behind an
  // explicit confirm: the list/detail request it, the dialog's onConfirm runs it.
  const requestDelete = useCallback((id: string) => setPendingDeleteId(id), []);
  const cancelDelete = useCallback(() => setPendingDeleteId(null), []);
  const deleteRunIds = useCallback(
    async (ids: string[]): Promise<string[]> => {
      setDeleteError(null);
      const outcomes = await Promise.allSettled(
        ids.map(async (id) => {
          await store.delete(id);
          return id;
        }),
      );
      const deletedIds = outcomes.flatMap((outcome) =>
        outcome.status === "fulfilled" ? [outcome.value] : [],
      );
      const failedCount = outcomes.length - deletedIds.length;
      const deletedSet = new Set(deletedIds);

      setComparisonIds((current) =>
        current.filter((id) => !deletedSet.has(id)),
      );
      setSelectedId((current) =>
        current !== null && deletedSet.has(current) ? null : current,
      );
      await refresh();

      if (failedCount > 0) {
        setDeleteError(
          `Could not delete ${failedCount} run${failedCount === 1 ? "" : "s"}. Please try again.`,
        );
      }
      return deletedIds;
    },
    [refresh, store],
  );

  const confirmDelete = useCallback(async () => {
    if (pendingDeleteId === null) return;
    const id = pendingDeleteId;
    setPendingDeleteId(null);
    await deleteRunIds([id]);
  }, [deleteRunIds, pendingDeleteId]);

  const cancelBulkDelete = useCallback(
    () => setIsBulkDeleteConfirmOpen(false),
    [],
  );

  const onRerun = useCallback(
    (record: RunRecord) => {
      const request = createRerunRequest(record);
      // App-shell handoff pre-fills the live form; otherwise show the preview.
      if (onRerunRequest) {
        onRerunRequest(request);
      } else {
        setRerunRequest(request);
      }
    },
    [onRerunRequest],
  );

  const onExport = useCallback((record: RunRecord) => {
    setExportRecord(record);
  }, []);

  // ---- Comparison selection helpers ---------------------------------------

  const toggleComparison = useCallback((id: string) => {
    setComparisonIds((ids) =>
      ids.includes(id) ? ids.filter((existing) => existing !== id) : [...ids, id],
    );
  }, []);

  const clearComparison = useCallback(() => setComparisonIds([]), []);

  const selectAllVisible = useCallback(() => {
    // Union with the current set so a filter-hidden selection is preserved.
    setComparisonIds((current) => [
      ...new Set([...current, ...records.map((record) => record.id)]),
    ]);
  }, [records]);

  // The selected records still present, in selection order (a deleted record
  // drops out, and so does one the active filter hides). This — NOT comparisonIds
  // — is what Compare/Delete actually operate on, so it is also what the
  // thresholds and the button's count are measured against.
  const comparisonRecords = useMemo(
    () => comparisonIds.map((id) => records.find((r) => r.id === id)).filter((r): r is RunRecord => r != null),
    [comparisonIds, records],
  );

  // "Compare Selected" needs at least two present runs; below that we stay on
  // History and flash a transient popup rather than stranding the user on an
  // empty Comparison page.
  const requestComparison = useCallback(() => {
    if (comparisonRecords.length < COMPARE_MIN_SELECTION) {
      showToast("Select at least 2 runs to compare.");
      return;
    }
    setView("comparison");
  }, [comparisonRecords.length, setView, showToast]);

  // "Delete Selected" needs at least one present run; below that, the same
  // transient popup rather than opening an empty confirm.
  const requestDeleteSelected = useCallback(() => {
    if (comparisonRecords.length < 1) {
      showToast("Select at least 1 run to delete.");
      return;
    }
    setIsBulkDeleteConfirmOpen(true);
  }, [comparisonRecords.length, showToast]);

  const confirmBulkDelete = useCallback(async () => {
    const ids = comparisonRecords.map((record) => record.id);
    if (ids.length === 0) return;
    setIsBulkDeleteConfirmOpen(false);
    // deleteRunIds prunes the deleted ids out of the selection on its own.
    await deleteRunIds(ids);
  }, [comparisonRecords, deleteRunIds]);

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
        {/* Compare Selected now lives in the list toolbar beside Delete
            Selected; the header keeps only the comparison→history cross-nav. */}
        {isControlled && view === "comparison" ? (
          <div className="surface-header__actions">
            <button
              type="button"
              className="surface-action"
              onClick={() => setView("history")}
            >
              ← Back to History
            </button>
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
            Comparison{comparisonRecords.length > 0 ? ` (${comparisonRecords.length})` : ""}
          </button>
        </div>
      )}

      {/*
        Loading / error / content are mutually exclusive so the first open never
        shows "Loading runs…" stacked over the empty state. The loading state only
        replaces content on the very first load (hasLoaded === false); a later
        background refresh keeps the current rows visible instead of flashing.

        Master-detail (History tab): a selected record swaps the list for the
        detail view (View Details). Otherwise the search + filter bar + list show.
        The Comparison tab is a pure function of the checked records.
      */}
      {/* Transient popup for a too-small Compare/Delete selection. Keyed so a
          repeat press re-announces; auto-dismisses on a timer. */}
      {toast ? (
        <p key={toast.key} role="alert" className="history-toast">
          {toast.message}
        </p>
      ) : null}

      {loadError ? (
        <p role="alert" className="load-error">
          {loadError}
        </p>
      ) : isLoading && !hasLoaded ? (
        <p className="muted">Loading runs…</p>
      ) : view === "comparison" ? (
        <ComparisonView
          records={comparisonRecords}
          selectedRowByRunId={selectedRowByRunId}
          onClear={clearComparison}
          onRemove={toggleComparison}
          onExport={setComparisonExportHiddenKeys}
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
          selectedIndex={selectedRowByRunId[selectedRecord.id] ?? 0}
          onSelectedIndexChange={(selectedIndex) =>
            selectRow(selectedRecord.id, selectedIndex)
          }
        />
      ) : (
        <>
          <RunHistoryFilters allRecords={allRecords} filter={filter} onFilterChange={setFilter} />
          {deleteError ? (
            <p role="alert" className="load-error">
              {deleteError}
            </p>
          ) : null}
          <RunHistoryList
            records={records}
            selectedId={selectedId}
            selectedIds={comparisonIds}
            selectedCount={comparisonRecords.length}
            selectedRowByRunId={selectedRowByRunId}
            hasActiveFilter={hasActiveFilter}
            onViewDetails={onViewDetails}
            onRerun={onRerun}
            onDelete={requestDelete}
            onExport={onExport}
            onToggleSelection={toggleComparison}
            onSelectAll={selectAllVisible}
            onClearSelection={clearComparison}
            onCompareSelected={requestComparison}
            onDeleteSelected={requestDeleteSelected}
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
      {isBulkDeleteConfirmOpen ? (
        <BulkDeleteConfirmDialog
          count={comparisonRecords.length}
          onConfirm={confirmBulkDelete}
          onCancel={cancelBulkDelete}
        />
      ) : null}
      {exportRecord ? (
        <ExportStubDialog
          record={exportRecord}
          mode={exportMode}
          onClose={() => setExportRecord(null)}
        />
      ) : null}
      {rerunRequest ? (
        <RerunDialog request={rerunRequest} onClose={() => setRerunRequest(null)} />
      ) : null}
      {comparisonExportHiddenKeys ? (
        <ComparisonExportStubDialog
          records={comparisonRecords}
          selectedRowByRunId={selectedRowByRunId}
          hiddenKeys={comparisonExportHiddenKeys}
          mode={exportMode}
          onClose={() => setComparisonExportHiddenKeys(null)}
        />
      ) : null}
    </div>
  );
}
