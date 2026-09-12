// @vitest-environment node

/**
 * The gate, and the interpreter check behind it.
 *
 * The interpreter test uses `process.execPath` as the "real" one, because it is
 * the one executable every machine running this test is guaranteed to have.
 */

import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  getEngine,
  isRunToolEnabled,
  resetEngineAccessForTests,
  setEstimatorForTests,
} from "./engineAccess.js";
import { buildRunResult } from "../shared/testing/builders.js";
import { fakeEstimator } from "../shared/testing/fakeEstimator.js";

let directory: string;
const savedPythonBin = process.env.QRE_PYTHON_BIN;

beforeEach(() => {
  resetEngineAccessForTests();
  directory = mkdtempSync(join(tmpdir(), "qre-engine-access-"));
});

afterEach(() => {
  resetEngineAccessForTests();
  if (savedPythonBin === undefined) delete process.env.QRE_PYTHON_BIN;
  else process.env.QRE_PYTHON_BIN = savedPythonBin;
  rmSync(directory, { recursive: true, force: true });
});

describe("isRunToolEnabled", () => {
  it("is on for exactly \"1\"", () => {
    expect(isRunToolEnabled({ QRE_MCP_ALLOW_RUNS: "1" })).toBe(true);
  });

  it("is off when unset, and off for the spellings people write meaning off", () => {
    expect(isRunToolEnabled({})).toBe(false);
    expect(isRunToolEnabled({ QRE_MCP_ALLOW_RUNS: "0" })).toBe(false);
    expect(isRunToolEnabled({ QRE_MCP_ALLOW_RUNS: "false" })).toBe(false);
    // Not "any truthy string": a gate that reads "false" as on fails open.
    expect(isRunToolEnabled({ QRE_MCP_ALLOW_RUNS: "true" })).toBe(false);
  });
});

describe("getEngine", () => {
  it("refuses an interpreter that is not executable, naming the variable and not the path", () => {
    const notExecutable = join(directory, "python3");
    writeFileSync(notExecutable, "#!/bin/sh\n");
    chmodSync(notExecutable, 0o644);
    process.env.QRE_PYTHON_BIN = notExecutable;

    const resolution = getEngine();

    expect(resolution.ok).toBe(false);
    if (resolution.ok) throw new Error("expected a refusal");
    expect(resolution.code).toBe("ENGINE_NOT_CONFIGURED");
    expect(resolution.message).toMatch(/QRE_PYTHON_BIN/);
    // A path is the analyst's filesystem layout and has no business crossing
    // to an external MCP client.
    expect(resolution.message).not.toContain(directory);
  });

  it("resolves an executable interpreter, and caches the engine it built", () => {
    process.env.QRE_PYTHON_BIN = process.execPath;

    const first = getEngine();
    const second = getEngine();

    expect(first.ok).toBe(true);
    if (!first.ok || !second.ok) throw new Error("expected an engine");
    expect(second.engine).toBe(first.engine);
  });

  it("prefers a test estimator over whatever the machine has", () => {
    process.env.QRE_PYTHON_BIN = join(directory, "does-not-exist");
    const estimator = fakeEstimator(buildRunResult());
    setEstimatorForTests(estimator);

    const resolution = getEngine();

    expect(resolution.ok).toBe(true);
    if (!resolution.ok) throw new Error("expected an engine");
    expect(resolution.engine).toBe(estimator);
  });
});
