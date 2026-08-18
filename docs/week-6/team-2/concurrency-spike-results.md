# Week 6 Team 2 — SQLite concurrency spike results

**Measured:** 2026-08-18 by Rishabh  
**Branch:** `week-6/team-2-concurrency-spike`  
**Environment:** Node 24.18.0, `darwin-arm64`, local temporary SQLite files

## Question

What actually happens when two Node processes share the dashboard's SQLite run
store under SQLite's default rollback journal and under WAL?

The spike covers the four cases required by the Week 6 brief:

1. two concurrent readers;
2. a read during a write;
3. two writers contending past the store's 5,000 ms busy timeout; and
4. two processes opening a database one `user_version` behind at the same time.

It also runs the brief's framing workload directly: one process writes in a loop
while a second process alternates reads and writes.

## How to reproduce

From `app/` with Node 24.18.0 and dependencies installed:

```sh
node --import tsx src/main/spikes/sqliteConcurrencySpike.ts
```

The coordinator creates a temporary directory, uses a separate database for
every scenario and trial, starts two worker processes, and removes the directory
after inspection. It never resolves or opens the dashboard's real database.

The default run performs three trials of all cases under both modes. Set
`QRE_SPIKE_TRIALS=1` for a quicker smoke run. The command prints the settings,
an aggregate summary, and every worker result as JSON.

## Method

- **Concurrent reads:** each of two synchronized read-only processes executes
  1,000 aggregate reads over 10,000 rows.
- **Mixed read/write loop:** one synchronized process performs 250 autocommit
  inserts while the other performs 250 reads and 250 autocommit inserts.
- **Read during write:** a writer inserts one row inside a deliberately held
  750 ms `BEGIN EXCLUSIVE` transaction. The reader starts only after the writer
  reports that it holds the lock. This controlled, long transaction makes the
  journal-mode difference measurable; ordinary product inserts are much shorter.
- **Two writers:** the first writer inserts inside `BEGIN IMMEDIATE` and holds
  the transaction for 5,500 ms. The second attempts an autocommit insert using
  the same 5,000 ms timeout as `SqliteRunStore`.
- **Concurrent migration:** the coordinator creates a schema-v1 `run_records`
  database with 20,000 legacy rows and the real indexes. Both workers confirm
  `user_version = 1`, then the coordinator releases both real
  `SqliteRunStore` constructors together. The larger database widens the
  migration window without changing production migration code.
- After both processes exit, the coordinator records journal mode, row count or
  schema version, and `PRAGMA integrity_check`.

The timings below are observed ranges across three trials. They are not general
SQLite benchmarks; the synchronization and outcomes are the evidence that
matters.

## Measurements

| Case                      | Rollback journal (`DELETE`)                                                                                                                                                          | WAL                                                                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Concurrent reads          | 6/6 workers succeeded. Per-worker duration 1,096–1,626 ms; trial wall time 1,120–1,641 ms.                                                                                           | 6/6 workers succeeded. Per-worker duration 1,061–1,076 ms; trial wall time 1,083–1,092 ms.                                                             |
| Mixed read/write loop     | Both workers succeeded in all trials with zero busy errors. All 500 writes persisted. Trial wall time 431–789 ms.                                                                    | Same complete outcome with zero busy errors. Trial wall time 140–150 ms.                                                                               |
| Read during write         | 3/3 reads succeeded after waiting 773–782 ms. Each saw 10,001 rows, including the committed insert.                                                                                  | 3/3 reads succeeded in 1.76–1.91 ms while the writer still held its 750 ms transaction. Each saw the stable 10,000-row pre-write snapshot.             |
| Two writers               | Holder succeeded in all trials. Contender failed 3/3 times after 5,191–5,224 ms with `ERR_SQLITE_ERROR`, SQLite error code 5, `database is locked`. Only the holder's row committed. | Same outcome: holder succeeded; contender failed 3/3 times after 5,160–5,184 ms with the same recoverable busy error. Only the holder's row committed. |
| Concurrent open/migration | 6/6 constructors succeeded in 131–159 ms. Both workers in every trial had observed version 1 immediately before release. Final version was 2.                                        | 6/6 constructors succeeded in 162–215 ms. Both workers in every trial had observed version 1 immediately before release. Final version was 2.          |

Every post-scenario `PRAGMA integrity_check` returned `ok`. Every migration
retained all 20,000 rows and left zero bare factory values. No trial lost the
successful writer's row, partially applied a migration, or produced corruption.

## Findings

### Concurrent reads

**[VERIFIED]** Two processes can read the same file concurrently in both modes.
The wide timing variation tracks overall machine load, so this run does not
support a claim that WAL improves read/read throughput.

### Mixed read/write loop

**[VERIFIED]** The exact framing workload completed without a busy error in
either mode: the dedicated writer committed 250 rows while the other process
completed 250 reads and committed another 250 rows. WAL completed these measured
trials in less wall time, but the stronger conclusion is that short autocommit
operations serialized successfully under the existing timeout in both modes.

### Read during write

**[VERIFIED]** Rollback mode makes a new reader wait behind an exclusive writer;
after the commit, the reader sees the new row. WAL lets the reader return the
previous committed snapshot immediately while the write remains in progress.

This is the material benefit of WAL for the read-only MCP server: a dashboard
write does not have to stall an agent read.

### Two writers and the busy timeout

**[VERIFIED]** WAL does not turn SQLite into a multi-writer database. In both
modes, the second writer waited approximately the configured five seconds and
then threw a recoverable SQLite busy error. Its insert was not partially applied.

The observed wait was about 5.18–5.26 seconds rather than exactly 5.00 seconds.
The timeout is therefore a lower-bound-style operational setting, not a precise
wall-clock deadline callers should assert to the millisecond.

### Concurrent migration

**[VERIFIED]** The current v1-to-v2 migration completed safely in all measured
simultaneous-open trials under both modes. The `BEGIN IMMEDIATE` transaction
serialized the DDL/update work; the migration statements are also idempotent for
this transition. Final schema version and integrity were correct.

**Measurement boundary:** each worker independently observed version 1 directly
before the simultaneous constructor release. The store's private version read
was not instrumented, because doing so would change the production code under
test. The test therefore establishes the externally observable simultaneous-open
case, not the exact instruction at which the second constructor read the pragma.

## Recommendations for OPEN-1 and OPEN-2

### OPEN-1 — the MCP server should refuse version mismatches

**[INFERENCE] Recommend keeping the design's rule.** The measured current
migration did not corrupt or fail, so refusal is not required to work around a
known v1-to-v2 defect. It is still the stronger ownership boundary: the dashboard
owns migrations, while an independently spawned read-only server should not
change the database merely by opening it. It also avoids assuming that every
future migration remains idempotent and safe under a stale pre-lock version
read.

The MCP entry point should inspect `user_version` without constructing a
migrating store and return a clear error telling the analyst to launch the
dashboard when the version is not the one it supports.

### OPEN-2 — enable WAL in `SqliteRunStore`

**[INFERENCE] Recommend enabling WAL, subject to PM review.** It reduced the
controlled read-during-write delay from roughly 0.78 seconds to under 2 ms by
returning the last committed snapshot. It did not weaken the one-writer rule,
hide the busy timeout, or damage the database in these trials.

The product change must still account for WAL's persistent journal mode and its
`-wal` / `-shm` sidecar files in backup, copying, and future packaging behavior.
This spike recommends the change; it does not make it on the concurrency-spike
branch.

## Baseline note unrelated to the spike

Before changes, `npm run typecheck` was green and 646 of 654 tests passed. The
eight real-engine tests could not start on this machine because the PyQIR 0.12.5
native module requires a libc++ symbol absent from macOS 13.0. The concurrency
spike uses only Node and `node:sqlite`, so that pre-existing Python/QDK runtime
incompatibility does not affect any measurement above. Full-suite acceptance
still requires CI or a supported macOS/Linux/Windows environment.
