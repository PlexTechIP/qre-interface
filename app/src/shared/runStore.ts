/**
 * InMemoryRunStore — the reference RunStore behind the persistence boundary.
 *
 * This is to the RunStore contract what MockEngine is to EstimatorService: the
 * canonical behaviour both teams build against. Team 1 uses it directly this
 * week to develop the Run History UI against real records; Team 2's SQLite
 * `RunStore` (week 3–4) must reproduce exactly these semantics:
 *
 *   - WRITE-ONCE: save() rejects a duplicate id (records are immutable; Rerun
 *     creates a NEW record with a new id, never an update).
 *   - list()/query() return records newest-first (queryRunRecords semantics).
 *   - get()/list()/query() hand back deep copies, so a caller mutating a
 *     returned record can never corrupt stored state.
 *
 * UI code talks only to the `RunStore` interface, never to this class directly,
 * so the week-4 swap to SQLite costs nothing.
 */

import {
  queryRunRecords,
  sortRunRecordsNewestFirst,
  type RunFilter,
  type RunRecord,
  type RunStore,
} from "./types";

/**
 * Thrown when a save would overwrite an existing record. Records are immutable;
 * this is a programmer error (the caller should mint a fresh record via Rerun),
 * not a recoverable store state — mirrors MockEngine's SchemaValidationError.
 */
export class RunRecordExistsError extends Error {
  constructor(public readonly id: string) {
    super(
      `A run record with id ${id} already exists; run records are immutable ` +
        `(Rerun creates a new record with a new id).`,
    );
    this.name = "RunRecordExistsError";
  }
}

function clone(record: RunRecord): RunRecord {
  return structuredClone(record);
}

export class InMemoryRunStore implements RunStore {
  private readonly records = new Map<string, RunRecord>();

  /** Optionally seed with existing records (e.g. the mock fixtures). Cloned on the way in. */
  constructor(seed: readonly RunRecord[] = []) {
    for (const record of seed) {
      if (this.records.has(record.id)) throw new RunRecordExistsError(record.id);
      this.records.set(record.id, clone(record));
    }
  }

  async save(record: RunRecord): Promise<void> {
    if (this.records.has(record.id)) throw new RunRecordExistsError(record.id);
    this.records.set(record.id, clone(record));
  }

  async list(): Promise<RunRecord[]> {
    return sortRunRecordsNewestFirst([...this.records.values()]).map(clone);
  }

  async get(id: string): Promise<RunRecord | null> {
    const record = this.records.get(id);
    return record ? clone(record) : null;
  }

  async delete(id: string): Promise<void> {
    this.records.delete(id);
  }

  async query(filter: RunFilter): Promise<RunRecord[]> {
    return queryRunRecords([...this.records.values()], filter).map(clone);
  }
}
