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
      console: global.console as any,
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
      console: global.console as any,
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

  it("should preserve backpressure on protocolStream", async () => {
    const realStdout = new PassThrough({
      highWaterMark: 16, // Small buffer to trigger backpressure
    });

    // Pause the output to trigger backpressure
    const chunks: Buffer[] = [];
    realStdout.on("data", (chunk) => chunks.push(chunk));

    const fakeStderr = new PassThrough();

    const { protocolStream } = installStdoutGuard({
      stdout: realStdout,
      stderr: fakeStderr,
      console: global.console as any,
    });

    // Pause the underlying stream to trigger backpressure
    realStdout.pause();

    // Write should return false (backpressure)
    const result = protocolStream.write(
      Buffer.alloc(100, "a")
    );
    if (result === false) {
      // Backpressure detected, wait for drain
      await new Promise((resolve) => {
        protocolStream.once("drain", resolve);
        realStdout.resume();
      });
    }

    // Verify data eventually makes it through
    realStdout.resume();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(chunks.length).toBeGreaterThan(0);
  });
});
