// @vitest-environment node
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { installStdoutGuard } from "./stdoutGuard.js";

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
});
