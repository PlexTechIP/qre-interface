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
 * The single renderer path for reconstructing a saved run. History and Results
 * both call this helper before handing the request to the app shell.
 */
export function createRerunRequest(record: RunRecord): RerunRequest {
  return {
    sourceRecord: record,
    config: reconstructConfig(record, makeStamp()),
  };
}
