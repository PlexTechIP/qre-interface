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
