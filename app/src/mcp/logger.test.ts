// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";

import { logError, logInfo } from "./logger.js";

/**
 * What stderr actually receives. It is the only diagnostic channel the server
 * has — a client shows it under `--debug` — so a line that drops what it was
 * handed is a line nobody can act on.
 */
function captureStderr(): { lines: () => string[]; restore: () => void } {
  const written: string[] = [];
  const spy = vi
    .spyOn(process.stderr, "write")
    .mockImplementation(((chunk: unknown) => {
      written.push(String(chunk));
      return true;
    }) as typeof process.stderr.write);
  return { lines: () => written, restore: () => spy.mockRestore() };
}

describe("logError", () => {
  let captured: ReturnType<typeof captureStderr> | null = null;

  afterEach(() => {
    captured?.restore();
    captured = null;
  });

  it("renders an Error by its message", () => {
    captured = captureStderr();

    logError("failed", new Error("boom"));

    expect(captured.lines()[0]).toMatch(/\[ERROR\] .* failed error=boom\n$/);
  });

  /**
   * Every "Invalid run record in store" call passed `{ id, errors }`, and the
   * previous implementation rendered nothing for an object — so the one line
   * that could have said which record was unreadable said neither.
   */
  it("renders a structured detail object instead of dropping it", () => {
    captured = captureStderr();

    logError("Invalid run record in store", { id: "run-1", errors: "config.name must be string" });

    const line = captured.lines()[0] ?? "";
    expect(line).toContain("run-1");
    expect(line).toContain("config.name must be string");
  });

  it("survives a detail that cannot be serialised", () => {
    captured = captureStderr();
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(() => logError("looped", circular)).not.toThrow();
    expect(captured.lines()[0]).toMatch(/^\[ERROR\] .* looped detail=/);
  });

  it("writes nothing extra when there is no detail", () => {
    captured = captureStderr();

    logError("plain");

    expect(captured.lines()[0]).toMatch(/\[ERROR\] .* plain\n$/);
  });
});

describe("logInfo", () => {
  let captured: ReturnType<typeof captureStderr> | null = null;

  afterEach(() => {
    captured?.restore();
    captured = null;
  });

  it("renders fields as JSON", () => {
    captured = captureStderr();

    logInfo("ready", { name: "qre-dashboard" });

    expect(captured.lines()[0]).toMatch(/\[INFO\] .* ready \{"name":"qre-dashboard"\}\n$/);
  });
});
