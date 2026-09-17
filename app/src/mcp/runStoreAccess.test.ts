/**
 * The MCP server reads the dashboard's run store, appends to it only through
 * `getAppendStore()`, and migrates it never: CLOSED-1 now says the dashboard
 * stays the sole MIGRATION owner rather than the sole writer.
 *
 * These tests hold that line at the connection, not at the call site. The
 * fingerprint tests assert what the database looks like from the outside after
 * the READ path has used it — byte-for-byte unchanged, still in its own journal
 * mode — so a future read tool cannot reintroduce a write by accident. The
 * `getAppendStore` tests assert the other half: that the one caller allowed to
 * write still cannot migrate, and still cannot bring a database into existence
 * at a path nothing lives at.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { chmodSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readdirSync as readdirRecursive } from "node:fs";

import { SqliteRunStore } from "../main/sqliteRunStore.js";
import { resolveLocationPointerPath } from "../main/dataDir.js";
import { publishRunDatabaseLocation } from "../main/publishDataLocation.js";
import { buildRunRecord } from "../shared/testing/builders.js";
import {
  closeRunStore,
  getAppendStore,
  getRunStore,
  isTransientLockFailure,
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
  let home: string;
  const savedDbPath = process.env.QRE_DB_PATH;
  const savedHome = process.env.HOME;

  beforeEach(async () => {
    resetRunStoreForTests();
    ({ directory, dbPath } = await createDashboardDatabase());
    home = mkdtempSync(join(tmpdir(), "qre-mcp-home-"));
    process.env.QRE_DB_PATH = dbPath;
  });

  afterEach(() => {
    resetRunStoreForTests();
    if (savedDbPath === undefined) delete process.env.QRE_DB_PATH;
    else process.env.QRE_DB_PATH = savedDbPath;
    if (savedHome === undefined) delete process.env.HOME;
    else process.env.HOME = savedHome;
    rmSync(directory, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
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

  it("finds the database the dashboard published, with no environment variable set", async () => {
    delete process.env.QRE_DB_PATH;
    process.env.HOME = home;
    publishRunDatabaseLocation(dbPath);
    resetRunStoreForTests();

    const runs = await getRunStore().list();

    expect(runs.map((run) => run.config.name).sort()).toEqual([
      "grover search",
      "shor 2048",
    ]);
  });

  it("lets an explicit QRE_DB_PATH win over what the dashboard published", async () => {
    process.env.HOME = home;
    publishRunDatabaseLocation(join(home, "never-created.sqlite"));
    process.env.QRE_DB_PATH = dbPath;
    resetRunStoreForTests();

    await expect(getRunStore().list()).resolves.toHaveLength(2);
  });

  it("tells an unconfigured caller how to fix it", () => {
    delete process.env.QRE_DB_PATH;
    process.env.HOME = home;
    resetRunStoreForTests();

    let thrown: StoreAccessError | undefined;
    try {
      getRunStore();
    } catch (error) {
      thrown = error as StoreAccessError;
    }

    expect(thrown?.code).toBe("DB_NOT_CONFIGURED");
    // Naming the variable is not enough — a first-time user has no idea what
    // to set it to. Point them at the two things that produce an answer.
    expect(thrown?.message).toMatch(/QRE Interface/);
    expect(thrown?.message).toMatch(/QRE_DB_PATH/);
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

  /**
   * SQLite keeps reading an unlinked file, so a server that opened the history
   * before the analyst deleted it and relaunched the dashboard answered every
   * list from the old inode — the runs they could see were not the runs it
   * reported, for as long as the process lived.
   */
  it("notices when the database file has been replaced", async () => {
    await expect(getRunStore().list()).resolves.toHaveLength(2);

    rmSync(dbPath);
    const replacement = new SqliteRunStore(dbPath);
    await replacement.save(
      buildRunRecord({
        config: { id: "33333333-3333-4333-8333-333333333333", name: "fresh start" },
      }),
    );
    replacement.close();

    const runs = await getRunStore().list();

    expect(runs.map((run) => run.config.name)).toEqual(["fresh start"]);
  });

  it("follows QRE_DB_PATH when it changes between calls", async () => {
    await expect(getRunStore().list()).resolves.toHaveLength(2);

    const otherPath = join(directory, "other.sqlite");
    const other = new SqliteRunStore(otherPath);
    await other.save(
      buildRunRecord({
        config: { id: "44444444-4444-4444-8444-444444444444", name: "elsewhere" },
      }),
    );
    other.close();
    process.env.QRE_DB_PATH = otherPath;

    const runs = await getRunStore().list();

    expect(runs.map((run) => run.config.name)).toEqual(["elsewhere"]);
  });

  it("refuses to keep reading a database migrated under it", async () => {
    await expect(getRunStore().list()).resolves.toHaveLength(2);

    const bump = new DatabaseSync(dbPath);
    bump.exec("PRAGMA user_version = 99");
    bump.close();

    expect(() => getRunStore()).toThrowError(
      expect.objectContaining({ code: "DB_SCHEMA_MISMATCH" }),
    );
  });

  it("reports a database that disappeared as DB_NOT_FOUND on the next call", async () => {
    await expect(getRunStore().list()).resolves.toHaveLength(2);

    rmSync(dbPath);

    expect(() => getRunStore()).toThrowError(
      expect.objectContaining({ code: "DB_NOT_FOUND" }),
    );
  });

  /**
   * `getRunStore()` is synchronous, but a handler holds what it returned across
   * awaits — `listRuns` reads the keys, awaits, then reads the page — and two
   * requests arriving in one stdin chunk interleave at microtask granularity.
   * Closing a replaced connection here therefore closed the one another
   * handler was about to use, whose next read threw `ERR_INVALID_STATE` and
   * reached the client as a generic `STORE_READ_FAILED` naming nothing.
   */
  it("does not close a connection a caller is still holding", async () => {
    const held = getRunStore();
    await expect(held.list()).resolves.toHaveLength(2);

    rmSync(dbPath);
    const replacement = new SqliteRunStore(dbPath);
    await replacement.save(
      buildRunRecord({
        config: { id: "55555555-5555-4555-8555-555555555555", name: "fresh start" },
      }),
    );
    replacement.close();

    const reopened = getRunStore();
    expect(reopened).not.toBe(held);
    await expect(reopened.list()).resolves.toHaveLength(1);
    await expect(held.list(), "the retired connection was closed under its holder")
      .resolves.toHaveLength(2);
  });

  it("closes a retired connection at shutdown", async () => {
    const held = getRunStore();
    rmSync(dbPath);
    const replacement = new SqliteRunStore(dbPath);
    replacement.close();
    getRunStore();

    closeRunStore();

    await expect(held.list()).rejects.toThrowError(/not open/);
  });

  /**
   * Not knowing where the database is says nothing about where it went. The
   * pointer file is rewritten by the dashboard, and a reader that caught it
   * mid-write read "" — so a server that had just answered a query reported
   * `DB_NOT_CONFIGURED` ("Launch the QRE Dashboard once…") and dropped the
   * connection it was answering from.
   */
  it("keeps an open connection when the pointer cannot be read", async () => {
    delete process.env.QRE_DB_PATH;
    process.env.HOME = home;
    publishRunDatabaseLocation(dbPath);
    resetRunStoreForTests();

    const store = getRunStore();
    await expect(store.list()).resolves.toHaveLength(2);

    // What a truncate-then-write looks like to a reader that arrives between
    // the two halves.
    writeFileSync(resolveLocationPointerPath(), "", "utf8");

    expect(() => getRunStore()).toThrowError(
      expect.objectContaining({ code: "DB_NOT_CONFIGURED" }),
    );
    await expect(store.list()).resolves.toHaveLength(2);

    publishRunDatabaseLocation(dbPath);
    expect(getRunStore()).toBe(store);
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

/**
 * Which SQLite failures mean "not now" rather than "not ever".
 *
 * The per-call schema re-check treats a throw as a dead connection and reopens.
 * A busy database is neither: SQLite has already waited out the five-second
 * timeout, and the connection that reported it still works — so discarding it
 * paid the timeout twice, once in the call that failed and once in the reopen,
 * and threw away a handle that would have answered the next call.
 */
describe("isTransientLockFailure", () => {
  it("recognises a busy or locked database, including extended result codes", () => {
    expect(isTransientLockFailure({ errcode: 5 })).toBe(true);
    expect(isTransientLockFailure({ errcode: 6 })).toBe(true);
    // SQLITE_BUSY_RECOVERY: the primary code lives in the low byte.
    expect(isTransientLockFailure({ errcode: 261 })).toBe(true);
  });

  it("does not excuse a failure that will not pass on its own", () => {
    expect(isTransientLockFailure({ errcode: 1544 })).toBe(false); // READONLY_DIRECTORY
    expect(isTransientLockFailure({ errcode: 14 })).toBe(false); // CANTOPEN
    expect(isTransientLockFailure({ errcode: 11 })).toBe(false); // CORRUPT
    expect(isTransientLockFailure(new Error("database is not open"))).toBe(false);
    expect(isTransientLockFailure(undefined)).toBe(false);
  });
});

describe("getAppendStore", () => {
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

  it("saves a record the read store then sees", async () => {
    const record = buildRunRecord({
      config: { id: "33333333-3333-4333-8333-333333333333", name: "appended" },
    });

    await getAppendStore().save(record);

    expect(await getRunStore().get(record.id)).toEqual(record);
  });

  it("refuses a database at a schema this build does not know", () => {
    const raw = new DatabaseSync(dbPath);
    raw.exec("PRAGMA user_version = 99");
    raw.close();

    let thrown: StoreAccessError | undefined;
    try {
      getAppendStore();
    } catch (error) {
      thrown = error as StoreAccessError;
    }

    expect(thrown?.code).toBe("DB_SCHEMA_MISMATCH");
  });

  it("refuses a path with no database, and creates nothing there", () => {
    // The reason the stat happens BEFORE the store is constructed: an append
    // store opens read-write, and `new DatabaseSync(path)` would create the
    // file. A mistyped QRE_DB_PATH must not become a second, empty history.
    const missing = join(directory, "not-a-database.sqlite");
    process.env.QRE_DB_PATH = missing;

    let thrown: StoreAccessError | undefined;
    try {
      getAppendStore();
    } catch (error) {
      thrown = error as StoreAccessError;
    }

    expect(thrown?.code).toBe("DB_NOT_FOUND");
    expect(existsSync(missing)).toBe(false);
  });

  it("follows a database that was replaced under it", async () => {
    await getAppendStore().save(
      buildRunRecord({ config: { id: "44444444-4444-4444-8444-444444444444" } }),
    );

    // The analyst deleted their history and the dashboard made a new one.
    rmSync(dbPath, { force: true });
    const replacement = new SqliteRunStore(dbPath);
    replacement.close();

    const record = buildRunRecord({
      config: { id: "55555555-5555-4555-8555-555555555555" },
    });
    await getAppendStore().save(record);

    expect(await getRunStore().get(record.id)).toEqual(record);
    expect(
      await getRunStore().get("44444444-4444-4444-8444-444444444444"),
    ).toBeNull();
  });

  it("is closed by closeRunStore, alongside the read connection", async () => {
    const store = getAppendStore();

    closeRunStore();

    await expect(
      store.save(
        buildRunRecord({ config: { id: "66666666-6666-4666-8666-666666666666" } }),
      ),
    ).rejects.toThrow();
  });

  it("leaves the read store with no way to write", () => {
    // The point of two connections: a read tool is handed an object that has
    // no `save` to reach for, whatever the append store can do.
    expect("save" in getRunStore()).toBe(false);
  });
});
