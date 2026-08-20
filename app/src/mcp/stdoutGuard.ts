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

  // Build protocolStream as a Writable that forwards to the real stdout
  // while preserving backpressure
  const protocolStream = new Writable({
    write(chunk, encoding, callback) {
      // Call realWrite and check its return value for backpressure
      const canContinue = realWrite(chunk, encoding as BufferEncoding);
      if (!canContinue) {
        // If write returned false, wait for drain before continuing
        streams.stdout.once("drain", callback);
      } else {
        // Otherwise, invoke callback immediately
        callback();
      }
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
    } else if (typeof encodingOrCb === "string") {
      encoding = encodingOrCb;
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
