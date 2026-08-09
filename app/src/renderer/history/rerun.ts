import {
  reconstructConfig,
  type RunConfig,
  type RunRecord,
} from "../../shared/types";

/** App-shell handoff payload for pre-filling a new run from an immutable record. */
export interface RerunRequest {
  sourceRecord: RunRecord;
  config: RunConfig;
}

function makeStamp(): { id: string; createdAt: string } {
  return { id: crypto.randomUUID(), createdAt: new Date().toISOString() };
}

/**
 * The name a rerun carries, appending an incrementing "(n)" suffix the way a
 * file download disambiguates a duplicate: "test" → "test(1)", and rerunning
 * "test(1)" → "test(2)". A trailing "(n)" on the source is bumped; otherwise
 * "(1)" is appended.
 */
export function nextRerunName(sourceName: string): string {
  const match = /^(.*)\((\d+)\)$/.exec(sourceName);
  if (match) {
    const base = match[1] ?? "";
    const next = Number.parseInt(match[2] ?? "0", 10) + 1;
    return `${base}(${next})`;
  }
  return `${sourceName}(1)`;
}

/**
 * The single renderer path for reconstructing a saved run. History and Results
 * both call this helper before handing the request to the app shell.
 */
export function createRerunRequest(record: RunRecord): RerunRequest {
  const config = reconstructConfig(record, makeStamp());
  return {
    sourceRecord: record,
    config: { ...config, name: nextRerunName(record.config.name) },
  };
}
