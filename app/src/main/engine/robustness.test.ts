import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { QreEngine } from "./qreEngine.js";
import type { RunConfig } from "../../shared/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PYTHON_BIN = path.join(__dirname, "python", ".venv", "bin", "python3");

function config(id: string, benchmarkId: string): RunConfig {
  return {
    schemaVersion: "1.0.0",
    id,
    name: "robustness test",
    createdAt: "2026-07-09T18:22:00Z",
    application: { type: "benchmark", benchmarkId },
    architecture: { type: "gateBased", errorRate: 0.0001, gateTime: 50, measurementTime: 100, twoQubitGateTime: null },
    qecCode: "surface_code",
    magicStateFactory: "round_based",
    traceTransform: { type: "psspc", tStatesPerRotation: 20, ccxMagicStates: false },
    maxError: 1,
    qreVersion: "qdk-qre-v1-fixture",
  };
}

describe("robustness", () => {
  it("runs two configs sequentially without interference", async () => {
    const engine = new QreEngine(PYTHON_BIN);
    const r1 = await engine.run(config("11111111-1111-4111-8111-111111111111", "quantum-dynamics"));
    const r2 = await engine.run(config("22222222-2222-4222-8222-222222222222", "grovers-search"));
    expect(r1.runId).toBe("11111111-1111-4111-8111-111111111111");
    expect(r2.runId).toBe("22222222-2222-4222-8222-222222222222");
    expect(r1.status).toBe("succeeded");
    expect(r2.status).toBe("succeeded");
  }, 90000);

  it("runs two configs concurrently without interference", async () => {
    const engine = new QreEngine(PYTHON_BIN);
    const [r1, r2] = await Promise.all([
      engine.run(config("33333333-3333-4333-8333-333333333333", "phase-estimation")),
      engine.run(config("44444444-4444-4444-8444-444444444444", "quantum-dynamics")),
    ]);
    expect(r1.runId).toBe("33333333-3333-4333-8333-333333333333");
    expect(r2.runId).toBe("44444444-4444-4444-8444-444444444444");
    expect(r1.status).toBe("succeeded");
    expect(r2.status).toBe("succeeded");

    // runId/status alone can't catch a stdout mix-up between the two concurrent
    // child processes: runId is echoed straight from the JS-side config closure
    // (outputToResult.ts sets `runId: config.id`) and never round-trips through
    // Python, so both assertions above would still pass even if run1 silently
    // received run2's stdout. `raw` is the verbatim, unmodified output of the
    // Python subprocess (estimate.py's `entries[].runtime`/`.error`, copied
    // straight from qdk's EstimationTableEntry) and is genuinely
    // benchmark-specific: phase-estimation and quantum-dynamics are different
    // Q# programs that this fixed config resolves to different Pareto frontier
    // runtime/error values for. If the two concurrent subprocess calls' stdout
    // got swapped or interleaved, one of these would report the other
    // benchmark's numbers (or fail to match at all) even though runId/status
    // still looked fine.
    expect(r1.raw).toMatchObject({
      entries: [
        expect.objectContaining({ runtime: 3064950, error: 0.5609254302906356 }),
      ],
    });
    expect(r2.raw).toMatchObject({
      entries: [
        expect.objectContaining({ runtime: 585900, error: 0.2218502264687556 }),
      ],
    });
  }, 90000);
});
