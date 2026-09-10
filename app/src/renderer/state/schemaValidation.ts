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

/** One schema failure, with the field it is about already separated out. */
export interface SchemaIssue {
  /** Top-level config field, or "schema" when the failure is about the whole. */
  field: string;
  message: string;
}

export interface SchemaValidationResult {
  valid: boolean;
  /** Empty when valid; human-readable, newline-separated otherwise. */
  errors: string;
  /**
   * The same failures, structured.
   *
   * Ajv reports a JSON Pointer `instancePath` ("/architecture/errorRate"), and
   * recovering the field by parsing the rendered text is guesswork — a caller
   * that tried it with a `data.field` pattern matched nothing and labelled
   * every error "schema". Read the pointer instead.
   */
  issues: SchemaIssue[];
}

function issuesFrom(errors: typeof validate.errors): SchemaIssue[] {
  return (errors ?? []).map((error) => {
    const [, fromPath] = error.instancePath.split("/");
    // A missing required property reports instancePath "" — the field it is
    // about is in `params.missingProperty`, and naming the field is the whole
    // value of this function.
    const missing =
      error.keyword === "required"
        ? (error.params as { missingProperty?: string }).missingProperty
        : undefined;
    const field =
      fromPath !== undefined && fromPath.length > 0
        ? fromPath
        : (missing ?? "schema");
    return {
      field,
      message: `${error.instancePath || "config"} ${error.message ?? "is invalid"}`,
    };
  });
}

export function validateRunConfigSchema(config: RunConfig): SchemaValidationResult {
  const valid = validate(config);
  return {
    valid,
    errors: valid ? "" : ajv.errorsText(validate.errors, { separator: "\n" }),
    issues: valid ? [] : issuesFrom(validate.errors),
  };
}
