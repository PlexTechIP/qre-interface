import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { DatabaseSync } from "node:sqlite";

type JournalMode = "delete" | "wal";

interface WorkerMessage {
  type: string;
  role: string;
  pid: number;
  [key: string]: unknown;
}

interface WorkerHandle {
  child: ChildProcess;
  exited: Promise<void>;
  stderr: () => string;
}

interface ScenarioResult {
  trial: number;
  journalMode: JournalMode;
  scenario: string;
  wallTimeMs: number;
  workers: WorkerMessage[];
  database: {
    journalMode: string;
    integrityCheck: string;
    userVersion: number;
    eventCount?: number;
    runRecordCount?: number;
    unmigratedFactoryCount?: number;
  };
}

const WORKER_PATH = fileURLToPath(
  new URL("./sqliteConcurrencyWorker.ts", import.meta.url),
);
const ITERATIONS = 1_000;
const MIXED_LOOP_ITERATIONS = 250;
const READ_WRITE_HOLD_MS = 750;
const TWO_WRITER_HOLD_MS = 5_500;
const LEGACY_ROWS = 20_000;

function positiveInteger(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive safe integer, got ${value}.`);
  }
  return parsed;
}

const TRIALS = positiveInteger(
  process.env.QRE_SPIKE_TRIALS ?? "3",
  "QRE_SPIKE_TRIALS",
);

function withTrial(result: ScenarioResult, trial: number): ScenarioResult {
  return { ...result, trial };
}

function summarize(
  results: readonly ScenarioResult[],
): Record<string, unknown> {
  const summaries: Record<string, unknown> = {};
  for (const mode of ["delete", "wal"] as const) {
    for (const scenario of [
      "concurrent-reads",
      "mixed-read-write-loop",
      "read-during-write",
      "two-writers",
      "concurrent-migration",
    ]) {
      const matching = results.filter(
        (result) => result.journalMode === mode && result.scenario === scenario,
      );
      const workerDurations: Record<string, number[]> = {};
      const outcomes: Record<string, { succeeded: number; failed: number }> =
        {};
      for (const result of matching) {
        for (const worker of result.workers) {
          const durations = workerDurations[worker.role] ?? [];
          durations.push(Number(worker.durationMs));
          workerDurations[worker.role] = durations;
          const counts = outcomes[worker.role] ?? { succeeded: 0, failed: 0 };
          if (worker.ok === true) counts.succeeded += 1;
          else counts.failed += 1;
          outcomes[worker.role] = counts;
        }
      }
      summaries[`${mode}/${scenario}`] = {
        trials: matching.length,
        wallTimeMs: matching.map((result) => result.wallTimeMs),
        workerDurationMs: workerDurations,
        outcomes,
        integrityChecks: matching.map(
          (result) => result.database.integrityCheck,
        ),
      };
    }
  }
  return summaries;
}

function spawnWorker(
  databasePath: string,
  role: string,
  environment: Record<string, string> = {},
): WorkerHandle {
  let stderr = "";
  const child = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      WORKER_PATH,
      "--database",
      databasePath,
      "--role",
      role,
    ],
    {
      cwd: process.cwd(),
      env: { ...process.env, ...environment },
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    },
  );
  child.stderr?.on("data", (chunk: Buffer) => {
    stderr += chunk.toString("utf8");
  });
  const exited = new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else {
        reject(
          new Error(`Worker exited with ${String(code)}. stderr: ${stderr}`),
        );
      }
    });
  });
  return { child, exited, stderr: () => stderr };
}

function send(worker: WorkerHandle, type: string): void {
  if (!worker.child.connected) {
    throw new Error(
      `Worker disconnected before ${type}. stderr: ${worker.stderr()}`,
    );
  }
  worker.child.send({ type });
}

function waitForMessage(
  worker: WorkerHandle,
  type: string,
  timeoutMs = 15_000,
): Promise<WorkerMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(
        new Error(`Timed out waiting for ${type}. stderr: ${worker.stderr()}`),
      );
    }, timeoutMs);
    const onMessage = (message: WorkerMessage): void => {
      if (message.type !== type) return;
      cleanup();
      resolve(message);
    };
    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };
    const onExit = (code: number | null): void => {
      cleanup();
      reject(
        new Error(
          `Worker exited with ${String(code)} before ${type}. stderr: ${worker.stderr()}`,
        ),
      );
    };
    const cleanup = (): void => {
      clearTimeout(timer);
      worker.child.off("message", onMessage);
      worker.child.off("error", onError);
      worker.child.off("exit", onExit);
    };
    worker.child.on("message", onMessage);
    worker.child.once("error", onError);
    worker.child.once("exit", onExit);
  });
}

async function ready(...workers: WorkerHandle[]): Promise<void> {
  await Promise.all(workers.map((worker) => waitForMessage(worker, "ready")));
}

function configureJournal(database: DatabaseSync, mode: JournalMode): void {
  const row = database.prepare(`PRAGMA journal_mode = ${mode}`).get();
  const actualMode = String(row?.journal_mode ?? "unknown");
  if (actualMode !== mode) {
    database.close();
    throw new Error(`Requested journal mode ${mode}, got ${actualMode}.`);
  }
}

function seedEventsDatabase(databasePath: string, mode: JournalMode): void {
  const database = new DatabaseSync(databasePath, { timeout: 5_000 });
  configureJournal(database, mode);
  database.exec(`
    CREATE TABLE spike_events (
      id INTEGER PRIMARY KEY,
      value INTEGER NOT NULL
    ) STRICT;
    WITH RECURSIVE counter(value) AS (
      VALUES(1)
      UNION ALL
      SELECT value + 1 FROM counter WHERE value < 10000
    )
    INSERT INTO spike_events(value) SELECT value FROM counter;
  `);
  database.close();
}

function seedLegacyDatabase(databasePath: string, mode: JournalMode): void {
  const database = new DatabaseSync(databasePath, { timeout: 5_000 });
  configureJournal(database, mode);
  database.exec(`
    CREATE TABLE run_records (
      id TEXT PRIMARY KEY NOT NULL,
      schema_version TEXT NOT NULL,
      record_json TEXT NOT NULL,
      name TEXT NOT NULL,
      application TEXT NOT NULL,
      architecture TEXT NOT NULL,
      qec_code TEXT NOT NULL,
      magic_state_factory TEXT NOT NULL,
      qre_version TEXT NOT NULL,
      created_at TEXT NOT NULL,
      saved_at TEXT NOT NULL
    ) STRICT;
    CREATE INDEX run_records_name_idx ON run_records(name COLLATE NOCASE);
    CREATE INDEX run_records_application_idx ON run_records(application);
    CREATE INDEX run_records_architecture_idx ON run_records(architecture);
    CREATE INDEX run_records_qec_code_idx ON run_records(qec_code);
    CREATE INDEX run_records_magic_state_factory_idx ON run_records(magic_state_factory);
    CREATE INDEX run_records_qre_version_idx ON run_records(qre_version);
    CREATE INDEX run_records_newest_first_idx
      ON run_records(created_at DESC, saved_at DESC, id DESC);
    PRAGMA user_version = 1;
  `);
  const insert = database.prepare(`
    INSERT INTO run_records VALUES (?, '1.1.0', '{}', ?, 'benchmark',
      'gateBased', 'surface_code', 'round_based', 'qdk-qre-spike', ?, ?)
  `);
  database.exec("BEGIN");
  for (let index = 0; index < LEGACY_ROWS; index += 1) {
    const value = String(index).padStart(8, "0");
    insert.run(
      `spike-${value}`,
      `Spike record ${value}`,
      "2026-08-18T00:00:00.000Z",
      "2026-08-18T00:00:01.000Z",
    );
  }
  database.exec("COMMIT");
  database.close();
}

function inspectDatabase(databasePath: string): ScenarioResult["database"] {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const journal = database.prepare("PRAGMA journal_mode").get();
    const integrity = database.prepare("PRAGMA integrity_check").get();
    const version = database.prepare("PRAGMA user_version").get();
    const hasEvents = database
      .prepare(
        "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'spike_events'",
      )
      .get();
    const eventCount =
      hasEvents === undefined
        ? undefined
        : Number(
            database.prepare("SELECT COUNT(*) AS count FROM spike_events").get()
              ?.count,
          );
    const hasRunRecords = database
      .prepare(
        "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'run_records'",
      )
      .get();
    const runRecordCount =
      hasRunRecords === undefined
        ? undefined
        : Number(
            database.prepare("SELECT COUNT(*) AS count FROM run_records").get()
              ?.count,
          );
    const unmigratedFactoryCount =
      hasRunRecords === undefined
        ? undefined
        : Number(
            database
              .prepare(
                "SELECT COUNT(*) AS count FROM run_records WHERE magic_state_factory NOT LIKE '|%'",
              )
              .get()?.count,
          );
    return {
      journalMode: String(journal?.journal_mode),
      integrityCheck: String(integrity?.integrity_check),
      userVersion: Number(version?.user_version),
      ...(eventCount === undefined ? {} : { eventCount }),
      ...(runRecordCount === undefined ? {} : { runRecordCount }),
      ...(unmigratedFactoryCount === undefined
        ? {}
        : { unmigratedFactoryCount }),
    };
  } finally {
    database.close();
  }
}

async function runConcurrentReads(
  databasePath: string,
  mode: JournalMode,
): Promise<ScenarioResult> {
  seedEventsDatabase(databasePath, mode);
  const first = spawnWorker(databasePath, "reader", {
    QRE_SPIKE_ITERATIONS: String(ITERATIONS),
  });
  const second = spawnWorker(databasePath, "reader", {
    QRE_SPIKE_ITERATIONS: String(ITERATIONS),
  });
  await ready(first, second);
  const firstResult = waitForMessage(first, "result");
  const secondResult = waitForMessage(second, "result");
  const startedAt = performance.now();
  send(first, "start");
  send(second, "start");
  const workers = await Promise.all([firstResult, secondResult]);
  await Promise.all([first.exited, second.exited]);
  return {
    trial: 0,
    journalMode: mode,
    scenario: "concurrent-reads",
    wallTimeMs: performance.now() - startedAt,
    workers,
    database: inspectDatabase(databasePath),
  };
}

async function runReadDuringWrite(
  databasePath: string,
  mode: JournalMode,
): Promise<ScenarioResult> {
  seedEventsDatabase(databasePath, mode);
  const holder = spawnWorker(databasePath, "read-write-holder", {
    QRE_SPIKE_HOLD_MS: String(READ_WRITE_HOLD_MS),
  });
  const reader = spawnWorker(databasePath, "read-during-write");
  await ready(holder, reader);
  const locked = waitForMessage(holder, "locked");
  const holderResult = waitForMessage(holder, "result");
  send(holder, "start");
  await locked;
  const readerResult = waitForMessage(reader, "result");
  const startedAt = performance.now();
  send(reader, "start");
  const workers = await Promise.all([holderResult, readerResult]);
  await Promise.all([holder.exited, reader.exited]);
  return {
    trial: 0,
    journalMode: mode,
    scenario: "read-during-write",
    wallTimeMs: performance.now() - startedAt,
    workers,
    database: inspectDatabase(databasePath),
  };
}

async function runMixedReadWriteLoop(
  databasePath: string,
  mode: JournalMode,
): Promise<ScenarioResult> {
  seedEventsDatabase(databasePath, mode);
  const writer = spawnWorker(databasePath, "writer-loop", {
    QRE_SPIKE_ITERATIONS: String(MIXED_LOOP_ITERATIONS),
  });
  const readerWriter = spawnWorker(databasePath, "reader-writer-loop", {
    QRE_SPIKE_ITERATIONS: String(MIXED_LOOP_ITERATIONS),
  });
  await ready(writer, readerWriter);
  const writerResult = waitForMessage(writer, "result");
  const readerWriterResult = waitForMessage(readerWriter, "result");
  const startedAt = performance.now();
  send(writer, "start");
  send(readerWriter, "start");
  const workers = await Promise.all([writerResult, readerWriterResult]);
  await Promise.all([writer.exited, readerWriter.exited]);
  return {
    trial: 0,
    journalMode: mode,
    scenario: "mixed-read-write-loop",
    wallTimeMs: performance.now() - startedAt,
    workers,
    database: inspectDatabase(databasePath),
  };
}

async function runTwoWriters(
  databasePath: string,
  mode: JournalMode,
): Promise<ScenarioResult> {
  seedEventsDatabase(databasePath, mode);
  const holder = spawnWorker(databasePath, "writer-holder", {
    QRE_SPIKE_HOLD_MS: String(TWO_WRITER_HOLD_MS),
  });
  const contender = spawnWorker(databasePath, "writer-contender");
  await ready(holder, contender);
  const locked = waitForMessage(holder, "locked");
  const holderResult = waitForMessage(holder, "result");
  send(holder, "start");
  await locked;
  const contenderResult = waitForMessage(contender, "result");
  const startedAt = performance.now();
  send(contender, "start");
  const workers = await Promise.all([holderResult, contenderResult]);
  await Promise.all([holder.exited, contender.exited]);
  return {
    trial: 0,
    journalMode: mode,
    scenario: "two-writers",
    wallTimeMs: performance.now() - startedAt,
    workers,
    database: inspectDatabase(databasePath),
  };
}

async function runConcurrentMigration(
  databasePath: string,
  mode: JournalMode,
): Promise<ScenarioResult> {
  seedLegacyDatabase(databasePath, mode);
  const first = spawnWorker(databasePath, "migration");
  const second = spawnWorker(databasePath, "migration");
  await ready(first, second);
  const firstObserved = waitForMessage(first, "observed-version");
  const secondObserved = waitForMessage(second, "observed-version");
  send(first, "probe");
  send(second, "probe");
  const observations = await Promise.all([firstObserved, secondObserved]);
  const firstResult = waitForMessage(first, "result");
  const secondResult = waitForMessage(second, "result");
  const startedAt = performance.now();
  send(first, "migrate");
  send(second, "migrate");
  const results = await Promise.all([firstResult, secondResult]);
  await Promise.all([first.exited, second.exited]);
  return {
    trial: 0,
    journalMode: mode,
    scenario: "concurrent-migration",
    wallTimeMs: performance.now() - startedAt,
    workers: results.map((result, index) => ({
      ...result,
      observedVersion: observations[index]?.version,
    })),
    database: inspectDatabase(databasePath),
  };
}

async function main(): Promise<void> {
  const temporaryDirectory = mkdtempSync(
    join(tmpdir(), "qre-sqlite-concurrency-spike-"),
  );
  const results: ScenarioResult[] = [];
  try {
    for (let trial = 1; trial <= TRIALS; trial += 1) {
      for (const mode of ["delete", "wal"] as const) {
        results.push(
          withTrial(
            await runConcurrentReads(
              join(temporaryDirectory, `${trial}-${mode}-reads.sqlite`),
              mode,
            ),
            trial,
          ),
        );
        results.push(
          withTrial(
            await runMixedReadWriteLoop(
              join(temporaryDirectory, `${trial}-${mode}-mixed-loop.sqlite`),
              mode,
            ),
            trial,
          ),
        );
        results.push(
          withTrial(
            await runReadDuringWrite(
              join(temporaryDirectory, `${trial}-${mode}-read-write.sqlite`),
              mode,
            ),
            trial,
          ),
        );
        results.push(
          withTrial(
            await runTwoWriters(
              join(temporaryDirectory, `${trial}-${mode}-writers.sqlite`),
              mode,
            ),
            trial,
          ),
        );
        results.push(
          withTrial(
            await runConcurrentMigration(
              join(temporaryDirectory, `${trial}-${mode}-migration.sqlite`),
              mode,
            ),
            trial,
          ),
        );
      }
    }
    console.log(
      JSON.stringify(
        {
          measuredAt: new Date().toISOString(),
          platform: `${process.platform}-${process.arch}`,
          nodeVersion: process.version,
          settings: {
            busyTimeoutMs: 5_000,
            trials: TRIALS,
            concurrentReadIterationsPerWorker: ITERATIONS,
            mixedLoopIterationsPerWorker: MIXED_LOOP_ITERATIONS,
            readDuringWriteHoldMs: READ_WRITE_HOLD_MS,
            twoWriterHoldMs: TWO_WRITER_HOLD_MS,
            legacyMigrationRows: LEGACY_ROWS,
          },
          summary: summarize(results),
          results,
        },
        null,
        2,
      ),
    );
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
