/**
 * Run-store harness — a documented, runnable proof of the Part 2 `RunStore`
 * surface end to end: save -> list/query (every History filter field) ->
 * get (byte-faithful) -> reconstruct (Rerun) -> delete, against the seven
 * committed records plus one run captured live through `MockEngine` (not a
 * static fixture). Immutability (write-once; a Rerun saves as a new record,
 * never edits the old one) is demonstrated at the end.
 *
 * Run with: `npm run harness` (see app/src/main/README.md).
 *
 * By default this runs against a throwaway temp directory so repeat runs
 * never collide with leftover state. Set `QRE_DB_PATH` to point it at a real
 * file instead (e.g. the default resolved by `resolveDefaultDatabasePath()`);
 * in that case the file is left in place afterwards.
 */

import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  SAMPLE_RUN_RECORDS as MOCK_RUN_RECORDS,
  buildBenchmarkConfig,
  buildSuccessResult,
  fakeEstimator,
} from "../shared/testing/index.js";
import { RunRecordExistsError } from "../shared/runStore.js";
import { makeRunRecord, type RunConfig, type RunFilter } from "../shared/types.js";
import { resolveDefaultDatabasePath } from "./dataDir.js";
import { loadForRerun } from "./rerun.js";
import { SqliteRunStore } from "./sqliteRunStore.js";

/**
 * The version the sample corpus stamps on most of its records — read from the
 * fixtures rather than hardcoded, so this step keeps demonstrating a real
 * multi-record narrowing instead of silently matching nothing when the corpus
 * is restamped.
 *
 * This is FIXTURE PROVENANCE, not the live engine version: the corpus carries
 * more than one version on purpose so the filter has something to discriminate.
 * Don't read it as what the app currently runs against.
 */
function corpusQreVersion(): string {
  const counts = new Map<string, number>();
  for (const record of MOCK_RUN_RECORDS) {
    const version = record.result.qreVersion;
    counts.set(version, (counts.get(version) ?? 0) + 1);
  }
  const [mostCommon] = [...counts.entries()].sort(([, a], [, b]) => b - a);
  return mostCommon?.[0] ?? "";
}

const SAMPLE_QRE_VERSION = corpusQreVersion();

const FILTER_STEPS: readonly { label: string; filter: RunFilter }[] = [
  { label: "nameSearch: grover", filter: { nameSearch: "grover" } },
  { label: "application: quantum-dynamics", filter: { application: "quantum-dynamics" } },
  { label: "architecture: majorana", filter: { architecture: "majorana" } as const },
  { label: "qecCode: three_aux", filter: { qecCode: "three_aux" } as const },
  { label: "magicStateFactory: litinski19", filter: { magicStateFactory: "litinski19" } },
  {
    label: `qreVersion: ${SAMPLE_QRE_VERSION} (sample corpus, not the live engine)`,
    filter: { qreVersion: SAMPLE_QRE_VERSION },
  },
];

function log(message: string): void {
  console.log(message);
}

function fail(message: string): never {
  throw new Error(message);
}

async function main(): Promise<void> {
  const usingExplicitPath = process.env.QRE_DB_PATH !== undefined && process.env.QRE_DB_PATH.length > 0;
  const scratchDirectory = usingExplicitPath ? null : mkdtempSync(join(tmpdir(), "qre-run-store-harness-"));
  const databasePath = usingExplicitPath
    ? resolveDefaultDatabasePath()
    : join(scratchDirectory as string, "run-history.sqlite");

  log(`Opening SQLite run store at: ${databasePath}`);
  const store = new SqliteRunStore(databasePath);

  try {
    // 1. save() — every committed record.
    for (const record of MOCK_RUN_RECORDS) {
      await store.save(record);
    }
    log(`save(): persisted ${MOCK_RUN_RECORDS.length} committed records.`);

    // 2. save() — one run captured live through the EstimatorService boundary,
    //    not a static fixture (proves the whole pipeline, not just fixture replay).
    const engine = fakeEstimator(buildSuccessResult());
    const capturedConfig: RunConfig = {
      ...buildBenchmarkConfig(),
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };
    const capturedResult = await engine.run(capturedConfig);
    const capturedRecord = makeRunRecord(capturedConfig, capturedResult, new Date().toISOString());
    await store.save(capturedRecord);
    log(`save(): persisted 1 live-captured record (id ${capturedRecord.id}).`);

    // 3. list() — newest-first.
    const all = await store.list();
    log(`list(): ${all.length} records, newest-first.`);
    if (all.length !== MOCK_RUN_RECORDS.length + 1) {
      fail(`Expected ${MOCK_RUN_RECORDS.length + 1} records, found ${all.length}.`);
    }

    // 4. query() — every filter field the History surface exposes.
    for (const { label, filter } of FILTER_STEPS) {
      const matches = await store.query(filter);
      log(`query({ ${label} }): ${matches.length} match(es).`);
    }

    // 5. get() — byte-faithful round trip, raw included.
    const roundTripped = await store.get(capturedRecord.id);
    const roundTrips = JSON.stringify(roundTripped) === JSON.stringify(capturedRecord);
    log(`get(): byte-faithful round trip ${roundTrips ? "OK" : "FAILED"}.`);
    if (!roundTrips) fail("Round-trip fidelity check failed.");

    // 6. reconstruct() — the Rerun load path: get(id) -> reconstructConfig.
    const rerunStamp = { id: randomUUID(), createdAt: new Date().toISOString() };
    const rerunConfig = await loadForRerun(store, capturedRecord.id, rerunStamp);
    log(`reconstruct(): fresh RunConfig id ${rerunConfig.id}, carried from ${capturedRecord.id}.`);

    // 7. Immutability — re-saving an existing id is rejected; Rerun saves as a
    //    new record, and the original is untouched.
    let duplicateRejected = false;
    try {
      await store.save(capturedRecord);
    } catch (error) {
      duplicateRejected = error instanceof RunRecordExistsError;
    }
    log(`immutability: duplicate save rejected: ${duplicateRejected ? "OK" : "FAILED"}.`);
    if (!duplicateRejected) fail("Immutability check failed: duplicate save was not rejected.");

    const rerunResult = await engine.run(rerunConfig);
    const rerunRecord = makeRunRecord(rerunConfig, rerunResult, new Date().toISOString());
    await store.save(rerunRecord);
    const originalStillIntact = (await store.get(capturedRecord.id))?.config.id === capturedRecord.id;
    log(
      `immutability: Rerun saved as a new record (${rerunRecord.id}); original ` +
        `${originalStillIntact ? "untouched (OK)" : "MISSING (FAILED)"}.`,
    );
    if (!originalStillIntact) fail("Immutability check failed: original record disappeared after Rerun.");

    // 8. delete()
    await store.delete(capturedRecord.id);
    const afterDelete = await store.get(capturedRecord.id);
    log(`delete(): record removed: ${afterDelete === null ? "OK" : "FAILED"}.`);
    if (afterDelete !== null) fail("Delete check failed: record still present.");

    log("Harness complete: save, list/query, get, reconstruct, delete, and immutability all verified.");
  } finally {
    store.close();
    if (scratchDirectory !== null) rmSync(scratchDirectory, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
