/**
 * Engine-side validation of Majorana's v1.4.0 `t_error_rate`.
 *
 * qdk 1.30.0 does not validate an explicitly-supplied `t_error_rate`.
 * `Majorana.__post_init__` only DERIVES one when the field is `None`; a value
 * that is already present is left alone, and `provided_isa` then casts it
 * straight onto the `T` instruction's error rate. Measured on 1.30.0,
 * `t_error_rate=0.9` and `t_error_rate=-0.1` are both accepted and used
 * verbatim, so a typo produces a confident, meaningless estimate rather than an
 * error.
 *
 * That made `configToInvocation`'s `(0, 0.05]` check the ONLY thing standing
 * between the typo and the estimate — load-bearing, not defensive. These tests
 * bypass it on purpose: they build a config that PASSES the TypeScript guard,
 * then inject the bad value into the invocation afterwards, which is exactly
 * the shape of a run that reaches `estimate.py` some other way. What they pin
 * is the wrapper's own refusal.
 *
 * Real engine: needs the venv on qdk[qre]==1.30.0. Runs under
 * `npm run test:engine`, not the fast unit suite.
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type { MajoranaArchitecture, RunConfig } from "../../shared/types.js";
import { buildSmallDynamicsConfig } from "../../shared/testing/builders.js";
import { configToInvocation } from "./configToInvocation.js";
import { execute } from "./execute.js";
import type { QreInvocation } from "./invocation.js";
import { resolvePythonBin } from "./pythonBin.js";

const PYTHON_BIN = resolvePythonBin();
const WRAPPER_SCRIPT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "python",
  "estimate.py",
);

const MAJORANA: MajoranaArchitecture = {
  type: "majorana",
  errorRate: 0.00001,
  operationTime: 1000,
};

/**
 * A Majorana run the contract accepts end to end: small lattice, because
 * Majorana/Three-Aux has no feasible frontier point for the default 10x10
 * circuit even at maxError = 1.
 */
const config = (architecture: MajoranaArchitecture): RunConfig =>
  buildSmallDynamicsConfig({ architecture, qecCode: "three_aux" });

/** The invocation the TypeScript guard actually produced, for a valid config. */
function invocationFor(architecture: MajoranaArchitecture): QreInvocation {
  const result = configToInvocation(config(architecture), 120_000);
  expect(result.ok, JSON.stringify(result)).toBe(true);
  if (!result.ok) throw new Error("unreachable");
  return result.invocation;
}

/**
 * An invocation carrying a `tErrorRate` the TypeScript guard would have
 * refused. The cast is the point: this is a value that can only arrive if
 * `configToInvocation` is bypassed, which is the case the wrapper must cover.
 */
function withInjectedTErrorRate(value: unknown): QreInvocation {
  const invocation = invocationFor(MAJORANA);
  (invocation.architecture as { tErrorRate?: unknown }).tErrorRate = value;
  return invocation;
}

describe("estimate.py refuses an out-of-range Majorana tErrorRate", () => {
  it.each([
    ["above the modelled regime", 0.9],
    ["negative", -0.1],
    ["zero", 0],
    ["just above the bound", 0.050000001],
  ])("rejects a %s value (%p) before it reaches the T instruction", async (_label, value) => {
    const result = await execute(withInjectedTErrorRate(value), PYTHON_BIN);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      // INVALID_CONFIG, not ESTIMATION_FAILED: nothing was estimated, and the
      // analyst's next step is to correct a field rather than relax a bound.
      expect(result.code).toBe("INVALID_CONFIG");
      expect(result.message).toContain("tErrorRate");
      expect(result.message).toContain(String(value));
    }
  }, 60_000);

  it.each([
    ["a string", "0.01"],
    ["a boolean", true],
    ["an object", { value: 0.01 }],
  ])("rejects a non-numeric tErrorRate (%s)", async (_label, value) => {
    const result = await execute(withInjectedTErrorRate(value), PYTHON_BIN);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("INVALID_CONFIG");
      expect(result.message).toContain("tErrorRate");
    }
  }, 60_000);

  // NaN and Infinity cannot be tested through `execute`: JSON.stringify turns
  // both into `null`, which the wrapper reads as "absent" — correctly, since
  // that is what an omitted optional looks like on this wire. Python's own
  // json.loads DOES accept the non-standard `NaN` / `Infinity` literals, so the
  // wrapper is fed them directly here.
  it.each(["NaN", "Infinity", "-Infinity"])(
    "rejects the non-finite literal %s that Python's json.loads accepts",
    (literal) => {
      const invocation = invocationFor(MAJORANA);
      const stdin = JSON.stringify(invocation).replace(
        '"type":"majorana"',
        `"type":"majorana","tErrorRate":${literal}`,
      );
      expect(stdin).toContain(literal);
      const process = spawnSync(PYTHON_BIN, [WRAPPER_SCRIPT], {
        input: stdin,
        encoding: "utf8",
        timeout: 60_000,
      });

      expect(process.status, process.stderr).toBe(0);
      const parsed = JSON.parse(process.stdout) as Record<string, unknown>;
      expect(parsed["status"]).toBe("failed");
      expect(parsed["code"]).toBe("INVALID_CONFIG");
      expect(String(parsed["message"])).toContain("tErrorRate");
    },
    60_000,
  );
});

describe("estimate.py still runs every tErrorRate the contract allows", () => {
  it("accepts the upper bound 0.05", async () => {
    const result = await execute(invocationFor({ ...MAJORANA, tErrorRate: 0.05 }), PYTHON_BIN);

    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (result.ok) expect(result.raw["status"]).toBe("success");
  }, 120_000);

  it("accepts a small in-range value", async () => {
    const result = await execute(invocationFor({ ...MAJORANA, tErrorRate: 0.001 }), PYTHON_BIN);

    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (result.ok) expect(result.raw["status"]).toBe("success");
  }, 120_000);

  it("accepts an absent tErrorRate, leaving qdk's derivation in place", async () => {
    // The guard must not turn "omitted" into a rejection: omitting the kwarg is
    // what lets `__post_init__` derive 0.015 from errorRate 1e-5.
    const invocation = invocationFor(MAJORANA);
    expect(invocation.architecture).not.toHaveProperty("tErrorRate");

    const result = await execute(invocation, PYTHON_BIN);
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (result.ok) expect(result.raw["status"]).toBe("success");
  }, 120_000);
});
