import { Console } from "node:console";
import { Writable } from "node:stream";

export interface StdoutGuardStreams {
  /** The real process.stdout */
  stdout: NodeJS.WritableStream;
  /** Where diverted output goes */
  stderr: NodeJS.WritableStream;
  /** Console object to patch */
  console: Pick<
    Console,
    | "log"
    | "info"
    | "debug"
    | "dir"
    | "table"
    | "trace"
    | "group"
    | "groupEnd"
    | "count"
    | "timeEnd"
    | "timeLog"
  >;
}

export interface StdoutGuard {
  /** The ONLY stream permitted to reach real stdout. Hand this to StdioServerTransport. */
  protocolStream: NodeJS.WritableStream;
}

export function installStdoutGuard(streams: StdoutGuardStreams): StdoutGuard {
  // Capture the real write before anything is patched
  const realWrite = streams.stdout.write.bind(streams.stdout);

  /**
   * Whether stdout can still be written to, and every write waiting on it.
   *
   * A parked write used to be released ONLY by `drain`, and a client that goes
   * away does not drain — it breaks the pipe. Three things followed from that,
   * all of them observed against the built bundle:
   *
   *  - The EPIPE arrived as an `error` event on stdout with no listener, so an
   *    ordinary client disconnect became an uncaught exception and the server
   *    exited 1 while reporting a clean "stdin ended".
   *  - The parked callback never fired, so `flushStream` never resolved and
   *    the shutdown sequence could only end by the event loop running dry —
   *    which skipped `process.exit(code)` entirely and exited 0 after a
   *    failure.
   *  - Every later frame queued on `protocolStream` behind the stalled one.
   *
   * So a dead stdout is recorded once, every waiting write is released, and
   * later frames are dropped rather than queued: there is nobody to read them.
   */
  let stdoutIsDead = false;
  const waiting = new Set<() => void>();

  const markDead = (reason: string): void => {
    if (stdoutIsDead) return;
    stdoutIsDead = true;
    // Not through logger.ts: this module takes its streams as inputs so it can
    // be tested without touching the process, and the guard must work before
    // anything else is wired up.
    streams.stderr.write(
      `[ERROR] ${new Date().toISOString()} stdout is no longer writable (${reason}); dropping protocol output\n`,
    );
    for (const release of [...waiting]) release();
  };

  // `on` is absent from some of the doubles this is tested with, and a guard
  // that throws while installing itself would take the whole server with it.
  if (typeof streams.stdout.on === "function") {
    streams.stdout.on("error", (error: Error) => markDead(error.message));
    streams.stdout.on("close", () => markDead("closed"));
  }

  // Build protocolStream as a Writable that forwards to the real stdout
  // while preserving backpressure
  const protocolStream = new Writable({
    write(chunk, encoding, callback) {
      if (stdoutIsDead) {
        callback();
        return;
      }

      // Call realWrite and check its return value for backpressure
      const canContinue = realWrite(chunk, encoding as BufferEncoding);
      if (canContinue) {
        // Nothing to wait for: invoke callback immediately
        callback();
        return;
      }

      // Write returned false. Wait for drain — or for stdout to die, whichever
      // comes first. `released` keeps the two paths from calling back twice,
      // which a Writable treats as an error.
      let released = false;
      const release = (): void => {
        if (released) return;
        released = true;
        waiting.delete(release);
        callback();
      };
      waiting.add(release);
      streams.stdout.once("drain", release);
    },
  });

  // Replace stdout.write with a shim that forwards to stderr
  streams.stdout.write = ((
    chunk: Uint8Array | string,
    encodingOrCb?: BufferEncoding | ((error?: Error | null) => void),
    cb?: (error?: Error | null) => void
  ): boolean => {
    // Normalize arguments like the real write does
    let encoding: BufferEncoding = "utf8";
    let callback: ((error?: Error | null) => void) | undefined;

    if (typeof encodingOrCb === "function") {
      callback = encodingOrCb;
    } else {
      // `write(chunk, undefined | null, cb)` is a shape Node accepts and
      // promisified wrappers produce. Reading the encoding only when it is a
      // string was right; taking the callback only then was not, and dropped
      // it — leaving the caller waiting on a write that had already happened.
      if (typeof encodingOrCb === "string") encoding = encodingOrCb;
      callback = cb;
    }

    // Forward to stderr. Narrow on chunk type: the string overload takes an
    // encoding, the Uint8Array overload does not.
    if (typeof chunk === "string") {
      return streams.stderr.write(chunk, encoding, callback);
    }
    return streams.stderr.write(chunk, callback);
  }) as typeof streams.stdout.write;

  // Replace console methods that write to stdout with stderr equivalents
  const consoleMethodsToRedirect = [
    "log",
    "info",
    "debug",
    "dir",
    "table",
    "trace",
    "group",
    "groupEnd",
    "count",
    "timeEnd",
    "timeLog",
  ] as const;

  // Create a console that writes to stderr
  const stderrConsole = new Console(streams.stderr, streams.stderr);

  function redirectMethod<K extends (typeof consoleMethodsToRedirect)[number]>(
    key: K
  ): void {
    streams.console[key] = stderrConsole[key].bind(stderrConsole) as Console[K];
  }

  for (const method of consoleMethodsToRedirect) {
    redirectMethod(method);
  }

  return { protocolStream };
}
