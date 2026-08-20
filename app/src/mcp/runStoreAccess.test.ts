/**
 * The MCP server is specified to read the dashboard's run store and never to
 * change it: the design's CLOSED-1 rule is that the dashboard stays the sole
 * migration owner, and week 6's brief allows no write path at all.
 *
 * These tests hold that line at the connection, not at the call site. They
 * assert what the database looks like from the outside after the server has
 * used it, so a future tool cannot reintroduce a write by accident.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { chmodSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readdirSync as readdirRecursive } from "node:fs";

import { SqliteRunStore } from "../main/sqliteRunStore.js";
import { buildRunRecord } from "../shared/testing/builders.js";
import {
  closeRunStore,
  getRunStore,
  resetRunStoreForTests,
  type StoreAccessError,
} from "./runStoreAccess.js";

/** Everything an outside observer can see about the database file. */
interface DatabaseFingerprint {
  files: string[];
  userVersion: number;
  journalMode: string;
  size: number;
  modifiedMs: number;
}

function fingerprint(directory: string, dbPath: string): DatabaseFingerprint {
  const probe = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const version = probe.prepare("PRAGMA user_version").get() as {
      user_version: number;
    };
    const journal = probe.prepare("PRAGMA journal_mode").get() as {
      journal_mode: string;
    };
    const stats = statSync(dbPath);
    return {
      files: readdirSync(directory).sort(),
      userVersion: version.user_version,
      journalMode: journal.journal_mode,
      size: stats.size,
      modifiedMs: stats.mtimeMs,
    };
  } finally {
    probe.close();
  }
}

/**
 * Build a populated store the way the dashboard would, then put it back into
 * rollback-journal mode. WAL is what the dashboard leaves behind; `delete` is
 * the mode that makes an unwanted write by the MCP server visible.
 */
async function createDashboardDatabase(): Promise<{
  directory: string;
  dbPath: string;
}> {
  const directory = mkdtempSync(join(tmpdir(), "qre-mcp-readonly-"));
  const dbPath = join(directory, "run-history.sqlite");

  const store = new SqliteRunStore(dbPath);
  await store.save(
    buildRunRecord({
      config: { id: "11111111-1111-4111-8111-111111111111", name: "shor 2048" },
    }),
  );
  await store.save(
    buildRunRecord({
      config: {
        id: "22222222-2222-4222-8222-222222222222",
        name: "grover search",
      },
    }),
  );
  store.close();

  const reset = new DatabaseSync(dbPath);
  reset.exec("PRAGMA journal_mode = DELETE");
  reset.close();

  return { directory, dbPath };
}

describe("getRunStore", () => {
  let directory: string;
  let dbPath: string;
  const savedDbPath = process.env.QRE_DB_PATH;

  beforeEach(async () => {
    resetRunStoreForTests();
    ({ directory, dbPath } = await createDashboardDatabase());
    process.env.QRE_DB_PATH = dbPath;
  });

  afterEach(() => {
    resetRunStoreForTests();
    if (savedDbPath === undefined) delete process.env.QRE_DB_PATH;
    else process.env.QRE_DB_PATH = savedDbPath;
    rmSync(directory, { recursive: true, force: true });
  });

  it("reads the records the dashboard saved", async () => {
    const runs = await getRunStore().list();

    expect(runs.map((run) => run.config.name).sort()).toEqual([
      "grover search",
      "shor 2048",
    ]);
  });

  it("leaves the database byte-for-byte unchanged after a read", async () => {
    const before = fingerprint(directory, dbPath);

    const store = getRunStore();
    await store.list();
    await store.query({ architecture: "gateBased" });
    await store.get("no-such-run");
    closeRunStore();

    expect(fingerprint(directory, dbPath)).toEqual(before);
  });

  it("does not switch a rollback-journal database to WAL", async () => {
    await getRunStore().list();
    closeRunStore();

    expect(fingerprint(directory, dbPath).journalMode).toBe("delete");
  });

  it("creates no -wal or -shm sidecar files", async () => {
    await getRunStore().list();

    expect(readdirSync(directory).sort()).toEqual(["run-history.sqlite"]);
  });

  it("exposes no way to write", () => {
    const store = getRunStore() as unknown as Record<string, unknown>;

    expect(store.save).toBeUndefined();
    expect(store.delete).toBeUndefined();
  });

  it("refuses a database whose schema version it does not support", async () => {
    const bump = new DatabaseSync(dbPath);
    bump.exec("PRAGMA user_version = 99");
    bump.close();
    resetRunStoreForTests();

    expect(() => getRunStore()).toThrowError(
      expect.objectContaining({ code: "DB_SCHEMA_MISMATCH" }),
    );
  });

  it("reports a missing database without disclosing where it looked", () => {
    process.env.QRE_DB_PATH = join(directory, "absent.sqlite");
    resetRunStoreForTests();

    let thrown: StoreAccessError | undefined;
    try {
      getRunStore();
    } catch (error) {
      thrown = error as StoreAccessError;
    }

    expect(thrown?.code).toBe("DB_NOT_FOUND");
    expect(thrown?.message).not.toContain(directory);
  });

  it("reports an unset QRE_DB_PATH as a configuration problem", () => {
    delete process.env.QRE_DB_PATH;
    resetRunStoreForTests();

    expect(() => getRunStore()).toThrowError(
      expect.objectContaining({ code: "DB_NOT_CONFIGURED" }),
    );
  });

  it("reports a database it cannot open for reading as DB_READONLY", async () => {
    // A WAL database needs to create a -shm file even to read it, so a
    // directory the user cannot write to fails the open. Root ignores the
    // permission bits, so there is nothing to observe there.
    if (typeof process.getuid === "function" && process.getuid() === 0) return;

    const wal = new DatabaseSync(dbPath);
    wal.exec("PRAGMA journal_mode = WAL");
    wal.close();
    resetRunStoreForTests();

    chmodSync(directory, 0o500);
    try {
      expect(() => getRunStore()).toThrowError(
        expect.objectContaining({ code: "DB_READONLY" }),
      );
    } finally {
      chmodSync(directory, 0o700);
    }
  });

  it("closes the connection when the cache is reset", async () => {
    const store = getRunStore();
    await store.list();

    resetRunStoreForTests();

    await expect(store.list()).rejects.toThrowError(/not open/);
  });
});

describe("the MCP layer's store access", () => {
  it("never constructs the read-write SqliteRunStore", () => {
    const offenders: string[] = [];

    const walk = (directoryPath: string): void => {
      for (const entry of readdirRecursive(directoryPath, {
        withFileTypes: true,
      })) {
        const entryPath = join(directoryPath, entry.name);
        if (entry.isDirectory()) {
          walk(entryPath);
        } else if (
          entry.name.endsWith(".ts") &&
          !entry.name.endsWith(".test.ts") &&
          !entryPath.includes(`${join("mcp", "testing")}`)
        ) {
          if (readFileSync(entryPath, "utf8").includes("new SqliteRunStore(")) {
            offenders.push(entryPath);
          }
        }
      }
    };

    walk(join(process.cwd(), "src", "mcp"));

    expect(offenders).toEqual([]);
  });
});
