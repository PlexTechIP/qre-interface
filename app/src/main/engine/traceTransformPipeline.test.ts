import { describe, expect, it } from "vitest";

import { type RunConfig, type TraceTransform } from "../../shared/types.js";
import { buildSmallDynamicsConfig } from "../../shared/testing/builders.js";
import { resolvePythonBin } from "./pythonBin.js";
import { QreEngine } from "./qreEngine.js";

const PYTHON_BIN = resolvePythonBin();

/** Quantum Dynamics on a small lattice, so the run is about the transform. */
const config = (traceTransform: TraceTransform): RunConfig =>
  buildSmallDynamicsConfig({ traceTransform });

async function runtimeFor(traceTransform: TraceTransform): Promise<number> {
  const result = await new QreEngine(PYTHON_BIN).run(config(traceTransform));
  expect(result.error).toBeNull();
  expect(result.status).toBe("succeeded");
  return result.frontier![0]!.runtime.value;
}

describe("the trace pipeline's parameters reach the estimator", () => {
  it("changes the estimate when PSSPC's T states per rotation change", async () => {
    // The stage-1 knob. If a refactor drops it, both runs return the same
    // number and this fails — which is what the old union-shaped config did to
    // these values whenever the discriminant said latticeSurgery.
    //
    // 10 rather than the contract minimum of 5: a sparse 5 T-states-per-rotation
    // synthesis has no feasible Pareto point on qdk 1.30.0 (see
    // docs/week-4/team-3/qdk-1.30.0-validation.md), so it cannot serve as the
    // low end of a comparison.
    const sparse = await runtimeFor({
      tStatesPerRotation: 10,
      ccxMagicStates: false,
      slowDownFactor: 1.0,
    });
    const dense = await runtimeFor({
      tStatesPerRotation: 20,
      ccxMagicStates: false,
      slowDownFactor: 1.0,
    });

    expect(sparse).not.toBe(dense);
  }, 120_000);

  it("runs both stages: an estimate exists at all", async () => {
    // PSSPC alone yields an empty frontier on qdk 1.30.0 and the reverse order
    // raises "unsupported instruction LATTICE_SURGERY in trace transformation
    // 'PSSPC'". A succeeded run with a frontier row is the evidence that
    // build_trace_query still composes PSSPC * LatticeSurgery in that order.
    const runtime = await runtimeFor({
      tStatesPerRotation: 20,
      ccxMagicStates: false,
      slowDownFactor: 1.0,
    });

    expect(runtime).toBeGreaterThan(0);
  }, 120_000);

  it("still estimates a v1.1.0 record's trace transform after the bump", async () => {
    // History and Rerun feed stored configs straight back through the engine.
    // Records are validated on save only, so a v1.1.0 record outlives the
    // contract bump and must keep running.
    const legacy = {
      ...config({ tStatesPerRotation: 20, ccxMagicStates: false, slowDownFactor: 1.0 }),
      schemaVersion: "1.1.0",
      traceTransform: { type: "psspc", tStatesPerRotation: 12, ccxMagicStates: false },
    } as unknown as RunConfig;

    const result = await new QreEngine(PYTHON_BIN).run(legacy);

    expect(result.error).toBeNull();
    expect(result.status).toBe("succeeded");
  }, 120_000);
});
