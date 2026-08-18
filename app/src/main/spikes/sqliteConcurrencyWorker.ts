import { performance } from "node:perf_hooks";
import { DatabaseSync } from "node:sqlite";

import { SqliteRunStore } from "../sqliteRunStore.js";

type WorkerCommand =
  { type: "start" } | { type: "probe" } | { type: "migrate" };

interface SerializedError {
  name: string;
  message: string;
  code?: string;
  errcode?: number;
}

function requiredArgument(name: string): string {
  const index = process.argv.indexOf(`--${name}`);
  const value = index === -1 ? undefined : process.argv[index + 1];
  if (value === undefined) throw new Error(`Missing --${name}.`);
  return value;
}

function positiveInteger(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive safe integer, got ${value}.`);
  }
  return parsed;
}

const databasePath = requiredArgument("database");
const role = requiredArgument("role");
const iterations = positiveInteger(
  process.env.QRE_SPIKE_ITERATIONS ?? "1000",
  "QRE_SPIKE_ITERATIONS",
);
const holdMilliseconds = positiveInteger(
  process.env.QRE_SPIKE_HOLD_MS ?? "5500",
  "QRE_SPIKE_HOLD_MS",
);

function send(message: Record<string, unknown>): void {
  if (process.send === undefined) {
    throw new Error("Concurrency worker requires an IPC channel.");
  }
  process.send({ ...message, pid: process.pid });
}

function serializeError(error: unknown): SerializedError {
  if (!(error instanceof Error)) {
    return { name: "UnknownError", message: String(error) };
  }
  const sqliteError = error as Error & { code?: unknown; errcode?: unknown };
  return {
    name: error.name,
    message: error.message,
    ...(typeof sqliteError.code === "string" ? { code: sqliteError.code } : {}),
    ...(typeof sqliteError.errcode === "number"
      ? { errcode: sqliteError.errcode }
      : {}),
  };
}

function finish(
  startedAt: number,
  details: Record<string, unknown> = {},
): void {
  send({
    type: "result",
    role,
    ok: true,
    durationMs: performance.now() - startedAt,
    ...details,
  });
  process.disconnect?.();
}

function fail(startedAt: number, error: unknown): void {
  send({
    type: "result",
    role,
    ok: false,
    durationMs: performance.now() - startedAt,
    error: serializeError(error),
  });
  process.disconnect?.();
}

function runReader(): void {
  const database = new DatabaseSync(databasePath, {
    readOnly: true,
    timeout: 5_000,
  });
  const statement = database.prepare(
    "SELECT COUNT(*) AS count, SUM(value) AS total FROM spike_events",
  );
  const startedAt = performance.now();
  try {
    let lastRow: Record<string, unknown> | undefined;
    for (let index = 0; index < iterations; index += 1) {
      lastRow = statement.get();
    }
    finish(startedAt, { iterations, lastRow });
  } catch (error) {
    fail(startedAt, error);
  } finally {
    database.close();
  }
}

function runReadDuringWrite(): void {
  const database = new DatabaseSync(databasePath, {
    readOnly: true,
    timeout: 5_000,
  });
  const startedAt = performance.now();
  try {
    const row = database
      .prepare(
        "SELECT COUNT(*) AS count, SUM(value) AS total FROM spike_events",
      )
      .get();
    finish(startedAt, { row });
  } catch (error) {
    fail(startedAt, error);
  } finally {
    database.close();
  }
}

function runLockHolder(lock: "EXCLUSIVE" | "IMMEDIATE"): void {
  const database = new DatabaseSync(databasePath, { timeout: 5_000 });
  const startedAt = performance.now();
  try {
    database.exec(`BEGIN ${lock}`);
    database
      .prepare("INSERT INTO spike_events(value) VALUES (?)")
      .run(process.pid);
    send({ type: "locked", role, lock });
    setTimeout(() => {
      try {
        database.exec("COMMIT");
        finish(startedAt, { lock, holdMilliseconds });
      } catch (error) {
        try {
          database.exec("ROLLBACK");
        } catch {
          // Preserve the original commit failure.
        }
        fail(startedAt, error);
      } finally {
        database.close();
      }
    }, holdMilliseconds);
  } catch (error) {
    database.close();
    fail(startedAt, error);
  }
}

function runWriter(): void {
  const database = new DatabaseSync(databasePath, { timeout: 5_000 });
  const startedAt = performance.now();
  try {
    const changes = database
      .prepare("INSERT INTO spike_events(value) VALUES (?)")
      .run(process.pid).changes;
    finish(startedAt, { changes });
  } catch (error) {
    fail(startedAt, error);
  } finally {
    database.close();
  }
}

function runMixedLoop(includeReads: boolean): void {
  const database = new DatabaseSync(databasePath, { timeout: 5_000 });
  const insert = database.prepare("INSERT INTO spike_events(value) VALUES (?)");
  const read = database.prepare("SELECT COUNT(*) AS count FROM spike_events");
  const startedAt = performance.now();
  let reads = 0;
  let writes = 0;
  let busyErrors = 0;
  try {
    for (let index = 0; index < iterations; index += 1) {
      try {
        if (includeReads) {
          read.get();
          reads += 1;
        }
        insert.run(process.pid * 1_000_000 + index);
        writes += 1;
      } catch (error) {
        const sqliteError = error as { errcode?: unknown };
        if (sqliteError.errcode === 5) {
          busyErrors += 1;
          continue;
        }
        throw error;
      }
    }
    finish(startedAt, { iterations, reads, writes, busyErrors });
  } catch (error) {
    fail(startedAt, error);
  } finally {
    database.close();
  }
}

function probeMigrationVersion(): void {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const row = database.prepare("PRAGMA user_version").get();
    send({ type: "observed-version", role, version: row?.user_version });
  } finally {
    database.close();
  }
}

function runMigration(): void {
  const startedAt = performance.now();
  let store: SqliteRunStore | undefined;
  try {
    store = new SqliteRunStore(databasePath);
    finish(startedAt);
  } catch (error) {
    fail(startedAt, error);
  } finally {
    store?.close();
  }
}

process.on("message", (message: WorkerCommand) => {
  if (message.type === "probe") {
    probeMigrationVersion();
    return;
  }
  if (message.type === "migrate") {
    runMigration();
    return;
  }
  if (message.type !== "start") return;

  switch (role) {
    case "reader":
      runReader();
      break;
    case "read-during-write":
      runReadDuringWrite();
      break;
    case "read-write-holder":
      runLockHolder("EXCLUSIVE");
      break;
    case "writer-holder":
      runLockHolder("IMMEDIATE");
      break;
    case "writer-contender":
      runWriter();
      break;
    case "writer-loop":
      runMixedLoop(false);
      break;
    case "reader-writer-loop":
      runMixedLoop(true);
      break;
    default:
      throw new Error(`Unsupported worker role: ${role}.`);
  }
});

send({ type: "ready", role });
