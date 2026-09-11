// @vitest-environment node
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { installStdoutGuard } from "./stdoutGuard.js";

/** A stdout whose backpressure and failures the test drives. */
class ControllableStdout extends EventEmitter {
  readonly written: string[] = [];
  accepting = true;

  write(chunk: Buffer | string): boolean {
    this.written.push(Buffer.from(chunk as Buffer).toString());
    return this.accepting;
  }
}

describe("installStdoutGuard", () => {
  it("should divert stdout.write to stderr", async () => {
    const fakeStdout = new PassThrough();
    const stderrChunks: Buffer[] = [];
    const stderrSink = new PassThrough();
    stderrSink.on("data", (chunk) => stderrChunks.push(chunk));

    installStdoutGuard({
      stdout: fakeStdout,
      stderr: stderrSink,
      console: global.console,
    });

    // Write directly to fakeStdout (simulating a stray write)
    fakeStdout.write("stray write\n");

    // Give async operations time to complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Should appear in stderr
    expect(stderrChunks.length).toBeGreaterThan(0);
    const stderrText = Buffer.concat(stderrChunks).toString();
    expect(stderrText).toContain("stray write");
  });

  it("should allow protocolStream to write to real stdout", async () => {
    const realStdoutChunks: Buffer[] = [];
    const realStdout = new PassThrough();
    realStdout.on("data", (chunk) => realStdoutChunks.push(chunk));

    const fakeStderr = new PassThrough();

    const { protocolStream } = installStdoutGuard({
      stdout: realStdout,
      stderr: fakeStderr,
      console: global.console,
    });

    // Write to protocolStream
    protocolStream.write('{"jsonrpc":"2.0","id":1}\n');

    // Give async operations time to complete
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Should reach real stdout
    expect(realStdoutChunks.length).toBeGreaterThan(0);
    const stdoutText = Buffer.concat(realStdoutChunks).toString();
    expect(stdoutText).toBe('{"jsonrpc":"2.0","id":1}\n');
  });

  it("does not report a write as done until the real stdout has drained", async () => {
    // The whole reason protocolStream exists: process.stdout is a pipe, and a
    // pipe that is full must stall the writer instead of losing the tail of a
    // JSON-RPC frame. Deleting the drain branch from installStdoutGuard makes
    // this test fail, which the previous version of it did not.
    let backedUp = true;
    const drainListeners: Array<() => void> = [];
    const received: Buffer[] = [];

    const blockedStdout = {
      write(chunk: Buffer | string): boolean {
        received.push(Buffer.from(chunk as Buffer));
        return !backedUp;
      },
      once(event: string, listener: () => void): unknown {
        if (event === "drain") drainListeners.push(listener);
        return blockedStdout;
      },
      on(): unknown {
        return blockedStdout;
      },
    } as unknown as NodeJS.WritableStream;

    const { protocolStream } = installStdoutGuard({
      stdout: blockedStdout,
      stderr: new PassThrough(),
      console: global.console,
    });

    let wroteThrough = false;
    protocolStream.write(Buffer.alloc(64, "a"), () => {
      wroteThrough = true;
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(received).toHaveLength(1);
    expect(wroteThrough, "reported the write done while stdout was full").toBe(
      false,
    );

    backedUp = false;
    drainListeners.forEach((listener) => listener());
    await new Promise((resolve) => setImmediate(resolve));

    expect(wroteThrough).toBe(true);
  });

  /**
   * What happens when the client goes away mid-write.
   *
   * A parked write was released only by `drain`, and a broken pipe does not
   * drain. Three consequences, all observed against the built bundle: the
   * EPIPE reached `process.stdout` with no listener and became an uncaught
   * exception on an ordinary disconnect; the parked callback never fired, so
   * the shutdown flush never resolved and `process.exit(code)` was never
   * reached; and every later frame queued behind the stalled one.
   */
  it("releases a parked write when stdout dies instead of waiting for a drain that cannot come", async () => {
    const stdout = new ControllableStdout();
    stdout.accepting = false;
    const stderr = new PassThrough();
    const diverted: string[] = [];
    stderr.on("data", (chunk: Buffer) => diverted.push(chunk.toString()));

    const { protocolStream } = installStdoutGuard({
      stdout: stdout as unknown as NodeJS.WritableStream,
      stderr,
      console: global.console,
    });

    let wroteThrough = false;
    protocolStream.write("first frame\n", () => {
      wroteThrough = true;
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(wroteThrough).toBe(false);

    // The pipe breaks. Emitting this on a stream with no listener is what used
    // to become an uncaughtException.
    expect(() => stdout.emit("error", new Error("write EPIPE"))).not.toThrow();
    await new Promise((resolve) => setImmediate(resolve));

    expect(wroteThrough, "a write stayed parked on a dead stdout").toBe(true);
    expect(diverted.join("")).toMatch(/stdout is no longer writable \(write EPIPE\)/);
  });

  it("completes later frames instead of queueing them on a dead stdout", async () => {
    const stdout = new ControllableStdout();
    const stderr = new PassThrough();
    const { protocolStream } = installStdoutGuard({
      stdout: stdout as unknown as NodeJS.WritableStream,
      stderr,
      console: global.console,
    });

    stdout.emit("error", new Error("write EPIPE"));

    let delivered = false;
    protocolStream.write("later frame\n", () => {
      delivered = true;
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(delivered, "a frame written after the pipe died never completed").toBe(true);
    // Dropped rather than written: there is nobody to read it.
    expect(stdout.written).toHaveLength(0);
  });

  /**
   * `write(chunk, undefined, cb)` is a shape Node accepts and promisified
   * wrappers produce. The shim read the callback only when the second argument
   * was a string, so this one was dropped and its caller waited forever.
   */
  it("forwards a callback passed with no encoding", async () => {
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const diverted: string[] = [];
    stderr.on("data", (chunk: Buffer) => diverted.push(chunk.toString()));

    installStdoutGuard({ stdout, stderr, console: global.console });

    const calls: string[] = [];
    for (const encoding of [undefined, null]) {
      await new Promise<void>((resolve) => {
        (stdout.write as unknown as (
          chunk: string,
          encoding: undefined | null,
          callback: () => void,
        ) => boolean)(`stray ${String(encoding)}\n`, encoding, () => {
          calls.push(String(encoding));
          resolve();
        });
      });
    }

    expect(calls).toEqual(["undefined", "null"]);
    expect(diverted.join("")).toContain("stray undefined");
  });
});
