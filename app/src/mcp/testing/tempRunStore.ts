/**
 * Test helper: create a temporary run store with sample data.
 *
 * This module is TEST-ONLY and must NOT be imported from production code.
 * It is only imported by *.test.ts files to set up test fixtures.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteRunStore } from "../../main/sqliteRunStore.js";
import type { RunRecord } from "../../shared/types.js";

/**
 * Create a temporary directory and an empty SqliteRunStore in it.
 * Returns the path and the store. The caller should clean up via removeTempRunStore.
 */
export async function createTempRunStore(): Promise<{
  dbPath: string;
  store: SqliteRunStore;
}> {
  const tempDir = mkdtempSync(join(tmpdir(), "qre-mcp-test-"));
  const dbPath = join(tempDir, "test-runs.sqlite");

  const store = new SqliteRunStore(dbPath);

  return { dbPath, store };
}

/**
 * Seed a temporary store with sample records.
 */
export async function seedTempRunStore(
  store: SqliteRunStore,
  records: RunRecord[],
): Promise<void> {
  for (const record of records) {
    await store.save(record);
  }
}

/**
 * Clean up a temporary store and its directory.
 */
export function removeTempRunStore(dbPath: string): void {
  const tempDir = dbPath.split("/").slice(0, -1).join("/");
  try {
    rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}
