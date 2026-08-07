/**
 * Engine-side validation of Majorana's `error_rate`.
 *
 * The sibling of `majoranaTErrorRate.test.ts`, and a strictly worse defect.
 * qdk 1.30.0 does have a domain check for `error_rate` — "Must be one of
 * [1e-4, 1e-5, 1e-6]" — but it cannot be relied on, for two independent
 * reasons, both measured:
 *
 * 1. It lives INSIDE `__post_init__`'s `if self.t_error_rate is None:` branch.
 *    Supplying a `t_error_rate` — which the wrapper does whenever the contract
 *    carries one — skips the check entirely:
 *
 *      Majorana(error_rate=0.5, time=1000)                    -> ValueError
 *      Majorana(error_rate=0.5, time=1000, t_error_rate=0.01) -> constructs
 *
 * 2. It is a TOLERANCE test (`abs(x - 1e-4) <= 1e-8`), so it admits values the
 *    contract's exact enum does not.
 *
 * What makes this worse than the `t_error_rate` case is where it ends up. A
 * negative `error_rate` does not fail the run — it produces a successful
 * estimate carrying a NEGATIVE total error, which `mapRow` accepts (it checks
 * only `isFiniteNumber`) and the Results surface renders as a probability:
 *
 *      errorRate=-1e-5, tErrorRate=0.01  ->  status success, error -0.0032
 *
 * That is a rendered wrong number, not a failed run, so `configToInvocation`'s
 * enum check was the only thing preventing it.
 *
 * These tests bypass that check on purpose: they build a config that PASSES the
 * TypeScript guard, then inject the bad value into the invocation afterwards,
 * which is the shape of a run reaching `estimate.py` any other way.
 *
 * Real engine: needs the venv on qdk[qre]==1.30.0. Runs under
 * `npm run test:engine`, not the fast unit suite.
 */

import { describe, expect, it } from "vitest";

import type { MajoranaArchitecture, RunConfig } from "../../shared/types.js";
import { buildSmallDynamicsConfig } from "../../shared/testing/builders.js";
import { configToInvocation } from "./configToInvocation.js";
import { execute } from "./execute.js";
import type { QreInvocation } from "./invocation.js";
import { resolvePythonBin } from "./pythonBin.js";

const PYTHON_BIN = resolvePythonBin();

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
 * Assert the message echoes the offending value, comparing NUMERICALLY.
 * `String(value)` would be wrong twice over: JS renders -1e-5 as "-0.00001"
 * where Python's repr gives "-1e-05", and a substring test for `String(1.0)`
 * — "1" — passes against the "1e-04" in the allowed-set text without the
 * message naming the value at all.
 */
function expectMessageEchoes(message: string, value: number): void {
  const echoed = /got (.+?)\.\s/.exec(message)?.[1];
  expect(echoed, `no "got <value>" in: ${message}`).toBeDefined();
  expect(Number(echoed)).toBe(value);
}

/**
 * An invocation carrying an `errorRate` the TypeScript guard would have
 * refused. `MajoranaArchitecture.errorRate` is a literal union, so this value
 * cannot be written into a config at all — mutating the invocation afterwards
 * is the only way to model a run that skipped `configToInvocation`.
 */
function withInjectedErrorRate(
  value: unknown,
  overrides: Partial<MajoranaArchitecture> = {},
): QreInvocation {
  const invocation = invocationFor({ ...MAJORANA, ...overrides });
  const architecture = invocation.architecture as {
    errorRate?: unknown;
  };
  if (value === undefined) delete architecture.errorRate;
  else architecture.errorRate = value;
  return invocation;
}

describe("estimate.py refuses an off-enum Majorana errorRate", () => {
  it("rejects the negative rate that currently returns a negative total error", async () => {
    // THE test for this change. With a tErrorRate present, qdk skips its own
    // domain check, estimates happily, and reports error = -0.0032 — a negative
    // probability that flows through mapRow onto the Results surface.
    const result = await execute(
      withInjectedErrorRate(-0.00001, { tErrorRate: 0.01 }),
      PYTHON_BIN,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("INVALID_CONFIG");
      expect(result.message).toContain("errorRate");
    }
  }, 60_000);

  it.each([
    ["far too high", 0.5],
    ["plausible but off-enum", 0.001],
    ["zero", 0],
    ["certain failure", 1.0],
    ["negative", -0.00001],
  ])("rejects a %s errorRate (%p)", async (_label, value) => {
    // Injected WITHOUT a tErrorRate too: qdk's own check would catch some of
    // these, but as an unlabelled ValueError classified ESTIMATION_FAILED, which
    // tells the analyst the model was infeasible rather than naming the field.
    const result = await execute(withInjectedErrorRate(value), PYTHON_BIN);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("INVALID_CONFIG");
      expect(result.message).toContain("errorRate");
      expectMessageEchoes(result.message, value);
    }
  }, 60_000);

  it("rejects a near-enum value that qdk's 1e-8 tolerance would admit", async () => {
    // qdk tests `abs(x - 1e-5) <= 1e-8`; the contract's schema and
    // configToInvocation both test exact enum membership. The wrapper follows
    // the contract, so this is a deliberate tightening over qdk.
    const result = await execute(withInjectedErrorRate(0.00001 + 1e-9), PYTHON_BIN);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("INVALID_CONFIG");
  }, 60_000);

  it.each([
    ["a string", "1e-5"],
    ["a boolean", true],
    ["null", null],
    ["absent", undefined],
  ])("rejects a non-numeric errorRate (%s)", async (_label, value) => {
    // Absent is the interesting one: `architecture["errorRate"]` raised a bare
    // KeyError, which surfaced as ESTIMATION_FAILED with the message "'errorRate'".
    const result = await execute(withInjectedErrorRate(value), PYTHON_BIN);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("INVALID_CONFIG");
      expect(result.message).toContain("errorRate");
    }
  }, 60_000);
});

describe("estimate.py still runs every Majorana errorRate the contract allows", () => {
  it.each([0.0001, 0.00001, 0.000001] as const)(
    "does not refuse the contract-valid rate %p",
    async (errorRate) => {
      // Deliberately NOT asserting success: 1e-4 may legitimately have no
      // feasible frontier point on Three-Aux, and that is a failed run rather
      // than a validation error. What must never happen is INVALID_CONFIG.
      const result = await execute(invocationFor({ ...MAJORANA, errorRate }), PYTHON_BIN);

      if (!result.ok) expect(result.code).not.toBe("INVALID_CONFIG");
    },
    120_000,
  );

  it("estimates normally at 1e-5, with and without a tErrorRate", async () => {
    const derived = await execute(invocationFor(MAJORANA), PYTHON_BIN);
    expect(derived.ok, JSON.stringify(derived)).toBe(true);

    const explicit = await execute(
      invocationFor({ ...MAJORANA, tErrorRate: 0.01 }),
      PYTHON_BIN,
    );
    expect(explicit.ok, JSON.stringify(explicit)).toBe(true);
  }, 120_000);

  it("reports a positive total error, which a bad rate is what breaks", async () => {
    // The property the guard protects. Pinning it here means a future change
    // that lets a negative rate through fails on the number, not just the code.
    const result = await execute(
      invocationFor({ ...MAJORANA, tErrorRate: 0.01 }),
      PYTHON_BIN,
    );

    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (result.ok) {
      const frontier = result.raw["frontier"] as { error: number }[];
      expect(frontier.length).toBeGreaterThan(0);
      for (const row of frontier) expect(row.error).toBeGreaterThan(0);
    }
  }, 120_000);
});
