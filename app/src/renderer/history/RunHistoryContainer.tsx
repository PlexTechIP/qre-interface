import { useCallback, useEffect, useMemo, useState } from "react";
 
import { InMemoryRunStore } from "../../shared/runStore";
import { MOCK_RUN_RECORDS } from "../../shared/runRecordFixtures";
import {
  reconstructConfig,
  type RunConfig,
  type RunFilter,
  type RunRecord,
  type RunStore,
} from "../../shared/types";
import { RunHistoryList } from "./RunHistoryList";
import { RunHistoryFilters } from "./RunHistoryFilters";
 
/**
 * Phase 1 container for the Run History + Comparison surfaces.
 *
 * This is the ONLY place that knows a store exists. It instantiates the
 * InMemoryRunStore (seeded with the committed mock records), talks to it
 * exclusively through the `RunStore` interface, and hands its children plain
 * data + callbacks. When the real SQLite store swaps in at week-4 integration,
 * only this file changes — the History list and Comparison view are pure
 * functions of `records` + callbacks and never learn where the records came
 * from. Placement of this container into the app shell (App.tsx tabs) is itself
 * week-4 work; this file is the seam, not the wiring.
 */
 
/** A Rerun handoff payload: the reconstructed pre-fill config for a new run. */
export interface RerunRequest {
  sourceRecord: RunRecord;
  config: RunConfig;
}
 
function makeStamp(): { id: string; createdAt: string } {
  return { id: crypto.randomUUID(), createdAt: new Date().toISOString() };
}
 
export function RunHistoryContainer() {
  // The store is created once and never recreated across renders. Kept behind
  // the RunStore type so nothing here depends on it being in-memory.
  const [store] = useState<RunStore>(() => new InMemoryRunStore(MOCK_RUN_RECORDS));
 
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
 
  // Keep selection and comparison sets honest if their records disappear
  // (e.g. after a delete or a filter that hides them).
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
 
  const onDelete = useCallback(
    async (id: string) => {
      await store.delete(id);
      setComparisonIds((ids) => ids.filter((existing) => existing !== id));
      await refresh();
    },
    [store, refresh],
  );
 
  const onRerun = useCallback((record: RunRecord) => {
    // reconstructConfig is PROVIDED — call it, never re-implement. It carries
    // the saved config forward with a fresh id + createdAt for the new run.
    const config = reconstructConfig(record, makeStamp());
    // This week we surface the reconstructed payload; wiring it into the live
    // Run Configuration form is week-4 integration.
    setRerunRequest({ sourceRecord: record, config });
  }, []);
 
  const onExport = useCallback((record: RunRecord) => {
    // Seam only — the real Markdown generator is Part 3 (week 6). The stub UI
    // renders a preview from this record; nothing is generated here.
    return record;
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
 
  // Computed now, consumed in later phases: `selectedRecord` + `rerunRequest`
  // drive the Phase 4 detail/rerun panels; `comparisonRecords` + `clearComparison`
  // + `setFilter` feed the Phase 5 Comparison surface and Phase 3 filter bar.
  // Referenced here so strict noUnusedLocals stays green until then.
  void selectedRecord;
  void rerunRequest;
  void comparisonRecords;
  void clearComparison;
 
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
        <h1>Run History</h1>
        <p>Search, filter, rerun, export, or select runs for comparison.</p>
      </header>
 
      {loadError ? <p role="alert">{loadError}</p> : null}
      {isLoading ? <p className="muted">Loading runs…</p> : null}
 
      {/*
        Phase 3 (this commit): the search + filter bar, driving `filter` via
        setFilter; options derive from the full record set (allRecords).
        Phase 5 adds <ComparisonView records={comparisonRecords}
        onClear={clearComparison} />. The Rerun payload (`rerunRequest`)
        surfaces in the Phase 4 actions pass.
      */}
      <RunHistoryFilters
        allRecords={allRecords}
        filter={filter}
        onFilterChange={setFilter}
      />
 
      <RunHistoryList
        records={records}
        selectedId={selectedId}
        comparisonIds={comparisonIds}
        hasActiveFilter={hasActiveFilter}
        onViewDetails={onViewDetails}
        onRerun={onRerun}
        onDelete={onDelete}
        onExport={onExport}
        onToggleComparison={toggleComparison}
      />
    </div>
  );
}