/**
 * v1.4.0 JSON Schema tests. v1.4.0 is ADDITIVE: it adds two optional trace
 * pipeline stages, four optional QPU parameters, and optional run provenance,
 * and reshapes nothing. So the first thing these pin down is that a v1.3.0-shaped
 * config is still valid — if that ever breaks, the version was mis-numbered and
 * `upgradeRunConfig` owes the shape a migration branch.
 *
 * The rest are the NEGATIVE cases the form cannot produce: out-of-range compute
 * capacity, an eviction strategy qdk does not have, a Majorana T error rate
 * outside its interval, provenance naming an author the contract does not know.
 */

import { describe, expect, it } from "vitest";

import { buildRunConfig } from "../../shared/testing/builders";
import { validateRunConfigSchema } from "./schemaValidation";
import { DEFAULT_TRACE_TRANSFORM } from "../../shared/traceTransform";
import {
  SCHEMA_VERSION,
  SCHEMA_VERSIONS,
  type MajoranaArchitecture,
  type NeutralAtomArchitecture,
  type RunConfig,
} from "../../shared/types";

const NEUTRAL_ATOM: NeutralAtomArchitecture = {
  type: "neutralAtom",
  rydbergTime: 500,
  rydbergError: 0.001,
  singleQubitTime: 1000,
  singleQubitError: 0.0001,
  measurementTime: 10000,
  measurementError: 0.0001,
  handoffTime: 0,
  atomSpacing: 3.0,
  maxVelocity: 0.25,
  maxAcceleration: 5000.0,
  surfaceCodeOneQubitTimeFactor: 1,
  surfaceCodeTwoQubitTimeFactor: 1,
};

const MAJORANA: MajoranaArchitecture = {
  type: "majorana",
  errorRate: 0.00001,
  operationTime: 1000,
};

/** Hand-built shapes go through `as unknown as RunConfig` on purpose. */
const valid = (config: unknown): boolean =>
  validateRunConfigSchema(config as RunConfig).valid;

function neutralAtom(overrides: Partial<NeutralAtomArchitecture> = {}): RunConfig {
  return buildRunConfig({
    architecture: { ...NEUTRAL_ATOM, ...overrides },
    qecCode: "low_move_surface_code",
    magicStateFactories: ["round_based"],
  });
}

function majorana(overrides: Partial<MajoranaArchitecture> = {}): RunConfig {
  return buildRunConfig({
    architecture: { ...MAJORANA, ...overrides },
    qecCode: "three_aux",
    magicStateFactories: ["round_based"],
  });
}

describe("v1.4.0 is additive — nothing that validated before stops validating", () => {
  it("stamps 1.4.0 and can still read every earlier version", () => {
    expect(SCHEMA_VERSION).toBe("1.4.0");
    expect(SCHEMA_VERSIONS).toContain("1.3.0");
  });

  it("accepts a config carrying none of the new fields", () => {
    // The v1.3.0 shape exactly: no optional stages, no new QPU parameters, no
    // provenance. Every one of the additions is optional or this fails.
    expect(valid(buildRunConfig({ traceTransform: DEFAULT_TRACE_TRANSFORM }))).toBe(true);
  });
});

describe("v1.4.0 — the optional trace pipeline stages", () => {
  const withTransform = (traceTransform: unknown): unknown =>
    ({ ...buildRunConfig({}), traceTransform });

  it("accepts Dynamic Memory Compute with valid parameters", () => {
    expect(
      valid(
        withTransform({
          ...DEFAULT_TRACE_TRANSFORM,
          dynamicMemoryCompute: {
            computeCapacityPercentage: 0.5,
            evictionStrategy: "least_recently_used",
          },
        }),
      ),
    ).toBe(true);
  });

  it("accepts Unmemory as a bare boolean", () => {
    expect(valid(withTransform({ ...DEFAULT_TRACE_TRANSFORM, unmemory: true }))).toBe(true);
  });

  it("rejects a compute capacity outside (0, 1]", () => {
    for (const bad of [0, -0.5, 1.01]) {
      expect(
        valid(
          withTransform({
            ...DEFAULT_TRACE_TRANSFORM,
            dynamicMemoryCompute: {
              computeCapacityPercentage: bad,
              evictionStrategy: "least_recently_used",
            },
          }),
        ),
      ).toBe(false);
    }
  });

  it("rejects an eviction strategy qdk does not have", () => {
    expect(
      valid(
        withTransform({
          ...DEFAULT_TRACE_TRANSFORM,
          dynamicMemoryCompute: {
            computeCapacityPercentage: 0.5,
            evictionStrategy: "random",
          },
        }),
      ),
    ).toBe(false);
  });

  it("rejects a half-specified Dynamic Memory Compute", () => {
    // Both parameters are required once the stage is in the pipeline: qdk would
    // otherwise silently supply its own default for the missing one, which is
    // the "absent vs defaulted" confusion this contract exists to prevent.
    expect(
      valid(
        withTransform({
          ...DEFAULT_TRACE_TRANSFORM,
          dynamicMemoryCompute: { computeCapacityPercentage: 0.5 },
        }),
      ),
    ).toBe(false);
  });
});

describe("v1.4.0 — the four new QPU parameters", () => {
  it("accepts Majorana with T error rate and target year", () => {
    expect(valid(majorana({ tErrorRate: 0.01, targetYear: 2030 }))).toBe(true);
  });

  it("accepts Majorana without them, since both are optional", () => {
    expect(valid(majorana())).toBe(true);
  });

  it("rejects a Majorana T error rate outside (0, 0.05]", () => {
    for (const bad of [0, -0.001, 0.06]) {
      expect(valid(majorana({ tErrorRate: bad }))).toBe(false);
    }
  });

  it("accepts Neutral Atom with data qubit spacing and target year", () => {
    expect(valid(neutralAtom({ dataQubitSpacing: 12.0, targetYear: 2030 }))).toBe(true);
  });

  it("rejects a non-positive data qubit spacing", () => {
    for (const bad of [0, -1]) {
      expect(valid(neutralAtom({ dataQubitSpacing: bad }))).toBe(false);
    }
  });

  it("rejects a negative or fractional target year on Neutral Atom", () => {
    expect(valid(neutralAtom({ targetYear: -1 }))).toBe(false);
    expect(valid(neutralAtom({ targetYear: 2030.5 }))).toBe(false);
  });

  it("rejects a negative or fractional target year on Majorana", () => {
    // Majorana declares its own targetYear in a separate oneOf branch, so the
    // Neutral Atom assertion above proves nothing about it — the bound has to be
    // pinned on both or one branch can lose it unnoticed.
    expect(valid(majorana({ targetYear: -1 }))).toBe(false);
    expect(valid(majorana({ targetYear: 2030.5 }))).toBe(false);
  });

  it("still rejects an unknown architecture field", () => {
    // additionalProperties:false is what makes a producer typo fail fast, and
    // adding fields is exactly when that guarantee is easiest to lose.
    expect(valid(neutralAtom({ dataQbitSpacing: 12.0 } as never))).toBe(false);
  });
});

describe("v1.4.0 — run provenance", () => {
  const withProvenance = (provenance: unknown): unknown =>
    ({ ...buildRunConfig({}), provenance });

  it("accepts a human-authored run", () => {
    expect(valid(withProvenance({ authoredBy: "human" }))).toBe(true);
  });

  it("accepts a model-assisted run naming the model", () => {
    expect(
      valid(withProvenance({ authoredBy: "model_assisted", model: "some-provider/some-model" })),
    ).toBe(true);
  });

  it("accepts a model-assisted run that does not name a model", () => {
    expect(valid(withProvenance({ authoredBy: "model_assisted" }))).toBe(true);
  });

  it("treats absent provenance as valid, meaning human-authored", () => {
    expect(valid(buildRunConfig({}))).toBe(true);
  });

  it("rejects an author the contract does not know", () => {
    expect(valid(withProvenance({ authoredBy: "agent" }))).toBe(false);
  });

  it("rejects provenance with no author", () => {
    expect(valid(withProvenance({ model: "some-provider/some-model" }))).toBe(false);
  });

  it("rejects a prompt smuggled into provenance", () => {
    // Provenance records THAT a model was involved, never WHAT was said to it.
    // The prompt is user content; the store is not where it goes.
    expect(
      valid(withProvenance({ authoredBy: "model_assisted", prompt: "shors on neutral atom" })),
    ).toBe(false);
  });
});
