import { describe, expect, it } from "vitest";

import Ajv from "ajv";
import addFormats from "ajv-formats";

import runConfigSchema from "../../shared/contracts/runconfig.schema.json" with { type: "json" };
import type { RunConfig } from "../../shared/types.js";
import { configToInvocation } from "./configToInvocation.js";
import { QreEngine } from "./qreEngine.js";
import { resolvePythonBin } from "./pythonBin.js";

/**
 * The v1.2.0 multi-select magic-state factory set, proved at every layer it
 * crosses: the committed schema, the engine adapter, and — for each newly
 * reachable combination — a REAL estimate through the QDK, which is the bar the
 * DoD sets ("validates against the schema AND estimates successfully").
 *
 * The set reaches the engine as a UNION (`qec * (f1 + f2 + …)`), so a
 * multi-factory run returns ONE frontier explored across all of them.
 */

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validateSchema = ajv.compile(runConfigSchema);

const PYTHON_BIN = resolvePythonBin();
const TIMEOUT_MS = 120_000;

function config(id: string, overrides: Partial<RunConfig> = {}): RunConfig {
  return {
    schemaVersion: "1.2.0",
    id,
    name: "multi-select factories",
    createdAt: "2026-07-31T00:00:00Z",
    application: {
      type: "manualCounts",
      numQubits: 100,
      tCount: 1000,
      rotationCount: 100,
      rotationDepth: 50,
      cczCount: 100,
      ccixCount: 0,
      measurementCount: 100,
    },
    architecture: {
      type: "gateBased",
      errorRate: 0.0001,
      gateTime: 50,
      measurementTime: 100,
      twoQubitGateTime: null,
    },
    qecCode: "surface_code",
    magicStateFactories: ["round_based"],
    traceTransform: { type: "psspc", tStatesPerRotation: 20, ccxMagicStates: false },
    maxError: 0.01,
    qreVersion: "qdk-qre-1.30.0",
    ...overrides,
  };
}

describe("magic state factory set — schema", () => {
  it("accepts a multi-factory set on a qualifying architecture", () => {
    expect(
      validateSchema(config("11111111-1111-4111-8111-111111111111", {
        magicStateFactories: ["round_based", "litinski19", "gsj24"],
      })),
    ).toBe(true);
  });

  it("rejects an empty set — a run must use at least one factory", () => {
    expect(
      validateSchema(config("22222222-2222-4222-8222-222222222222", {
        magicStateFactories: [],
      })),
    ).toBe(false);
  });

  it("rejects duplicates", () => {
    expect(
      validateSchema(config("33333333-3333-4333-8333-333333333333", {
        magicStateFactories: ["round_based", "round_based"],
      })),
    ).toBe(false);
  });

  it("rejects a non-round_based factory under Majorana", () => {
    expect(
      validateSchema(config("44444444-4444-4444-8444-444444444444", {
        architecture: { type: "majorana", errorRate: 0.00001, operationTime: 1000 },
        qecCode: "three_aux",
        magicStateFactories: ["round_based", "litinski19"],
      })),
    ).toBe(false);
  });

  it("rejects litinski19 when the error rate disqualifies it", () => {
    expect(
      validateSchema(config("55555555-5555-4555-8555-555555555555", {
        architecture: {
          type: "gateBased",
          errorRate: 0.005, // > 1e-3
          gateTime: 50,
          measurementTime: 100,
          twoQubitGateTime: null,
        },
        magicStateFactories: ["round_based", "litinski19"],
      })),
    ).toBe(false);
  });
});

describe("magic state factory set — adapter", () => {
  it("passes the whole set through to the invocation", () => {
    const result = configToInvocation(
      config("66666666-6666-4666-8666-666666666666", {
        magicStateFactories: ["round_based", "gsj24"],
      }),
      TIMEOUT_MS,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.invocation.magicStateFactories).toEqual(["round_based", "gsj24"]);
  });

  it("rejects an empty set", () => {
    const result = configToInvocation(
      config("77777777-7777-4777-8777-777777777777", { magicStateFactories: [] }),
      TIMEOUT_MS,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/at least one magic state factory/i);
  });

  it("rejects duplicates", () => {
    const result = configToInvocation(
      config("88888888-8888-4888-8888-888888888888", {
        magicStateFactories: ["gsj24", "gsj24"],
      }),
      TIMEOUT_MS,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/unique/i);
  });

  it("rejects a disqualified member even when the rest are fine", () => {
    const result = configToInvocation(
      config("99999999-9999-4999-8999-999999999999", {
        architecture: {
          type: "gateBased",
          errorRate: 0.005,
          gateTime: 50,
          measurementTime: 100,
          twoQubitGateTime: null,
        },
        magicStateFactories: ["round_based", "litinski19"],
      }),
      TIMEOUT_MS,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/litinski19/i);
  });

  it("reports a malformed set as INVALID_CONFIG on EVERY architecture", () => {
    // The architecture switch reads the set (Majorana admits round_based
    // alone), so a shape check that ran after it left Majorana dereferencing
    // `undefined` — which QreEngine's catch reported as ENGINE_CRASH "verify
    // the Python environment", blaming Python for a bad config.
    const architectures: Array<Partial<RunConfig>> = [
      {},
      {
        architecture: { type: "majorana", errorRate: 0.00001, operationTime: 1000 },
        qecCode: "three_aux",
      },
      {
        architecture: {
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
        },
        qecCode: "low_move_surface_code",
      },
    ];

    for (const architecture of architectures) {
      for (const malformed of [undefined, null, []] as unknown[]) {
        const subject = config("bbbbcccc-dddd-4eee-8fff-000011112222", {
          ...architecture,
          magicStateFactories: malformed as RunConfig["magicStateFactories"],
        });
        const result = configToInvocation(subject, TIMEOUT_MS);

        expect(result.ok).toBe(false);
        if (result.ok) continue;
        expect(result.error.code).toBe("INVALID_CONFIG");
        expect(result.error.message).toMatch(/at least one magic state factory/i);
      }
    }
  });

  it("rejects a non-round_based member under Majorana", () => {
    const result = configToInvocation(
      config("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", {
        architecture: { type: "majorana", errorRate: 0.00001, operationTime: 1000 },
        qecCode: "three_aux",
        magicStateFactories: ["round_based", "gsj24"],
      }),
      TIMEOUT_MS,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/majorana/i);
  });
});

describe("magic state factory set — real engine", () => {
  it("estimates with all three factories unioned into one frontier", async () => {
    const engine = new QreEngine(PYTHON_BIN);
    const result = await engine.run(
      config("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", {
        magicStateFactories: ["round_based", "litinski19", "gsj24"],
      }),
    );

    expect(result.status).toBe("succeeded");
    expect(result.frontier).not.toBeNull();
    expect(result.frontier?.length).toBeGreaterThan(0);
    // Every row names the factory that produced it, so a multi-factory frontier
    // is legible rather than anonymous.
    for (const row of result.frontier ?? []) {
      expect(["round_based", "litinski19", "gsj24"]).toContain(
        row.additional?.["magicStateFactory"]?.value,
      );
    }
  }, 300_000);

  it("beats or matches every single-factory run it contains", async () => {
    // The union is only meaningful if the estimator really explores all of them:
    // its best qubit count must be no worse than the best of the individuals.
    const engine = new QreEngine(PYTHON_BIN);
    const best = async (id: string, factories: RunConfig["magicStateFactories"]) => {
      const result = await engine.run(config(id, { magicStateFactories: factories }));
      expect(result.status).toBe("succeeded");
      return Math.min(...(result.frontier ?? []).map((row) => row.physicalQubits.value));
    };

    const roundBased = await best("cccccccc-cccc-4ccc-8ccc-cccccccccccc", ["round_based"]);
    const gsj24 = await best("dddddddd-dddd-4ddd-8ddd-dddddddddddd", ["gsj24"]);
    const union = await best("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", ["round_based", "gsj24"]);

    expect(union).toBeLessThanOrEqual(Math.min(roundBased, gsj24));
  }, 300_000);

  it("still estimates a single-factory run unchanged", async () => {
    const engine = new QreEngine(PYTHON_BIN);
    const result = await engine.run(
      config("ffffffff-ffff-4fff-8fff-ffffffffffff", {
        magicStateFactories: ["round_based"],
      }),
    );

    expect(result.status).toBe("succeeded");
    expect(result.frontier?.length).toBeGreaterThan(0);
    expect(result.frontier?.[0]?.additional?.["magicStateFactory"]?.value).toBe("round_based");
  }, 300_000);
});
