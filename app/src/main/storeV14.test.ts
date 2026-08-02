// @vitest-environment node

/**
 * A v1.4.0 record has to survive the STORE boundary, not just schema validation
 * in isolation.
 *
 * `SqliteRunStore.save` validates through `validateRunRecord`, which reaches the
 * config only via a `$ref` from runrecord.schema.json to runconfig.schema.json.
 * That indirection is what makes v1.4.0's additions propagate for free, and
 * nothing asserted it — so inlining the config schema into runrecord, or letting
 * the two `schemaVersion` consts drift, would reject every save at runtime while
 * the whole suite stayed green. The visible symptom would be model-assisted runs
 * silently never reaching History.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { buildRunConfig, buildRunResult } from "../shared/testing/builders.js";
import { validateRunRecord } from "../shared/runRecordValidation.js";
import { makeRunRecord, type RunConfig, type RunRecord } from "../shared/types.js";
import { SqliteRunStore } from "./sqliteRunStore.js";

const RUN_ID = "1f400000-0000-4000-8000-000000000001";

/** Everything v1.4.0 added, on one record. */
function v140Config(): RunConfig {
  return buildRunConfig({
    id: RUN_ID,
    architecture: {
      type: "majorana",
      errorRate: 0.00001,
      operationTime: 1000,
      tErrorRate: 0.01,
      targetYear: 2030,
    },
    qecCode: "three_aux",
    magicStateFactories: ["round_based"],
    traceTransform: {
      tStatesPerRotation: 20,
      ccxMagicStates: false,
      slowDownFactor: 1.0,
      dynamicMemoryCompute: {
        computeCapacityPercentage: 0.5,
        evictionStrategy: "least_recently_used",
      },
      unmemory: true,
    },
    provenance: { authoredBy: "model_assisted", model: "some-provider/some-model" },
  });
}

function v140Record(): RunRecord {
  const config = v140Config();
  return makeRunRecord(
    config,
    buildRunResult({ runId: config.id }),
    "2026-07-31T00:00:00.000Z",
  );
}

const dirs: string[] = [];

function store(): SqliteRunStore {
  const dir = mkdtempSync(join(tmpdir(), "qre-v14-store-"));
  dirs.push(dir);
  return new SqliteRunStore(join(dir, "run-history.sqlite"));
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("a v1.4.0 record clears the record schema", () => {
  it("validates through the runrecord -> runconfig $ref chain", () => {
    const result = validateRunRecord(v140Record());

    expect(result.errors).toBe("");
    expect(result.valid).toBe(true);
  });
});

describe("a v1.4.0 record round-trips through SqliteRunStore", () => {
  it("saves without the save-time validation rejecting it", async () => {
    const runStore = store();
    await expect(runStore.save(v140Record())).resolves.toBeUndefined();
  });

  it("reads back every v1.4.0 field intact", async () => {
    // JSON round-trip through the record_json column: the optional stages and
    // provenance live only there, so a serialization gap would show up here and
    // nowhere else.
    const runStore = store();
    await runStore.save(v140Record());

    const loaded = await runStore.get(RUN_ID);
    expect(loaded).not.toBeNull();

    const architecture = loaded!.config.architecture;
    expect(architecture.type).toBe("majorana");
    if (architecture.type === "majorana") {
      expect(architecture.tErrorRate).toBe(0.01);
      expect(architecture.targetYear).toBe(2030);
    }
    expect(loaded!.config.traceTransform.dynamicMemoryCompute).toEqual({
      computeCapacityPercentage: 0.5,
      evictionStrategy: "least_recently_used",
    });
    expect(loaded!.config.traceTransform.unmemory).toBe(true);
    expect(loaded!.config.provenance).toEqual({
      authoredBy: "model_assisted",
      model: "some-provider/some-model",
    });
  });

  it("survives list() as well as get()", async () => {
    // list() goes through the same upgrade/parse path as get(); a v1.4.0 record
    // must not be mangled by `upgradeRunRecord` on the way out.
    const runStore = store();
    await runStore.save(v140Record());

    const all = await runStore.list();
    expect(all).toHaveLength(1);
    expect(all[0]!.config.provenance?.authoredBy).toBe("model_assisted");
  });
});
