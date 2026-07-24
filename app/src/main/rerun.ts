import type { RunConfig, RunStore } from "../shared/types.js";
import { reconstructConfig } from "../shared/types.js";

/** Thrown when the Rerun load path is asked for an id with no saved record. */
export class RunRecordNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`No run record found for id ${id}.`);
    this.name = "RunRecordNotFoundError";
  }
}

/**
 * The Rerun load path: `get(id)` a saved record from the store, then hand it
 * to the committed `reconstructConfig` helper. The pre-fill target is a
 * `RunConfig` (the frozen shape), not Team 1's `FormState` — hydrating the
 * live form from it and navigating there is week-4 integration.
 */
export async function loadForRerun(
  store: RunStore,
  id: string,
  stamp: { id: string; createdAt: string },
): Promise<RunConfig> {
  const record = await store.get(id);
  if (record === null) throw new RunRecordNotFoundError(id);
  return reconstructConfig(record, stamp);
}
