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

/**
 * The ordering tuple and the two indexed columns a lister needs, without the
 * record itself.
 *
 * Reading these instead of `record_json` is what makes a page cost a page:
 * every field here is a column, so no JSON is parsed and no record is upgraded
 * for a run that is only being counted or skipped past. `name` and
 * `application` are the two filter dimensions the exact-match SQL cannot
 * express — the substring search and "uploaded runs" — so they travel with the
 * key and are decided in JS, by the same rule the records would have been.
 */
export interface RunKey {
  id: string;
  /** `config.name`, exactly as saved. */
  name: string;
  /** `applicationKey(config)`: a benchmark id, `uploaded:<path>`, or `manual-counts`. */
  application: string;
  createdAt: string;
  savedAt: string;
}

/** Every filter dimension a column can answer. `authoredBy` lives only in the JSON. */
export type RunKeyFilter = Omit<RunFilter, "authoredBy">;

/**
 * Newest first, the same total order `sortRunRecordsNewestFirst` defines over
 * records: launch time, then save time, then id, each descending. Kept as a
 * comparator over the key alone so a caller holding keys can order them
 * without the records.
 */
export function compareRunKeysNewestFirst(a: RunKey, b: RunKey): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
  if (a.savedAt !== b.savedAt) return a.savedAt < b.savedAt ? 1 : -1;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/**
 * The substring rule of `matchesRunFilter`, applied to the name column.
 *
 * Same trim, same `toLowerCase`, same `includes`: JS lowercasing is Unicode
 * (Ekerå-Håstad folds the way an analyst expects) and SQLite's `LOWER` is not,
 * which is why the search is not pushed into SQL as a LIKE.
 */
function keyMatchesNameSearch(key: RunKey, nameSearch: string | undefined): boolean {
  if (nameSearch === undefined) return true;
  const needle = nameSearch.trim().toLowerCase();
  return needle.length === 0 || key.name.toLowerCase().includes(needle);
}

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

/** The indexed exact-match half of a filter, as a WHERE clause and its bindings. */
function exactMatchClause(filter: RunKeyFilter): {
  whereClause: string;
  parameters: string[];
} {
  const predicates: string[] = [];
  const parameters: string[] = [];

  const addExactFilter = (column: string, value: string | undefined): void => {
    if (value === undefined) return;
    predicates.push(`${column} = ?`);
    parameters.push(value);
  };

  addExactFilter("application", filter.application);

  // An empty set matches nothing; SQL's `IN ()` is a syntax error, so say so.
  if (filter.applications !== undefined) {
    if (filter.applications.length === 0) {
      predicates.push("0");
    } else {
      predicates.push(
        `application IN (${filter.applications.map(() => "?").join(", ")})`,
      );
      parameters.push(...filter.applications);
    }
  }

  addExactFilter("architecture", filter.architecture);
  addExactFilter("qec_code", filter.qecCode);
  addExactFilter("qre_version", filter.qreVersion);

  // The factory column is a set, so this narrows by CONTAINMENT rather than
  // equality: a run that selected several factories matches on any of them.
  if (filter.magicStateFactory !== undefined) {
    predicates.push("magic_state_factory LIKE ?");
    parameters.push(`%${encodeFactorySet([filter.magicStateFactory])}%`);
  }

  return {
    whereClause: predicates.length === 0 ? "" : `WHERE ${predicates.join(" AND ")}`,
    parameters,
  };
}

export function selectRecordsByFilter(
  database: DatabaseSync,
  filter: RunFilter,
): RunRecord[] {
  const { whereClause, parameters } = exactMatchClause(filter);
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

/**
 * The keys of every record the filter matches, newest first, without reading
 * a single `record_json`.
 *
 * This is the store-level half of the design's F-4 follow-up. A lister used to
 * call `selectRecordsByFilter` and slice a page from the result, so every page
 * parsed and upgraded the whole matching history — the cost of page one and
 * page forty were the same, and both grew with the history rather than with
 * the page. Keys are five columns; the records are fetched afterwards, by id,
 * for the page alone (`selectRecordsByIds`).
 *
 * The name search and the ordering are applied here in JS, by the same rules
 * `matchesRunFilter` and `sortRunRecordsNewestFirst` state for records, so the
 * set and order agree with `selectRecordsByFilter` exactly.
 * `selectRecordKeysByFilter.test.ts` holds that equivalence.
 */
export function selectRecordKeysByFilter(
  database: DatabaseSync,
  filter: RunKeyFilter,
): RunKey[] {
  const { whereClause, parameters } = exactMatchClause(filter);
  const rows = database
    .prepare(
      `SELECT id, name, application, created_at, saved_at
         FROM run_records ${whereClause} ${NEWEST_FIRST}`,
    )
    .all(...parameters) as ReadonlyArray<Record<string, unknown>>;

  const keys: RunKey[] = rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    application: String(row.application),
    createdAt: String(row.created_at),
    savedAt: String(row.saved_at),
  }));

  return keys
    .filter((key) => keyMatchesNameSearch(key, filter.nameSearch))
    .sort(compareRunKeysNewestFirst);
}

/**
 * The records for these ids, in the order the ids were given.
 *
 * An id with no record any more is skipped rather than reported: between the
 * key query and this one the dashboard may have deleted a run, and a lister's
 * cursor contract already says the history may change under it.
 */
export function selectRecordsByIds(
  database: DatabaseSync,
  ids: readonly string[],
): RunRecord[] {
  if (ids.length === 0) return [];

  const placeholders = ids.map(() => "?").join(", ");
  const rows = database
    .prepare(`SELECT id, record_json FROM run_records WHERE id IN (${placeholders})`)
    .all(...ids) as ReadonlyArray<Record<string, unknown>>;

  const byId = new Map<string, RunRecord>();
  for (const row of rows) byId.set(String(row.id), readStoredRecord(row));

  const ordered: RunRecord[] = [];
  for (const id of ids) {
    const record = byId.get(id);
    if (record !== undefined) ordered.push(record);
  }
  return ordered;
}

/** How many records the store holds. A count, not a list to measure. */
export function countRecords(database: DatabaseSync): number {
  const row = database
    .prepare("SELECT count(*) AS total FROM run_records")
    .get() as { total?: unknown } | undefined;
  return typeof row?.total === "number" ? row.total : 0;
}
