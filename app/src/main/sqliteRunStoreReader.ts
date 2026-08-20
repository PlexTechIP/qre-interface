/**
 * The read path of the SQLite run store.
 *
 * `SqliteRunStore` owns writing and migration and builds its reads on this, so
 * there is exactly one copy of the record decoding and the query SQL. Splitting
 * it out is what lets a caller be handed reading without writing — see
 * `sqliteReadOnlyRunStore.ts`.
 */

import { DatabaseSync } from "node:sqlite";

import {
  queryRunRecords,
  upgradeRunRecord,
  type MagicStateFactoryId,
  type RunFilter,
  type RunRecord,
} from "../shared/types.js";

export const DATABASE_SCHEMA_VERSION = 2;

/**
 * The factory column holds a SET as of contract v1.2.0, encoded as the members
 * wrapped and joined by a delimiter: ["round_based","gsj24"] becomes
 * "|round_based|gsj24|". The leading/trailing bars make a containment test an
 * unambiguous substring match — "|gsj24|" cannot collide with a longer id the
 * way a bare "gsj24" could.
 */
export const FACTORY_SET_DELIMITER = "|";

export function encodeFactorySet(
  factories: readonly MagicStateFactoryId[],
): string {
  return `${FACTORY_SET_DELIMITER}${factories.join(FACTORY_SET_DELIMITER)}${FACTORY_SET_DELIMITER}`;
}

/**
 * Rows are stored verbatim as saved, so a row written under v1.1.0 still carries
 * the singular `magicStateFactory`. The upgrade happens HERE, at the read
 * boundary, so every consumer above sees exactly one shape and the stored JSON
 * is never rewritten in place.
 */
export function readStoredRecord(row: Record<string, unknown>): RunRecord {
  const recordJson = row.record_json;
  if (typeof recordJson !== "string") {
    throw new Error("SQLite run record is missing its JSON payload.");
  }
  return upgradeRunRecord(JSON.parse(recordJson) as RunRecord);
}

const NEWEST_FIRST = "ORDER BY created_at DESC, saved_at DESC, id DESC";

export function selectAllRecords(database: DatabaseSync): RunRecord[] {
  return database
    .prepare(`SELECT record_json FROM run_records ${NEWEST_FIRST}`)
    .all()
    .map(readStoredRecord);
}

export function selectRecordById(
  database: DatabaseSync,
  id: string,
): RunRecord | null {
  const row = database
    .prepare("SELECT record_json FROM run_records WHERE id = ?")
    .get(id);
  return row === undefined ? null : readStoredRecord(row);
}

export function selectRecordsByFilter(
  database: DatabaseSync,
  filter: RunFilter,
): RunRecord[] {
  const predicates: string[] = [];
  const parameters: string[] = [];

  const addExactFilter = (column: string, value: string | undefined): void => {
    if (value === undefined) return;
    predicates.push(`${column} = ?`);
    parameters.push(value);
  };

  addExactFilter("application", filter.application);
  addExactFilter("architecture", filter.architecture);
  addExactFilter("qec_code", filter.qecCode);
  addExactFilter("qre_version", filter.qreVersion);

  // The factory column is a set, so this narrows by CONTAINMENT rather than
  // equality: a run that selected several factories matches on any of them.
  if (filter.magicStateFactory !== undefined) {
    predicates.push("magic_state_factory LIKE ?");
    parameters.push(`%${encodeFactorySet([filter.magicStateFactory])}%`);
  }

  const whereClause =
    predicates.length === 0 ? "" : `WHERE ${predicates.join(" AND ")}`;
  const rows = database
    .prepare(
      `SELECT record_json FROM run_records ${whereClause} ${NEWEST_FIRST}`,
    )
    .all(...parameters)
    .map(readStoredRecord);

  // Keep the committed helper as the final authority for name-search and
  // ordering semantics after SQLite narrows the indexed exact-match fields.
  return queryRunRecords(rows, filter);
}
