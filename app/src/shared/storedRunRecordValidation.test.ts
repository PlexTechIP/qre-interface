// @vitest-environment node

/**
 * Reading a run someone saved months ago.
 *
 * Two rules the codebase holds independently combine into a defect neither one
 * looks like on its own:
 *
 *   1. The three committed schemas pin `schemaVersion` to a `const`.
 *   2. `upgradeRunConfig` leaves `schemaVersion` AS SAVED, on purpose — "a run
 *      configured under 1.1.0 must keep saying 1.1.0 in History and in exports;
 *      claiming a later version would be a lie about what the user actually
 *      chose."
 *
 * Together they mean `validateRunRecord` rejects every legitimately old record,
 * permanently and by construction. That is correct for the SAVE path, which is
 * what it was written for. Used as a READ gate it made history unreadable: in a
 * real 22-run history, seven runs failed it, all seven for nothing but their
 * version stamp, and since `qre_list_runs` validates a whole page, one of them
 * made the default page — the answer to "what runs do I have saved?" — fail.
 */

import { describe, expect, it } from "vitest";

import {
  validateRunRecord,
  validateStoredRunRecord,
} from "./runRecordValidation.js";
import { buildRunRecord } from "./testing/builders.js";
import type { RunRecord } from "./types.js";

/** The same record as it would have been written by an older build. */
function asSavedByVersion(record: RunRecord, version: string): unknown {
  return {
    ...record,
    schemaVersion: version,
    config: { ...record.config, schemaVersion: version },
    result: { ...record.result, schemaVersion: version },
  };
}

describe("validateStoredRunRecord", () => {
  it("accepts a sound record that an older build wrote", () => {
    const old = asSavedByVersion(buildRunRecord(), "1.0.0");

    // The precondition: the strict validator rejects it, which is the whole
    // reason this function exists.
    expect(validateRunRecord(old).valid).toBe(false);
    expect(validateStoredRunRecord(old).valid).toBe(true);
  });

  it("accepts every version this app has shipped", () => {
    for (const version of ["1.0.0", "1.1.0", "1.2.0", "1.3.0", "1.4.0"]) {
      const record = asSavedByVersion(buildRunRecord(), version);

      expect(
        validateStoredRunRecord(record).valid,
        `a record saved under ${version} should still be readable`,
      ).toBe(true);
    }
  });

  it("still rejects a record that is actually malformed", () => {
    const broken = asSavedByVersion(buildRunRecord(), "1.0.0") as {
      config: Record<string, unknown>;
    };
    delete broken.config.architecture;

    const result = validateStoredRunRecord(broken);

    expect(result.valid).toBe(false);
    // And says what is wrong with it, not what version it is.
    expect(result.errors).toContain("architecture");
  });

  it("still enforces the id invariant JSON Schema cannot express", () => {
    const record = buildRunRecord();
    const mismatched = asSavedByVersion(record, "1.0.0") as {
      result: Record<string, unknown>;
    };
    mismatched.result.runId = "a-different-id";

    expect(validateStoredRunRecord(mismatched).valid).toBe(false);
  });

  it("rejects something that is not a record at all", () => {
    for (const value of [null, undefined, 42, "run", [], {}]) {
      expect(validateStoredRunRecord(value).valid, `${String(value)}`).toBe(false);
    }
  });

  it("does not modify the record it was given", () => {
    const old = asSavedByVersion(buildRunRecord(), "1.0.0") as {
      schemaVersion: string;
    };

    validateStoredRunRecord(old);

    // The version a run was saved with is data the projection still reports.
    expect(old.schemaVersion).toBe("1.0.0");
  });
});
