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
 * The rules mirror `runconfig.schema.json` field for field, and the last
 * describe block DIFFS them against the committed schema rather than asserting
 * in prose that they match — the wrapper and the contract cannot drift without
 * a test failing.
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

import runConfigSchema from "../../shared/contracts/runconfig.schema.json" with { type: "json" };
import type { Architecture, QecCodeId, RunConfig } from "../../shared/types.js";
import { buildRunConfig } from "../../shared/testing/builders.js";
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
 * Manual Logical Counts rather than the builder's default benchmark: `main()`
 * builds the application BEFORE the architecture, so a Q# benchmark would pay a
 * compile on every one of the ~50 rejection cases below to reach the same
 * assertion.
 */
function config(architecture: Architecture): RunConfig {
  return buildRunConfig({
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
    maxError: 1,
    qreVersion: "qdk-qre-v1-fixture",
  });
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

  it("accepts a PRESENT twoQubitGateTime, not only null", async () => {
    // The null case above only proves the optional path. Every gateBased run
    // carries this field (configToInvocation emits `?? null`), so the value
    // path is the one most configs actually take.
    const result = await execute(withInjected(GATE_BASED, "twoQubitGateTime", 150), PYTHON_BIN);
    expect(result.ok, JSON.stringify(result)).toBe(true);
  }, 120_000);
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

  // All twelve, not a sample: the property under test is that a required field
  // which is ABSENT is named rather than raising a bare KeyError three frames
  // down, and that holds per field.
  it.each([
    "rydbergTime",
    "rydbergError",
    "singleQubitTime",
    "singleQubitError",
    "measurementTime",
    "measurementError",
    "handoffTime",
    "atomSpacing",
    "maxVelocity",
    "maxAcceleration",
    "surfaceCodeOneQubitTimeFactor",
    "surfaceCodeTwoQubitTimeFactor",
  ])(
    "rejects a missing required %s",
    async (field) => {
      await expectRejected(NEUTRAL_ATOM, field, undefined);
    },
    60_000,
  );
});

describe("the architecture type itself is bounded", () => {
  it.each([
    ["missing", undefined],
    ["unknown", "gatebased"],
    ["null", null],
    ["a number", 3],
  ])("rejects a %s architecture type", async (_label, value) => {
    // `architecture["type"]` was a bare subscript: a record without the
    // discriminator raised KeyError and surfaced as ESTIMATION_FAILED with the
    // message `'type'`, naming nothing, on the one field that decides which
    // bounds apply at all.
    const result = await execute(withInjected(GATE_BASED, "type", value), PYTHON_BIN);

    expect(result.ok, `type=${JSON.stringify(value)} was accepted`).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("INVALID_CONFIG");
      expect(result.message).toContain("architecture type");
    }
  }, 60_000);
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

  it("rejects an integer too large to convert to a float at all", () => {
    // Python ints are arbitrary precision and json.loads builds one from any
    // digit string, so `float(value)` inside the checker raised OverflowError —
    // NOT an InvalidInvocation, so it escaped as ESTIMATION_FAILED "int too
    // large to convert to float", with no field named. The bad-input path of
    // the guard was itself producing the diagnostic the guard exists to remove.
    const stdin = JSON.stringify(invocationFor(GATE_BASED)).replace(
      '"gateTime":50',
      `"gateTime":${"1".padEnd(400, "0")}`,
    );

    const parsed = runWrapperRaw(stdin);
    expect(parsed["code"]).toBe("INVALID_CONFIG");
    expect(String(parsed["message"])).toContain("gateTime");
    // The 400-digit literal is described, not pasted into a message that gets
    // stored on the run record and rendered.
    expect(String(parsed["message"]).length).toBeLessThan(200);
  }, 60_000);

  it("rejects an integral value too large to be exact, which qdk fails opaquely on", () => {
    // 1e300 satisfies `is_integer()` and every other gateTime bound, so before
    // the MAX_EXACT_INT cap it reached qdk and came back ESTIMATION_FAILED
    // "int too big to convert".
    const stdin = JSON.stringify(invocationFor(GATE_BASED)).replace(
      '"gateTime":50',
      '"gateTime":1e300',
    );

    const parsed = runWrapperRaw(stdin);
    expect(parsed["code"]).toBe("INVALID_CONFIG");
    expect(String(parsed["message"])).toContain("gateTime");
  }, 60_000);

  it("rejects an integer one above MAX_SAFE_INTEGER, which float() rounds away", () => {
    // 9007199254740993 cannot be written exactly as a JSON number: `float()`
    // silently makes it ...992, so accepting it would run a configuration one
    // nanosecond away from the record's.
    const stdin = JSON.stringify(invocationFor(GATE_BASED)).replace(
      '"gateTime":50',
      '"gateTime":9007199254740993',
    );

    const parsed = runWrapperRaw(stdin);
    expect(parsed["code"]).toBe("INVALID_CONFIG");
    expect(String(parsed["message"])).toContain("gateTime");
  }, 60_000);
});

// ---------------------------------------------------------------------------
// The transcription itself
// ---------------------------------------------------------------------------

/**
 * The rules tables as `estimate.py` actually holds them.
 *
 * Dumped from the module rather than re-declared here: a second hand-written
 * copy would drift from the first exactly as the first can drift from the
 * schema, which is the whole failure this block exists to catch.
 */
let cachedRules: Record<string, Record<string, Record<string, unknown>>> | null = null;

function wrapperRules(): Record<string, Record<string, Record<string, unknown>>> {
  // Memoized: importing the module pulls qdk in, which is seconds, and every
  // case below wants the same three tables.
  if (cachedRules) return cachedRules;
  const script = [
    "import json, sys",
    `sys.path.insert(0, ${JSON.stringify(path.dirname(WRAPPER_SCRIPT))})`,
    "import estimate",
    "print(json.dumps({",
    "  'gateBased': estimate.GATE_BASED_RULES,",
    "  'majorana': estimate.MAJORANA_RULES,",
    "  'neutralAtom': estimate.NEUTRAL_ATOM_RULES,",
    "}))",
  ].join("\n");
  const process = spawnSync(PYTHON_BIN, ["-c", script], { encoding: "utf8", timeout: 120_000 });
  expect(process.status, process.stderr).toBe(0);
  cachedRules = JSON.parse(process.stdout.trim().split("\n").at(-1) as string);
  return cachedRules!;
}

/**
 * One schema property, rewritten in the rules tables' vocabulary.
 *
 * `twoQubitGateTime` is a nullable `oneOf` rather than a flat entry, so the
 * null branch is dropped and the numeric one is what gets compared —
 * "optional" is already carried by absence from `required`.
 */
function asRule(property: Record<string, unknown>, required: boolean): Record<string, unknown> {
  const branches = property["oneOf"] as Record<string, unknown>[] | undefined;
  const source = branches ? branches.filter((b) => b["type"] !== "null")[0]! : property;

  const rule: Record<string, unknown> = {};
  if (source["type"] === "integer") rule["integer"] = true;
  if ("enum" in source) rule["enum"] = source["enum"];
  for (const [schemaKey, ruleKey] of [
    ["minimum", "minimum"],
    ["exclusiveMinimum", "exclusive_minimum"],
    ["maximum", "maximum"],
    ["exclusiveMaximum", "exclusive_maximum"],
  ] as const) {
    if (schemaKey in source) rule[ruleKey] = source[schemaKey];
  }
  if (!required) rule["optional"] = true;
  return rule;
}

describe("the rules tables are the schema, not a paraphrase of it", () => {
  const variants = (
    runConfigSchema.properties.architecture.oneOf as unknown as {
      required: string[];
      properties: Record<string, Record<string, unknown>>;
    }[]
  ).map((variant) => ({
    type: (variant.properties["type"] as { const: string }).const,
    required: new Set(variant.required),
    properties: variant.properties,
  }));

  it.each(variants.map((v) => [v.type, v] as const))(
    "%s matches runconfig.schema.json field for field",
    (_type, variant) => {
      const rules = wrapperRules()[variant.type]!;
      const expected: Record<string, Record<string, unknown>> = {};
      for (const [name, property] of Object.entries(variant.properties)) {
        if (name === "type") continue;
        expected[name] = asRule(property, variant.required.has(name));
      }

      // Deep equality in BOTH directions at once: a field the schema adds and
      // the table lacks, a bound that moved, and a stray rule the schema does
      // not describe are all the same failure.
      expect(rules).toEqual(expected);
    },
    120_000,
  );

  it("caps every integral field at Number.MAX_SAFE_INTEGER", () => {
    // The cap is the one bound that is about the WIRE rather than the domain,
    // so it is the one most likely to be dropped when a field is added.
    for (const [architecture, rules] of Object.entries(wrapperRules())) {
      for (const [name, rule] of Object.entries(rules)) {
        if (!rule["integer"]) continue;
        expect(rule["maximum"], `${architecture}.${name}`).toBe(Number.MAX_SAFE_INTEGER);
      }
    }
  }, 120_000);
});
