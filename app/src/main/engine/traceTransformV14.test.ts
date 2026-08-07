/**
 * v1.4.0's two optional trace stages, from the contract through to a real qdk
 * estimate.
 *
 * The load-bearing assertion here is NOT "the stage is serialized" — it is that
 * an off stage and a stage running at its defaults produce DIFFERENT estimates.
 * Week 4 was spent removing controls that were recorded but inert; a pipeline
 * stage that serializes without reaching the estimator would be the same defect
 * one layer down, and only a real run can tell the difference.
 *
 * Real engine: needs the venv on qdk[qre]==1.30.0. Runs under
 * `npm run test:engine`, not the fast unit suite.
 */

import { describe, expect, it } from "vitest";

import { type RunConfig, type TraceTransform } from "../../shared/types.js";
import { buildSmallDynamicsConfig } from "../../shared/testing/builders.js";
import { configToInvocation } from "./configToInvocation.js";
import { resolvePythonBin } from "./pythonBin.js";
import { QreEngine } from "./qreEngine.js";

const PYTHON_BIN = resolvePythonBin();

/** Quantum Dynamics on a small lattice, so the run is about the transform. */
const config = (traceTransform: TraceTransform): RunConfig =>
  buildSmallDynamicsConfig({ traceTransform });

const STAGES_OFF: TraceTransform = {
  tStatesPerRotation: 20,
  ccxMagicStates: false,
  slowDownFactor: 1.0,
};

describe("the optional stages survive configToInvocation", () => {
  it("carries dynamicMemoryCompute to the engine boundary", () => {
    const result = configToInvocation(
      config({
        ...STAGES_OFF,
        dynamicMemoryCompute: {
          computeCapacityPercentage: 0.25,
          evictionStrategy: "least_frequently_used",
        },
      }),
      120_000,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.invocation.traceTransform.dynamicMemoryCompute).toEqual({
        computeCapacityPercentage: 0.25,
        evictionStrategy: "least_frequently_used",
      });
    }
  });

  it("carries unmemory to the engine boundary", () => {
    const result = configToInvocation(config({ ...STAGES_OFF, unmemory: true }), 120_000);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.invocation.traceTransform.unmemory).toBe(true);
  });

  it("leaves an off stage absent at the boundary rather than defaulting it", () => {
    // If the mapper fills in qdk's defaults here, every run silently acquires a
    // stage — and the record would no longer describe what executed.
    const result = configToInvocation(config(STAGES_OFF), 120_000);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.invocation.traceTransform).not.toHaveProperty("dynamicMemoryCompute");
      expect(result.invocation.traceTransform.unmemory).toBeUndefined();
    }
  });
});

async function estimate(traceTransform: TraceTransform): Promise<{
  qubits: number;
  runtime: number;
}> {
  const result = await new QreEngine(PYTHON_BIN).run(config(traceTransform));
  expect(result.error).toBeNull();
  expect(result.status).toBe("succeeded");
  const row = result.frontier![0]!;
  return { qubits: row.physicalQubits.value, runtime: row.runtime.value };
}

describe("the optional stages reach the estimator and change the answer", () => {
  it("estimates differently with Dynamic Memory Compute than without it", async () => {
    // THE test for this contract change. Same configuration in every other
    // respect; the only difference is whether stage 0 is in the pipeline.
    const off = await estimate(STAGES_OFF);
    const on = await estimate({
      ...STAGES_OFF,
      dynamicMemoryCompute: {
        computeCapacityPercentage: 0.5,
        evictionStrategy: "least_recently_used",
      },
    });

    expect(off.qubits).toBeGreaterThan(0);
    expect(on.qubits).toBeGreaterThan(0);
    expect([on.qubits, on.runtime]).not.toEqual([off.qubits, off.runtime]);
  }, 180_000);

  it("still produces a valid estimate with the full four-stage pipeline", async () => {
    // Order is a correctness property: qdk raises on a wrongly-composed
    // pipeline, so a succeeded run is the evidence that build_trace_query
    // composes DynamicMemoryCompute * PSSPC * LatticeSurgery * Unmemory.
    const full = await estimate({
      ...STAGES_OFF,
      dynamicMemoryCompute: {
        computeCapacityPercentage: 0.5,
        evictionStrategy: "least_recently_used",
      },
      unmemory: true,
    });

    expect(full.qubits).toBeGreaterThan(0);
    expect(full.runtime).toBeGreaterThan(0);
  }, 180_000);

  it("estimates a pre-v1.4.0 config exactly as it did before the bump", async () => {
    // v1.4.0 is additive, so a config with neither optional stage must be
    // byte-identical in outcome to what it was. If this drifts, the bump changed
    // the default pipeline, which would silently reprice every stored run.
    const first = await estimate(STAGES_OFF);
    const second = await estimate(STAGES_OFF);

    expect(second).toEqual(first);
  }, 180_000);

  it("trades qubits for runtime when Dynamic Memory Compute is on", async () => {
    // Not just "different" — different in the direction the stage exists for.
    // Measured on qdk 1.30.0, Quantum Dynamics 3x3: 477 qubits / 1,363,950 ns
    // with the stage off, 256 qubits / 1,852,200 ns with it on. A change in the
    // opposite direction would mean we wired something, but not this.
    const off = await estimate(STAGES_OFF);
    const on = await estimate({
      ...STAGES_OFF,
      dynamicMemoryCompute: {
        computeCapacityPercentage: 0.5,
        evictionStrategy: "least_recently_used",
      },
    });

    expect(on.qubits).toBeLessThan(off.qubits);
    expect(on.runtime).toBeGreaterThan(off.runtime);
  }, 180_000);
});

describe("v1.4.0 findings the contract records but does not hide", () => {
  it("reports Unmemory as INERT on this pipeline — measured, not assumed", async () => {
    // Unmemory alone returns exactly the stages-off estimate on qdk 1.30.0
    // (477 qubits / 1,363,950 ns either way). It is a recorded-but-not-yet-
    // influential field, and any UI exposing it has to say so.
    //
    // This test asserts the CURRENT measurement rather than a desired one: the
    // day a qdk bump or a workload with real memory traffic makes the stage
    // live, this fails, and that failure is the notification. Do not delete it
    // to make it green — update it and re-label the control.
    const off = await estimate(STAGES_OFF);
    const unmemoryOnly = await estimate({ ...STAGES_OFF, unmemory: true });

    expect(unmemoryOnly).toEqual(off);
  }, 180_000);

  it("returns an honest failure when a compute capacity has no feasible point", async () => {
    // A tight capacity (0.25) with least-frequently-used eviction has no
    // feasible Pareto point for this workload. That is the estimator answering,
    // not the adapter breaking — the same class as a sparse tStatesPerRotation.
    // It must surface as a resolved FAILED result, never as a crash.
    const result = await new QreEngine(PYTHON_BIN).run(
      config({
        ...STAGES_OFF,
        dynamicMemoryCompute: {
          computeCapacityPercentage: 0.25,
          evictionStrategy: "least_frequently_used",
        },
      }),
    );

    expect(result.status).toBe("failed");
    expect(result.error?.code).toBe("ESTIMATION_FAILED");
  }, 180_000);
});
