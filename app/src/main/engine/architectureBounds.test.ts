/**
 * Engine-side validation of EVERY architecture parameter, on all three models.
 *
 * The third and last file in the arc that started with `majoranaTErrorRate` and
 * `majoranaErrorRate`. Those two covered the parameters qdk was measured to
 * mishandle; this one closes the rest, because the measurement generalised:
 * **qdk validates no architecture parameter at all.** `GateBased`, `Majorana`
 * and `NeutralAtom` are plain dataclasses whose only `__post_init__` logic is
 * Majorana's `t_error_rate` derivation. Every field below constructs happily
 * from a negative, zero, or absurd value.
 *
 * Measured on qdk 1.30.0, the three failure modes that produces:
 *
 * 1. **A wrong number, reported as success.** `gateBased errorRate=-1e-4`
 *    estimates and returns `error: -9.99e-05` — a negative probability, on the
 *    DEFAULT architecture. `neutralAtom rydbergError=-1.0` estimates and
 *    returns `0.0109` where the same config returns `0.991`.
 * 2. **A soft failure blaming the wrong thing.** `gateTime=-50` fails with
 *    "can't convert negative int to unsigned"; `atomSpacing=-3` with "math
 *    domain error" — both ESTIMATION_FAILED, which tells the analyst the model
 *    was infeasible.
 * 3. **A hard crash.** `majorana operationTime=0` panics inside pyo3. That is a
 *    `BaseException`, which `main()`'s `except Exception` cannot catch, so
 *    stdout is empty and it surfaces as ENGINE_CRASH — "verify the Python
 *    environment" — for what is purely a bad config.
 *
 * The rules mirror `runconfig.schema.json` field for field, so this suite is
 * also what stops the wrapper and the schema drifting apart. One deliberate
 * divergence is pinned below: qdk requires the time fields to be INTEGRAL,
 * where the schema types four of them as `number`.
 *
 * Every test bypasses `configToInvocation` on purpose — it builds a config that
 * PASSES the TypeScript guard, then injects the bad value into the invocation.
 *
 * Real engine: needs the venv on qdk[qre]==1.30.0. Runs under
 * `npm run test:engine`, not the fast unit suite.
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  SCHEMA_VERSION,
  type Architecture,
  type QecCodeId,
  type RunConfig,
} from "../../shared/types.js";
import { DEFAULT_TRACE_TRANSFORM } from "../../shared/traceTransform.js";
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

const GATE_BASED: Architecture = {
  type: "gateBased",
  errorRate: 0.0001,
  gateTime: 50,
  measurementTime: 100,
  twoQubitGateTime: null,
};

const MAJORANA: Architecture = {
  type: "majorana",
  errorRate: 0.00001,
  operationTime: 1000,
};

const NEUTRAL_ATOM: Architecture = {
  type: "neutralAtom",
  rydbergTime: 500,
  rydbergError: 0.001,
  singleQubitTime: 1000,
  singleQubitError: 0.0001,
  measurementTime: 10000,
  measurementError: 0.0001,
  handoffTime: 0,
  atomSpacing: 3,
  maxVelocity: 0.25,
  maxAcceleration: 5000,
  surfaceCodeOneQubitTimeFactor: 1,
  surfaceCodeTwoQubitTimeFactor: 1,
};

const QEC: Record<Architecture["type"], QecCodeId> = {
  gateBased: "surface_code",
  majorana: "three_aux",
  neutralAtom: "low_move_surface_code",
};

/**
 * Manual Logical Counts rather than a benchmark: `main()` builds the
 * application BEFORE the architecture, so a Q# benchmark would pay a compile on
 * every one of the ~40 rejection cases below to reach the same assertion.
 */
function config(architecture: Architecture): RunConfig {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: "7d000000-0000-4000-8000-000000000001",
    name: "architecture bounds",
    createdAt: "2026-08-02T00:00:00.000Z",
    application: {
      type: "manualCounts",
      numQubits: 10,
      tCount: 100,
      rotationCount: 0,
      rotationDepth: 0,
      cczCount: 0,
      ccixCount: 0,
      measurementCount: 10,
    },
    architecture,
    qecCode: QEC[architecture.type],
    magicStateFactories: ["round_based"],
    traceTransform: { ...DEFAULT_TRACE_TRANSFORM },
    maxError: 1,
    qreVersion: "qdk-qre-v1-fixture",
  };
}

/** The invocation the TypeScript guard actually produced, for a valid config. */
function invocationFor(architecture: Architecture): QreInvocation {
  const result = configToInvocation(config(architecture), 120_000);
  expect(result.ok, JSON.stringify(result)).toBe(true);
  if (!result.ok) throw new Error("unreachable");
  return result.invocation;
}

/**
 * An invocation carrying a field value the TypeScript guard would have refused.
 * `undefined` deletes the field, which is how a required-but-missing parameter
 * is modelled.
 */
function withInjected(
  base: Architecture,
  field: string,
  value: unknown,
): QreInvocation {
  const invocation = invocationFor(base);
  const architecture = invocation.architecture as Record<string, unknown>;
  if (value === undefined) delete architecture[field];
  else architecture[field] = value;
  return invocation;
}

async function expectRejected(
  base: Architecture,
  field: string,
  value: unknown,
): Promise<void> {
  const result = await execute(withInjected(base, field, value), PYTHON_BIN);

  expect(result.ok, `${field}=${JSON.stringify(value)} was accepted`).toBe(false);
  if (!result.ok) {
    // INVALID_CONFIG, not ESTIMATION_FAILED or ENGINE_CRASH: nothing ran, and
    // the analyst's next step is to correct the named field.
    expect(result.code).toBe("INVALID_CONFIG");
    expect(result.message).toContain(field);
  }
}

// ---------------------------------------------------------------------------
// The three failure modes this change exists to remove
// ---------------------------------------------------------------------------

describe("the values that silently produced a WRONG NUMBER", () => {
  it("rejects a negative gateBased errorRate, which estimated to a negative error", async () => {
    // Measured before this guard: status success, error -9.99e-05. On the
    // default architecture, and mapRow accepts it because it is finite.
    await expectRejected(GATE_BASED, "errorRate", -0.0001);
  }, 60_000);

  it("rejects a negative neutralAtom rydbergError, which changed the answer", async () => {
    // Measured before this guard: status success, error 0.0109 against the
    // same config's true 0.991.
    await expectRejected(NEUTRAL_ATOM, "rydbergError", -1);
  }, 60_000);
});

describe("the values that failed while blaming the wrong thing", () => {
  it.each([
    ["gateBased gateTime", GATE_BASED, "gateTime", -50],
    ["neutralAtom atomSpacing", NEUTRAL_ATOM, "atomSpacing", -3],
    ["majorana operationTime", MAJORANA, "operationTime", -500],
  ])("names the field for %s instead of reporting ESTIMATION_FAILED", async (
    _label,
    base,
    field,
    value,
  ) => {
    await expectRejected(base as Architecture, field as string, value);
  }, 60_000);
});

describe("the value that crashed the process", () => {
  it("rejects majorana operationTime 0, which panicked inside pyo3", async () => {
    // pyo3's PanicException derives from BaseException, so `except Exception`
    // in main() never saw it: stdout was empty, the process exited 1, and
    // execute.ts reported ENGINE_CRASH "verify the Python environment".
    await expectRejected(MAJORANA, "operationTime", 0);
  }, 60_000);
});

// ---------------------------------------------------------------------------
// Every declared field, on every architecture
// ---------------------------------------------------------------------------

describe("every gateBased parameter is bounded", () => {
  it.each([
    ["errorRate", 0],
    ["errorRate", 0.01],
    ["errorRate", 1],
    ["gateTime", 0],
    ["gateTime", 50.5],
    ["measurementTime", 0],
    ["measurementTime", -100],
    ["measurementTime", 100.5],
    ["twoQubitGateTime", 0],
    ["twoQubitGateTime", -75],
    ["twoQubitGateTime", 75.5],
  ])("rejects %s = %p", async (field, value) => {
    await expectRejected(GATE_BASED, field, value);
  }, 60_000);

  it.each(["errorRate", "gateTime", "measurementTime"])(
    "rejects a missing required %s",
    async (field) => {
      await expectRejected(GATE_BASED, field, undefined);
    },
    60_000,
  );

  it("accepts a null twoQubitGateTime, which means 'let qdk default it'", async () => {
    const result = await execute(withInjected(GATE_BASED, "twoQubitGateTime", null), PYTHON_BIN);
    expect(result.ok, JSON.stringify(result)).toBe(true);
  }, 60_000);
});

describe("every majorana parameter is bounded", () => {
  it.each([
    ["operationTime", 250.5],
    ["operationTime", -1],
    ["targetYear", -1],
    ["targetYear", 2030.5],
  ])("rejects %s = %p", async (field, value) => {
    await expectRejected(MAJORANA, field, value);
  }, 60_000);

  it("rejects a missing required operationTime", async () => {
    await expectRejected(MAJORANA, "operationTime", undefined);
  }, 60_000);
});

describe("every neutralAtom parameter is bounded", () => {
  it.each([
    ["rydbergTime", 0],
    ["rydbergTime", 500.5],
    ["rydbergError", 0.01],
    ["singleQubitTime", -1000],
    ["singleQubitError", -0.0001],
    ["measurementTime", 0],
    ["measurementError", 0.01],
    ["handoffTime", -1],
    ["handoffTime", 0.5],
    ["atomSpacing", 0],
    ["maxVelocity", -0.25],
    ["maxAcceleration", 0],
    ["surfaceCodeOneQubitTimeFactor", 0],
    ["surfaceCodeTwoQubitTimeFactor", 1.5],
    ["dataQubitSpacing", -12],
    ["targetYear", -1],
  ])("rejects %s = %p", async (field, value) => {
    await expectRejected(NEUTRAL_ATOM, field, value);
  }, 60_000);

  it.each(["rydbergTime", "rydbergError", "atomSpacing", "maxVelocity"])(
    "rejects a missing required %s",
    async (field) => {
      await expectRejected(NEUTRAL_ATOM, field, undefined);
    },
    60_000,
  );
});

describe("non-numeric values are refused on every architecture", () => {
  it.each([
    ["gateBased", GATE_BASED, "errorRate"],
    ["majorana", MAJORANA, "operationTime"],
    ["neutralAtom", NEUTRAL_ATOM, "atomSpacing"],
  ])("rejects a string, a boolean and null on %s", async (_label, base, field) => {
    for (const value of ["0.0001", true, null]) {
      await expectRejected(base as Architecture, field as string, value);
    }
  }, 120_000);
});

// ---------------------------------------------------------------------------
// The guard must not reject anything the contract allows
// ---------------------------------------------------------------------------

describe("every contract-valid architecture still estimates", () => {
  it.each([
    ["gateBased", GATE_BASED],
    ["majorana", MAJORANA],
    ["neutralAtom", NEUTRAL_ATOM],
  ])("runs %s unchanged", async (_label, architecture) => {
    const result = await execute(invocationFor(architecture as Architecture), PYTHON_BIN);

    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (result.ok) {
      expect(result.raw["status"]).toBe("success");
      const frontier = result.raw["frontier"] as { error: number }[];
      expect(frontier.length).toBeGreaterThan(0);
      // The property a bad rate breaks: a probability is positive.
      for (const row of frontier) expect(row.error).toBeGreaterThan(0);
    }
  }, 120_000);

  it("accepts the optional neutralAtom fields at their contract bounds", async () => {
    const result = await execute(
      invocationFor({
        ...NEUTRAL_ATOM,
        dataQubitSpacing: 12,
        targetYear: 0,
      } as Architecture),
      PYTHON_BIN,
    );
    expect(result.ok, JSON.stringify(result)).toBe(true);
  }, 120_000);
});

// ---------------------------------------------------------------------------
// Wire-level cases JSON.stringify cannot express
// ---------------------------------------------------------------------------

/** Run the wrapper on hand-written stdin, bypassing JSON.stringify. */
function runWrapperRaw(stdin: string): Record<string, unknown> {
  const process = spawnSync(PYTHON_BIN, [WRAPPER_SCRIPT], {
    input: stdin,
    encoding: "utf8",
    timeout: 60_000,
  });
  expect(process.status, process.stderr).toBe(0);
  return JSON.parse(process.stdout) as Record<string, unknown>;
}

describe("wire-level values JSON.stringify cannot produce", () => {
  it("rejects the non-finite Infinity literal on an unbounded-above field", () => {
    // atomSpacing has no upper bound, so unlike tErrorRate's (0, 0.05] the range
    // comparison alone would let Infinity through. This is what makes the
    // wrapper's explicit finiteness check load-bearing rather than redundant.
    const stdin = JSON.stringify(invocationFor(NEUTRAL_ATOM)).replace(
      '"atomSpacing":3',
      '"atomSpacing":Infinity',
    );
    expect(stdin).toContain("Infinity");

    const parsed = runWrapperRaw(stdin);
    expect(parsed["status"]).toBe("failed");
    expect(parsed["code"]).toBe("INVALID_CONFIG");
    expect(String(parsed["message"])).toContain("atomSpacing");
  }, 60_000);

  it("accepts an integral field written as a JSON float", () => {
    // qdk requires a Python int and rejects 1000.0 with "'float' object cannot
    // be interpreted as an integer". JS cannot tell 1000 from 1000.0, so a
    // producer that writes the latter is describing the same configuration —
    // the wrapper coerces rather than failing on the representation.
    const stdin = JSON.stringify(invocationFor(MAJORANA)).replace(
      '"operationTime":1000',
      '"operationTime":1000.0',
    );
    expect(stdin).toContain("1000.0");

    const parsed = runWrapperRaw(stdin);
    expect(parsed["status"], JSON.stringify(parsed).slice(0, 300)).toBe("success");
  }, 120_000);
});
