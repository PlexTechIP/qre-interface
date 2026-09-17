// @vitest-environment node

import { chmodSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  appendInvocation,
  canonicalJson,
  digestArguments,
  resolveInvocationLogPath,
  type InvocationRecord,
} from "./invocationLog.js";

let directory: string;
const savedDbPath = process.env.QRE_DB_PATH;

function record(overrides: Partial<InvocationRecord> = {}): InvocationRecord {
  return {
    ts: "2026-09-11T12:00:00.000Z",
    tool: "qre_run_estimate",
    client: { name: "claude-code", version: "2.0.0" },
    gate: "env_opt_in",
    consent: "not_elicited",
    argsDigest: "sha256:abc",
    runId: "11111111-1111-4111-8111-111111111111",
    status: "succeeded",
    saved: true,
    durationMs: 1234,
    ...overrides,
  };
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "qre-invocation-log-"));
});

afterEach(() => {
  if (savedDbPath === undefined) delete process.env.QRE_DB_PATH;
  else process.env.QRE_DB_PATH = savedDbPath;
  rmSync(directory, { recursive: true, force: true });
});

describe("canonicalJson", () => {
  it("does not depend on the order a client serialised its keys in", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(
      canonicalJson({ a: { c: 3, d: 2 }, b: 1 }),
    );
  });

  it("keeps array order, which is meaning rather than spelling", () => {
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
  });

  it("drops undefined, so an absent key and an explicit undefined agree", () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe(canonicalJson({ a: 1 }));
  });
});

describe("digestArguments", () => {
  it("is stable across key order and never carries the draft itself", () => {
    const digest = digestArguments({ name: "shor 2048", maxError: 0.01 });

    expect(digest).toBe(digestArguments({ maxError: 0.01, name: "shor 2048" }));
    expect(digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(digest).not.toContain("shor");
  });

  it("answers rather than throwing for something it cannot serialise", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;

    expect(digestArguments(cyclic)).toBe("sha256:unserialisable");
  });
});

describe("resolveInvocationLogPath", () => {
  it("puts the log beside the database the server is using", () => {
    process.env.QRE_DB_PATH = join(directory, "run-history.sqlite");

    expect(resolveInvocationLogPath()).toBe(join(directory, "mcp-invocations.jsonl"));
  });
});

describe("appendInvocation", () => {
  it("writes one parseable line carrying exactly the documented keys", () => {
    const path = join(directory, "log.jsonl");

    appendInvocation(record(), { path });

    const lines = readFileSync(path, "utf8").trimEnd().split("\n");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? "")).toEqual({
      ts: "2026-09-11T12:00:00.000Z",
      tool: "qre_run_estimate",
      client: { name: "claude-code", version: "2.0.0" },
      gate: "env_opt_in",
      consent: "not_elicited",
      argsDigest: "sha256:abc",
      runId: "11111111-1111-4111-8111-111111111111",
      status: "succeeded",
      saved: true,
      durationMs: 1234,
    });
  });

  it("appends rather than replacing", () => {
    const path = join(directory, "log.jsonl");

    appendInvocation(record(), { path });
    appendInvocation(record({ status: "refused", code: "RUN_BUSY", saved: false }), {
      path,
    });

    expect(readFileSync(path, "utf8").trimEnd().split("\n")).toHaveLength(2);
  });

  it("rotates to .1 .2 .3 and keeps no .4", () => {
    const path = join(directory, "log.jsonl");

    // Each line is far over 200 bytes, so every call rotates.
    for (let i = 0; i < 6; i += 1) appendInvocation(record(), { path, maxBytes: 200, keep: 3 });

    const files = readdirSync(directory).sort();
    expect(files).toEqual([
      "log.jsonl",
      "log.jsonl.1",
      "log.jsonl.2",
      "log.jsonl.3",
    ]);
  });

  it("does not throw when the log cannot be written", () => {
    // A run that finished must not be reported as failed because a log line
    // could not be written.
    const locked = join(directory, "locked");
    writeFileSync(join(directory, "placeholder"), "");
    chmodSync(directory, 0o500);

    try {
      expect(() => appendInvocation(record(), { path: join(locked, "log.jsonl") })).not.toThrow();
    } finally {
      chmodSync(directory, 0o700);
    }
  });
});
