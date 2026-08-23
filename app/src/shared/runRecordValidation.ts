/**
 * Contract validation for RunRecord — check a record (and, by reference, its
 * embedded RunConfig and RunResult) against the committed JSON Schemas.
 *
 * The rules are NOT re-encoded here — the three schemas are the single source
 * of truth. Team 2's SQLite store validates on save with this; the test suite
 * validates every committed fixture with it. The runconfig/runresult schemas
 * are registered in the same Ajv instance so runrecord's `$ref`s resolve.
 */

import Ajv from "ajv";
import addFormats from "ajv-formats";

import runConfigSchema from "./contracts/runconfig.schema.json";
import runResultSchema from "./contracts/runresult.schema.json";
import runRecordSchema from "./contracts/runrecord.schema.json";
import type { RunRecord } from "./types";

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
ajv.addSchema(runConfigSchema);
ajv.addSchema(runResultSchema);
const validate = ajv.compile(runRecordSchema);

export interface RunRecordValidationResult {
  valid: boolean;
  /** Empty when valid; human-readable, newline-separated otherwise. */
  errors: string;
}

/**
 * Structural + cross-field validation. `validate` covers the schema; the
 * `id === config.id === result.runId` invariant is not expressible in JSON
 * Schema, so it is checked here (makeRunRecord enforces it at mint time).
 */
export function validateRunRecord(record: unknown): RunRecordValidationResult {
  const schemaValid = validate(record);
  if (!schemaValid) {
    return { valid: false, errors: ajv.errorsText(validate.errors, { separator: "\n" }) };
  }
  const r = record as unknown as RunRecord;
  if (r.id !== r.config.id || r.id !== r.result.runId) {
    return {
      valid: false,
      errors: `id/config.id/result.runId mismatch: id=${r.id}, config.id=${r.config.id}, result.runId=${r.result.runId}`,
    };
  }
  return { valid: true, errors: "" };
}

/** The version each committed schema pins, read from the artifact itself. */
function pinnedVersion(schema: unknown): string | undefined {
  const constant = (
    schema as { properties?: { schemaVersion?: { const?: unknown } } }
  ).properties?.schemaVersion?.const;
  return typeof constant === "string" ? constant : undefined;
}

/**
 * Rewrite only the three version stamps, leaving everything else alone.
 * Returns null if the record is not even shaped like one.
 */
function restampVersions(record: unknown): unknown | null {
  if (typeof record !== "object" || record === null) return null;
  const { config, result } = record as { config?: unknown; result?: unknown };
  if (typeof config !== "object" || config === null) return null;
  if (typeof result !== "object" || result === null) return null;

  return {
    ...record,
    schemaVersion: pinnedVersion(runRecordSchema),
    config: { ...config, schemaVersion: pinnedVersion(runConfigSchema) },
    result: { ...result, schemaVersion: pinnedVersion(runResultSchema) },
  };
}

/**
 * Validate a record that is being READ, where its age is not a defect.
 *
 * `validateRunRecord` answers "could this be saved right now?", and the three
 * schemas pin `schemaVersion` to a `const`. That is right on the way in — a
 * record written today must be current — and unusable on the way out, because
 * `upgradeRunConfig` deliberately leaves `schemaVersion` as saved: "a run
 * configured under 1.1.0 must keep saying 1.1.0 in History and in exports;
 * claiming a later version would be a lie about what the user actually chose."
 *
 * Those two rules together mean the strict validator rejects every legitimately
 * old record, permanently and by construction. Used as a read gate it did:
 * seven of twenty-two runs in a real history failed it, all seven for nothing
 * but their version stamp, and because `qre_list_runs` validates a whole page
 * one of them made the default page — the answer to "what runs do I have?" —
 * fail outright.
 *
 * So this asks the question a reader actually has: is the record SOUND, whatever
 * wrote it? The committed schemas still decide, unmodified; only the version
 * stamps are set aside, and the record itself is not changed — callers keep
 * projecting the original, which still reports the version it was saved with.
 *
 * The store's own `save` path keeps using the strict validator.
 */
export function validateStoredRunRecord(
  record: unknown,
): RunRecordValidationResult {
  const strict = validateRunRecord(record);
  if (strict.valid) return strict;

  const restamped = restampVersions(record);
  if (restamped === null) return strict;

  // Re-run in full, so the id/config.id/result.runId invariant is still checked.
  return validateRunRecord(restamped);
}
