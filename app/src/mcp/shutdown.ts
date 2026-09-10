/**
 * Leaving in the right order.
 *
 * stdout is a pipe, so its writes are asynchronous. Calling `process.exit()` on
 * the same tick as the last write truncates whatever is still in the pipe, and
 * a client reading a half-written JSON-RPC frame reports a parse error rather
 * than a result. Closing the run store on that tick is worse: a handler still
 * awaiting `store.get()` loses its database mid-read and never answers at all.
 *
 * So the order matters and is spelled out here rather than repeated in five
 * signal handlers: stop the server first — `close()` is what waits for
 * in-flight requests and stops new ones being dispatched — then the transport,
 * then release the store nothing is using any more, then drain, then exit.
 */

import { Writable } from "node:stream";

import { logError } from "./logger.js";

export interface ShutdownDependencies {
  server: { close: () => Promise<void> } | null;
  transport: { close: () => Promise<void> } | null;
  closeStore: () => void;
  flush: () => Promise<void>;
  exit: (code: number) => void;
  /**
   * How long to give the sequence before leaving anyway. Neither `close()` is
   * guaranteed to settle — an uncaught exception can leave the SDK mid-write —
   * and a server that never exits is worse than one that exits untidily.
   */
  graceMs?: number;
}

const DEFAULT_GRACE_MS = 2000;

let shuttingDown = false;

/** Reset the one-shot latch between tests. */
export function resetShutdownForTests(): void {
  shuttingDown = false;
}

async function closeQuietly(
  what: string,
  closeable: { close: () => Promise<void> } | null,
): Promise<void> {
  if (closeable === null) return;
  try {
    await closeable.close();
  } catch (error) {
    // A close that fails must not strand the rest of the sequence — the store
    // still has to be released and the stream still has to drain.
    logError(`error closing the ${what} during shutdown`, error);
  }
}

/** Resolve after `ms`, without holding the event loop open on its own. */
function afterGrace(ms: number): Promise<"timed-out"> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve("timed-out"), ms);
    if (typeof timer.unref === "function") timer.unref();
  });
}

/**
 * Shut down in order, and leave either way.
 *
 * The sequence runs once — re-entering would close a store mid-flush — but a
 * SECOND signal is the operator insisting, and it exits immediately rather than
 * queueing behind a sequence that may never finish. Removing that escape hatch
 * would mean a stuck server could only be killed with SIGKILL.
 */
export async function shutdown(
  code: number,
  dependencies: ShutdownDependencies,
): Promise<void> {
  if (shuttingDown) {
    dependencies.exit(code);
    return;
  }
  shuttingDown = true;

  const sequence = async (): Promise<"done"> => {
    await closeQuietly("server", dependencies.server);
    await closeQuietly("transport", dependencies.transport);
    dependencies.closeStore();
    await dependencies.flush();
    return "done";
  };

  const outcome = await Promise.race([
    sequence(),
    afterGrace(dependencies.graceMs ?? DEFAULT_GRACE_MS),
  ]);
  if (outcome === "timed-out") {
    logError("shutdown did not finish in time; leaving anyway");
  }

  dependencies.exit(code);
}

/**
 * Resolve once everything already queued on a stream has been written.
 *
 * A zero-length write is the cheapest way to ask: a Writable invokes write
 * callbacks in order, so this one fires after the frames ahead of it.
 */
export function flushStream(stream: NodeJS.WritableStream): Promise<void> {
  return new Promise((resolve) => {
    (stream as Writable).write(Buffer.alloc(0), () => resolve());
  });
}
