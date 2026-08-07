import { describe, expect, it } from "vitest";

import {
  SCHEMA_VERSION,
  type FrontierRow,
  type MemoryOptimizationId,
  type RunConfig,
} from "../../shared/types.js";
import { configToInvocation } from "./configToInvocation.js";
import { resolvePythonBin } from "./pythonBin.js";
import { QreEngine } from "./qreEngine.js";

const PYTHON_BIN = resolvePythonBin();

let seq = 0;

function config(memoryOptimization?: MemoryOptimizationId): RunConfig {
  seq += 1;
  const base: RunConfig = {
    schemaVersion: SCHEMA_VERSION,
    id: `83000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    name: "memory optimization",
    createdAt: "2026-07-31T00:00:00Z",
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
    traceTransform: {
      tStatesPerRotation: 20,
      ccxMagicStates: false,
      slowDownFactor: 1.0,
    },
    parameters: {
      latticeN1: 3,
      latticeN2: 3,
      totalTime: 9.0,
      trotterStep: 0.9,
      couplingJ: 1.0,
      fieldG: 1.0,
    },
    maxError: 1,
    qreVersion: "qdk-qre-v1-fixture",
  };
  if (memoryOptimization !== undefined) base.memoryOptimization = memoryOptimization;
  return base;
}

/**
 * Memory Optimization is recorded on the config, REACHES the estimator as of
 * week 5, and still does not move an estimate.
 *
 * The yoked codes are ISATransforms that PROVIDE a MEMORY instruction. MEMORY
 * demand comes only from READ_FROM_MEMORY / WRITE_TO_MEMORY trace gates, which
 * are emitted by the DynamicMemoryCompute trace transform or by LogicalCounts
 * keys the contract does not carry (numComputeQubits, readFromMemoryCount,
 * writeToMemoryCount).
 *
 * ## What changed in week 5, and why the old result was not evidence
 *
 * Until now `memoryOptimization` appeared in NO engine file — not
 * configToInvocation.ts, not invocation.ts, not estimate.py — and this file
 * asserted exactly that. So the "identical estimates" result on record was not
 * evidence that the yoked codes do nothing; it was evidence that they were
 * never sent. Anyone who enabled DynamicMemoryCompute, re-ran the comparison
 * and saw no change would have confirmed the wrong conclusion with real numbers
 * behind it.
 *
 * §G wired the field through (QreInvocation -> configToInvocation ->
 * build_isa_query, layered as `query * TwoDimensionalYokedSurfaceCode.q()`) and
 * only THEN measured.
 *
 * ## The measurement — qdk 1.30.0, Ising Model (2D) 3x3, 2026-08-06
 *
 * | Pipeline                       | Physical qubits | Runtime (ns) |
 * |--------------------------------|-----------------|--------------|
 * | PSSPC x LatticeSurgery         | 477             | 1,363,950    |
 * | + yoked_2d                     | 477             | 1,363,950    |
 * | DMC x PSSPC x LatticeSurgery   | 256             | 1,852,200    |
 * | + yoked_2d                     | 256             | 1,852,200    |
 *
 * Dynamic Memory Compute moves the estimate; the yoked code does not move it,
 * with or without DMC.
 *
 * ## ⚠️ What this file does NOT establish — §G's remaining step
 *
 * An unchanged estimate has TWO explanations, and nothing here separates them:
 *
 *   1. The yoked codes are inert on this workload — the conclusion we want.
 *   2. `query * YokedSurfaceCode.q()` does not put them anywhere qdk applies.
 *      `build_qec` has already fixed the code by the time the yoked transform is
 *      multiplied in after the factories, so (2) is not a remote possibility.
 *
 * The assertions below prove the id reaches the invocation JSON. They do NOT
 * prove it reaches the ISA qdk executes, which is what §G's "prove it is
 * actually in the query" asks for — and a null result cannot substitute, because
 * (2) predicts the same null. Nor can the source graph settle it: an applied-
 * but-unused ISATransform legitimately contributes no node.
 *
 * So the claim this file supports is "consistent with inert", not "measured, not
 * assumed". The control stays disabled either way — a control that changes
 * nothing is worse than one that says why — but the wording in the UI, in
 * features-and-fields.md and in the checklist says "consistent with" until
 * someone introspects the query object on a machine with the qdk venv.
 */
/**
 * The frontier with `evaluationTime` dropped. That field is how long the
 * estimator itself took — wall-clock instrumentation, not a resource estimate —
 * so it varies run to run and is never evidence of a configuration change.
 */
function resources(result: { frontier: FrontierRow[] | null }): unknown {
  return result.frontier?.map((row) => {
    const additional = { ...row.additional };
    delete additional["evaluationTime"];
    return { ...row, additional };
  });
}

/** The same config with Dynamic Memory Compute (stage 0) switched on. */
function withDynamicMemoryCompute(base: RunConfig): RunConfig {
  return {
    ...base,
    traceTransform: {
      ...base.traceTransform,
      dynamicMemoryCompute: {
        computeCapacityPercentage: 0.5,
        evictionStrategy: "least_recently_used",
      },
    },
  };
}

describe("Memory Optimization reaches the estimator", () => {
  // INVERTED in week 5, deliberately, in the same change that wired the field.
  // Leaving the old `not.toContain` green while the field now reaches the
  // engine would mean the suite was lying in the other direction.
  it("is present in the engine invocation when one is selected", () => {
    const result = configToInvocation(config("yoked_2d"), 30_000);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.keys(result.invocation)).toContain("memoryOptimization");
      expect(result.invocation.memoryOptimization).toBe("yoked_2d");
    }
  });

  it("is omitted when none is selected", () => {
    const result = configToInvocation(config(), 30_000);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.keys(result.invocation)).not.toContain("memoryOptimization");
    }
  });

  // "none" is a contract value the analyst can hold, but it is not something to
  // send: an unselected optimization stays ABSENT all the way to Python, the
  // same rule the optional trace stages follow.
  it('omits the key for an explicit "none" rather than forwarding it', () => {
    const result = configToInvocation(config("none"), 30_000);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.keys(result.invocation)).not.toContain("memoryOptimization");
    }
  });
});

// NOT "is inert — measured, not assumed". These tests establish that the
// estimate does not move; see the header for why that is consistent with
// inertness rather than proof of it.
describe("Memory Optimization leaves the estimate unchanged", () => {
  it("produces an identical estimate whether set or not", async () => {
    const engine = new QreEngine(PYTHON_BIN);
    const plain = await engine.run(config());
    const yoked = await engine.run(config("yoked_2d"));

    expect(plain.status).toBe("succeeded");
    expect(yoked.status).toBe("succeeded");
    expect(resources(yoked)).toEqual(resources(plain));
  }, 120_000);

  it("gives 1D and 2D yoked the same estimate as each other", async () => {
    const engine = new QreEngine(PYTHON_BIN);
    const oneD = await engine.run(config("yoked_1d"));
    const twoD = await engine.run(config("yoked_2d"));

    expect(resources(oneD)).toEqual(resources(twoD));
  }, 120_000);

  /**
   * THE test this file exists for. Dynamic Memory Compute is what emits the
   * READ_FROM_MEMORY / WRITE_TO_MEMORY demand the yoked codes supply, so this
   * is the only configuration in which "no change" carries any information at
   * all — and even here it only narrows the answer, it does not settle it
   * (header, "What this file does NOT establish").
   *
   * Measured on qdk 1.30.0: DMC alone moves Ising Model (2D) 3x3 from
   * 477 qubits / 1,363,950 ns to 256 / 1,852,200; adding the yoked code on top
   * leaves it at 256 / 1,852,200.
   */
  it("does not move the estimate even with Dynamic Memory Compute supplying MEMORY demand", async () => {
    const engine = new QreEngine(PYTHON_BIN);
    const dmcOnly = await engine.run(withDynamicMemoryCompute(config()));
    const dmcYoked = await engine.run(withDynamicMemoryCompute(config("yoked_2d")));

    expect(dmcOnly.status).toBe("succeeded");
    expect(dmcYoked.status).toBe("succeeded");
    expect(resources(dmcYoked)).toEqual(resources(dmcOnly));

    // And guard the premise: if DMC ever stops moving the estimate, the
    // comparison above becomes vacuous and this test should fail loudly rather
    // than keep reporting "inert".
    const plain = await engine.run(config());
    expect(resources(dmcOnly)).not.toEqual(resources(plain));
  }, 240_000);
});
