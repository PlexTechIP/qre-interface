import { describe, expect, it } from "vitest";

import {
  DEFAULT_TRACE_TRANSFORM,
  describeTraceTransform,
  normalizeTraceTransform,
  parseTraceTransform,
} from "./traceTransform";
import { SCHEMA_VERSION } from "./types";
import type { RunConfig } from "./types";

describe("the trace transform is a pipeline, not a choice", () => {
  it("carries both stages' parameters in one object", () => {
    // PSSPC lowers rotations and CCX to Pauli-based operations; Lattice Surgery
    // maps those onto lattice-surgery instructions. Verified against qdk 1.30.0:
    // PSSPC.q() alone yields an empty frontier, and reversing the order raises
    // "unsupported instruction LATTICE_SURGERY in trace transformation 'PSSPC'".
    // Every estimate runs both, so the config records both.
    expect(DEFAULT_TRACE_TRANSFORM).toEqual({
      tStatesPerRotation: 20,
      ccxMagicStates: false,
      slowDownFactor: 1.0,
    });
  });
});

describe("normalizeTraceTransform", () => {
  it("passes a pipeline object through unchanged", () => {
    const pipeline = {
      tStatesPerRotation: 12,
      ccxMagicStates: true,
      slowDownFactor: 1.0 as const,
    };
    expect(normalizeTraceTransform(pipeline)).toEqual(pipeline);
  });

  it("upgrades a v1.1.0 psspc record, keeping the values the analyst chose", () => {
    // NOTE: the argument is deliberately the OLD union shape. This is the read
    // path for records already on disk; do not "modernize" these fixtures.
    expect(
      normalizeTraceTransform({
        type: "psspc",
        tStatesPerRotation: 7,
        ccxMagicStates: true,
      }),
    ).toEqual({
      tStatesPerRotation: 7,
      ccxMagicStates: true,
      slowDownFactor: 1.0,
    });
  });

  it("upgrades a v1.1.0 latticeSurgery record to the defaults it actually ran", () => {
    // Also the OLD union shape, on purpose. The old latticeSurgery branch made
    // the engine call PSSPC.q() with no arguments, so a record in that shape ran
    // the PSSPC defaults whatever the form had shown. Normalizing to those
    // defaults reports what happened.
    expect(
      normalizeTraceTransform({ type: "latticeSurgery", slowDownFactor: 1.0 }),
    ).toEqual({
      tStatesPerRotation: 20,
      ccxMagicStates: false,
      slowDownFactor: 1.0,
    });
  });

  it("falls back to the defaults for an unrecognised shape", () => {
    expect(normalizeTraceTransform(undefined)).toEqual(DEFAULT_TRACE_TRANSFORM);
    expect(normalizeTraceTransform({})).toEqual(DEFAULT_TRACE_TRANSFORM);
    expect(normalizeTraceTransform(null)).toEqual(DEFAULT_TRACE_TRANSFORM);
  });
});

describe("describeTraceTransform", () => {
  it("names both stages, so no reader takes it for a single selection", () => {
    expect(
      describeTraceTransform({
        tStatesPerRotation: 20,
        ccxMagicStates: false,
        slowDownFactor: 1.0,
      }),
    ).toBe("PSSPC → Lattice Surgery · 20 T/rotation · slowdown 1");
  });

  it("surfaces CCX magic states when they are on", () => {
    expect(
      describeTraceTransform({
        tStatesPerRotation: 15,
        ccxMagicStates: true,
        slowDownFactor: 1.0,
      }),
    ).toBe("PSSPC → Lattice Surgery · 15 T/rotation · CCX magic states · slowdown 1");
  });
});

describe("the JSON Schema follows the types", () => {
  it("accepts a pipeline-shaped config and rejects the v1.1.0 union", async () => {
    const { validateRunConfigSchema } = await import(
      "../renderer/state/schemaValidation"
    );
    const base = {
      schemaVersion: SCHEMA_VERSION,
      id: "00000000-0000-4000-8000-000000000000",
      name: "schema probe",
      createdAt: "2026-07-31T00:00:00.000Z",
      application: { type: "benchmark", benchmarkId: "quantum-dynamics" },
      architecture: {
        type: "gateBased",
        errorRate: 0.0001,
        gateTime: 50,
        measurementTime: 100,
        twoQubitGateTime: null,
      },
      qecCode: "surface_code",
      magicStateFactories: ["round_based"],
      maxError: 1,
      qreVersion: "qdk-qre-v1-fixture",
    };

    // Cast because these literals are deliberately shaped by hand: one is the
    // current contract, the other is the retired v1.1.0 union.
    expect(
      validateRunConfigSchema({
        ...base,
        traceTransform: DEFAULT_TRACE_TRANSFORM,
      } as unknown as RunConfig).valid,
    ).toBe(true);

    // The union is no longer a valid shape to WRITE. Stored records keep
    // rendering through normalizeTraceTransform; they are never re-validated,
    // because records are immutable and validated on save only.
    expect(
      validateRunConfigSchema({
        ...base,
        traceTransform: { type: "psspc", tStatesPerRotation: 20, ccxMagicStates: false },
      } as unknown as RunConfig).valid,
    ).toBe(false);
  });
});


describe("parseTraceTransform is strict, because it gates execution", () => {
  it("accepts a well-formed pipeline object and keeps its slowDownFactor", () => {
    expect(
      parseTraceTransform({
        tStatesPerRotation: 12,
        ccxMagicStates: true,
        slowDownFactor: 1.0,
      }),
    ).toEqual({
      ok: true,
      transform: { tStatesPerRotation: 12, ccxMagicStates: true, slowDownFactor: 1.0 },
    });
  });

  it("rejects a slowDownFactor the contract does not allow", () => {
    // Never silently rewrite it: qdk honours slow_down_factor, so a rewritten
    // 2.0 means the record and the estimate describe different runs.
    const result = parseTraceTransform({
      tStatesPerRotation: 20,
      ccxMagicStates: false,
      slowDownFactor: 2.0,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("slowDownFactor");
  });

  it("rejects missing or wrong-typed fields rather than repairing them", () => {
    for (const bad of [
      undefined,
      null,
      {},
      [],
      "psspc",
      { tStatesPerRotation: 20, ccxMagicStates: false },
      { tStatesPerRotation: "20", ccxMagicStates: false, slowDownFactor: 1.0 },
      { tStatesPerRotation: 20, ccxMagicStates: "no", slowDownFactor: 1.0 },
      { type: "somethingElse", tStatesPerRotation: 20 },
    ]) {
      expect(parseTraceTransform(bad).ok).toBe(false);
    }
  });

  it("accepts a well-formed v1.1.0 psspc record", () => {
    expect(
      parseTraceTransform({ type: "psspc", tStatesPerRotation: 7, ccxMagicStates: true }),
    ).toEqual({
      ok: true,
      transform: { tStatesPerRotation: 7, ccxMagicStates: true, slowDownFactor: 1.0 },
    });
  });

  it("rejects a MALFORMED v1.1.0 psspc record", () => {
    // Previously copied straight through, yielding tStatesPerRotation:
    // undefined typed as number and "undefined T/rotation" in History.
    expect(parseTraceTransform({ type: "psspc" }).ok).toBe(false);
    expect(
      parseTraceTransform({ type: "psspc", tStatesPerRotation: null, ccxMagicStates: false })
        .ok,
    ).toBe(false);
  });

  it("accepts a well-formed v1.1.0 latticeSurgery record", () => {
    expect(
      parseTraceTransform({ type: "latticeSurgery", slowDownFactor: 1.0 }),
    ).toEqual({ ok: true, transform: DEFAULT_TRACE_TRANSFORM });
  });
});

describe("normalizeTraceTransform stays lenient, because it gates display", () => {
  it("falls back to defaults for anything parse rejects", () => {
    // History and Comparison must render SOMETHING for a corrupt record; the
    // engine is what refuses to run it.
    expect(normalizeTraceTransform({ type: "psspc" })).toEqual(DEFAULT_TRACE_TRANSFORM);
    expect(describeTraceTransform(normalizeTraceTransform({ type: "psspc" }))).not.toContain(
      "undefined",
    );
  });
});

// ---------------------------------------------------------------------------
// v1.4.0 — the two optional pipeline stages
// ---------------------------------------------------------------------------

const BOTH_STAGES_OFF = {
  tStatesPerRotation: 20,
  ccxMagicStates: false,
  slowDownFactor: 1.0 as const,
};

describe("v1.4.0 optional stages: an OFF stage is absent, not defaulted", () => {
  it("leaves dynamicMemoryCompute absent when the stage is off", () => {
    // THE load-bearing invariant of this contract change. A stage running at its
    // defaults is a DIFFERENT pipeline from a stage that is not in it:
    //   off -> PSSPC * LatticeSurgery
    //   on  -> DynamicMemoryCompute(0.5, LRU) * PSSPC * LatticeSurgery
    // If parse ever "helpfully" fills in the defaults, every estimate silently
    // acquires a stage the analyst never selected.
    const parsed = parseTraceTransform(BOTH_STAGES_OFF);

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.transform).not.toHaveProperty("dynamicMemoryCompute");
    }
  });

  it("carries dynamicMemoryCompute through when the stage is on", () => {
    expect(
      parseTraceTransform({
        ...BOTH_STAGES_OFF,
        dynamicMemoryCompute: {
          computeCapacityPercentage: 0.5,
          evictionStrategy: "least_recently_used",
        },
      }),
    ).toEqual({
      ok: true,
      transform: {
        ...BOTH_STAGES_OFF,
        dynamicMemoryCompute: {
          computeCapacityPercentage: 0.5,
          evictionStrategy: "least_recently_used",
        },
      },
    });
  });

  it("treats an absent unmemory as off rather than inventing a value", () => {
    const parsed = parseTraceTransform(BOTH_STAGES_OFF);

    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.transform.unmemory ?? false).toBe(false);
  });

  it("carries unmemory through when it is on", () => {
    expect(parseTraceTransform({ ...BOTH_STAGES_OFF, unmemory: true })).toEqual({
      ok: true,
      transform: { ...BOTH_STAGES_OFF, unmemory: true },
    });
  });
});

describe("v1.4.0 optional stages are validated, not repaired", () => {
  it("rejects a compute capacity outside (0, 1]", () => {
    // qdk's compute_capacity_percentage is a fraction. 0 and negatives are
    // meaningless; above 1 is not a percentage of anything.
    for (const bad of [0, -0.1, 1.5, Number.NaN]) {
      const result = parseTraceTransform({
        ...BOTH_STAGES_OFF,
        dynamicMemoryCompute: {
          computeCapacityPercentage: bad,
          evictionStrategy: "least_recently_used",
        },
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toContain("computeCapacityPercentage");
    }
  });

  it("accepts a compute capacity of exactly 1", () => {
    // The interval is half-open at zero and CLOSED at one: dedicating the whole
    // capacity to compute is a legitimate configuration.
    expect(
      parseTraceTransform({
        ...BOTH_STAGES_OFF,
        dynamicMemoryCompute: {
          computeCapacityPercentage: 1,
          evictionStrategy: "first_available",
        },
      }).ok,
    ).toBe(true);
  });

  it("rejects an eviction strategy qdk does not have", () => {
    const result = parseTraceTransform({
      ...BOTH_STAGES_OFF,
      dynamicMemoryCompute: {
        computeCapacityPercentage: 0.5,
        evictionStrategy: "least_recently_evicted",
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("evictionStrategy");
  });

  it("rejects a malformed dynamicMemoryCompute rather than dropping the stage", () => {
    // Dropping it would run a different pipeline than the record describes —
    // the same class of bug as rewriting slowDownFactor.
    for (const bad of [null, "on", 1, {}, { computeCapacityPercentage: 0.5 }]) {
      expect(
        parseTraceTransform({ ...BOTH_STAGES_OFF, dynamicMemoryCompute: bad }).ok,
      ).toBe(false);
    }
  });

  it("rejects a non-boolean unmemory", () => {
    for (const bad of ["true", 1, null]) {
      const result = parseTraceTransform({ ...BOTH_STAGES_OFF, unmemory: bad });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toContain("unmemory");
    }
  });
});

describe("v1.4.0 stages on a legacy union record are a contradiction", () => {
  // A record carrying the v1.1.0 `type` discriminant predates v1.4.0 by
  // definition, so a v1.4.0 stage field on it means the record was hand-edited
  // or produced by something that mixed two contract shapes. The strict parser
  // rejects rather than repairs — silently dropping the stage would run a
  // different pipeline than the record describes, which is the exact failure
  // `slowDownFactor` is checked rather than rewritten to avoid.
  const stage = {
    computeCapacityPercentage: 0.5,
    evictionStrategy: "least_recently_used",
  };

  it("rejects a latticeSurgery record carrying an optional stage", () => {
    const result = parseTraceTransform({
      type: "latticeSurgery",
      slowDownFactor: 1.0,
      dynamicMemoryCompute: stage,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a psspc record carrying an optional stage", () => {
    // Symmetry matters: previously this branch silently KEPT the stage while
    // the latticeSurgery branch silently dropped it. Same input class, two
    // different repairs.
    const result = parseTraceTransform({
      type: "psspc",
      tStatesPerRotation: 12,
      ccxMagicStates: false,
      unmemory: true,
    });
    expect(result.ok).toBe(false);
  });

  it("still accepts a clean legacy record with no v1.4.0 fields", () => {
    expect(
      parseTraceTransform({ type: "psspc", tStatesPerRotation: 12, ccxMagicStates: false })
        .ok,
    ).toBe(true);
    expect(parseTraceTransform({ type: "latticeSurgery", slowDownFactor: 1.0 }).ok).toBe(
      true,
    );
  });
});

describe("unmemory has exactly one representation of off", () => {
  it("normalizes an explicit false to absent", () => {
    // Two configs that differ only by `unmemory: false` vs the key being absent
    // describe the same run and must not compare unequal downstream.
    const parsed = parseTraceTransform({ ...BOTH_STAGES_OFF, unmemory: false });

    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.transform).not.toHaveProperty("unmemory");
  });

  it("still keeps an explicit true", () => {
    const parsed = parseTraceTransform({ ...BOTH_STAGES_OFF, unmemory: true });

    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.transform.unmemory).toBe(true);
  });
});

describe("describeTraceTransform names the stages that actually run", () => {
  it("names only the two mandatory stages when both optionals are off", () => {
    expect(describeTraceTransform(DEFAULT_TRACE_TRANSFORM)).toContain(
      "PSSPC → Lattice Surgery",
    );
  });

  it("names the full four-stage pipeline, in execution order", () => {
    // Order is a correctness property of the pipeline, not a presentation
    // choice, so the summary a user reads states the real order.
    expect(
      describeTraceTransform({
        ...BOTH_STAGES_OFF,
        dynamicMemoryCompute: {
          computeCapacityPercentage: 0.5,
          evictionStrategy: "least_recently_used",
        },
        unmemory: true,
      }),
    ).toContain("Dynamic Memory Compute → PSSPC → Lattice Surgery → Unmemory");
  });
});
