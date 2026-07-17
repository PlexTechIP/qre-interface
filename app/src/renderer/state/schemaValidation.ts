/**
 * Submit-level validation: check a serialized RunConfig against the committed
 * JSON Schema (the same artifact the MockEngine validates against). The rules
 * are NOT re-encoded here — the schema is the single source of truth.
 */

import Ajv from "ajv";
import addFormats from "ajv-formats";

import runConfigSchema from "../../shared/contracts/runconfig.schema.json";
import type { RunConfig } from "../../shared/types";

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(runConfigSchema);

export interface SchemaValidationResult {
  valid: boolean;
  /** Empty when valid; human-readable, newline-separated otherwise. */
  errors: string;
}

export function validateRunConfigSchema(config: RunConfig): SchemaValidationResult {
  const valid = validate(config);
  return {
    valid,
    errors: valid ? "" : ajv.errorsText(validate.errors, { separator: "\n" }),
  };
}
