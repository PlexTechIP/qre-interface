import type { FrontierRow, RunResult } from "../../shared/types";

/** Session-only map of a run id to its zero-based representative frontier row. */
export type SelectedRowByRunId = Readonly<Record<string, number>>;

export interface SelectedFrontierRow {
  row: FrontierRow | null;
  index: number;
  count: number;
}

/**
 * Resolve a run's representative frontier row without mutating its saved record.
 * Missing or stale selections deliberately fall back to row 1 (index 0).
 */
export function resolveSelectedFrontierRow(
  result: RunResult,
  selectedIndex = 0,
): SelectedFrontierRow {
  const frontier = result.frontier ?? [];
  const index =
    Number.isInteger(selectedIndex) &&
    selectedIndex >= 0 &&
    selectedIndex < frontier.length
      ? selectedIndex
      : 0;

  return {
    row: frontier[index] ?? null,
    index,
    count: frontier.length,
  };
}
