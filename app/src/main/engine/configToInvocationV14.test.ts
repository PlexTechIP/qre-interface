/**
 * Main-process re-validation of the four QPU parameters v1.4.0 added.
 *
 * `configToInvocation` re-checks every architecture field independently of the
 * renderer's Ajv pass — that redundancy is deliberate, because a RunConfig can
 * reach the engine over IPC without ever passing through our form (a Rerun of a
 * hand-edited record, or a model-drafted config). The v1.4.0 fields were the
 * only architecture parameters relying on the schema alone; these pin them to
 * the same standard as their siblings.
 */

import { describe, expect, it } from "vitest";

import {
  SCHEMA_VERSION,
  type MajoranaArchitecture,
  type NeutralAtomArchitecture,
  type RunConfig,
} from "../../shared/types.js";
import { DEFAULT_TRACE_TRANSFORM } from "../../shared/traceTransform.js";
import { configToInvocation } from "./configToInvocation.js";

const MAJORANA: MajoranaArchitecture = {
  type: "majorana",
  errorRate: 0.00001,
  operationTime: 1000,
};

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

function config(
  architecture: RunConfig["architecture"],
  qecCode: RunConfig["qecCode"],
): RunConfig {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: "9a000000-0000-4000-8000-000000000001",
    name: "v1.4.0 arch validation",
    createdAt: "2026-07-31T00:00:00.000Z",
    application: { type: "benchmark", benchmarkId: "quantum-dynamics" },
    architecture,
    qecCode,
    magicStateFactories: ["round_based"],
    traceTransform: { ...DEFAULT_TRACE_TRANSFORM },
    maxError: 1,
    qreVersion: "qdk-qre-v1-fixture",
  };
}

const majorana = (overrides: Partial<MajoranaArchitecture>): RunConfig =>
  config({ ...MAJORANA, ...overrides }, "three_aux");

const neutralAtom = (overrides: Partial<NeutralAtomArchitecture>): RunConfig =>
  config({ ...NEUTRAL_ATOM, ...overrides }, "low_move_surface_code");

function rejects(cfg: RunConfig, fieldName: string): void {
  const result = configToInvocation(cfg, 30_000);
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error.code).toBe("INVALID_CONFIG");
    // Name the field, so the analyst is told what to fix rather than handed a
    // raw qdk diagnostic from three layers down.
    expect(result.error.message).toContain(fieldName);
  }
}

describe("Majorana tErrorRate is re-validated in the main process", () => {
  it("accepts an absent tErrorRate, since qdk derives it", () => {
    expect(configToInvocation(majorana({}), 30_000).ok).toBe(true);
  });

  it("accepts a value inside (0, 0.05]", () => {
    expect(configToInvocation(majorana({ tErrorRate: 0.05 }), 30_000).ok).toBe(true);
  });

  it("rejects zero, negative, and above-0.05 values", () => {
    for (const bad of [0, -0.01, 0.06]) {
      rejects(majorana({ tErrorRate: bad }), "tErrorRate");
    }
  });
});

describe("targetYear is re-validated on both architectures", () => {
  it("accepts an absent or non-negative integer target year", () => {
    expect(configToInvocation(majorana({}), 30_000).ok).toBe(true);
    expect(configToInvocation(majorana({ targetYear: 0 }), 30_000).ok).toBe(true);
    expect(configToInvocation(neutralAtom({ targetYear: 2030 }), 30_000).ok).toBe(true);
  });

  it("rejects a negative or fractional target year on Majorana", () => {
    rejects(majorana({ targetYear: -1 }), "targetYear");
    rejects(majorana({ targetYear: 2030.5 }), "targetYear");
  });

  it("rejects a negative or fractional target year on Neutral Atom", () => {
    rejects(neutralAtom({ targetYear: -1 }), "targetYear");
    rejects(neutralAtom({ targetYear: 2030.5 }), "targetYear");
  });
});

describe("Neutral Atom dataQubitSpacing is re-validated in the main process", () => {
  it("accepts an absent spacing, so qdk applies its own default", () => {
    expect(configToInvocation(neutralAtom({}), 30_000).ok).toBe(true);
  });

  it("accepts a positive spacing", () => {
    expect(configToInvocation(neutralAtom({ dataQubitSpacing: 12.0 }), 30_000).ok).toBe(
      true,
    );
  });

  it("rejects a zero or negative spacing", () => {
    for (const bad of [0, -1]) {
      rejects(neutralAtom({ dataQubitSpacing: bad }), "dataQubitSpacing");
    }
  });
});

/**
 * `memoryOptimization` is week-5 work rather than v1.4.0, but it belongs in this
 * file because it is the same defect class the file exists for: a contract enum
 * that only the renderer's Ajv pass was checking. It reaches the engine over
 * IPC, and `resolve_yoked_code` in `estimate.py` raises a plain `ValueError` for
 * an id it does not know — which `failure_code_for` reports as
 * ESTIMATION_FAILED. That tells the analyst their model was infeasible when in
 * fact one field is wrong, so the refusal belongs here instead.
 *
 * The casts are the point: these configs are exactly the ones TypeScript cannot
 * produce, which is why only a runtime check catches them.
 */
describe("memoryOptimization is re-validated in the main process", () => {
  const withMemoryOptimization = (value: unknown): RunConfig =>
    ({ ...majorana({}), memoryOptimization: value }) as RunConfig;

  it("accepts an absent value and every contract id", () => {
    expect(configToInvocation(majorana({}), 30_000).ok).toBe(true);
    for (const id of ["none", "yoked_1d", "yoked_2d"]) {
      expect(configToInvocation(withMemoryOptimization(id), 30_000).ok).toBe(true);
    }
  });

  it("rejects an id outside the contract enum", () => {
    rejects(withMemoryOptimization("yoked_3d"), "memoryOptimization");
  });

  it("names the value it refused, not just the field", () => {
    const result = configToInvocation(withMemoryOptimization("YOKED_2D"), 30_000);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('"YOKED_2D"');
  });

  it('still omits the key for "none" rather than forwarding it', () => {
    const result = configToInvocation(withMemoryOptimization("none"), 30_000);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.keys(result.invocation)).not.toContain("memoryOptimization");
    }
  });
});
