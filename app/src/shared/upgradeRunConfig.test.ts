import { describe, expect, it } from "vitest";

import { DEFAULT_TRACE_TRANSFORM } from "./traceTransform";
import { SCHEMA_VERSION, upgradeRunConfig, type RunConfig } from "./types";

/**
 * `upgradeRunConfig` is the read boundary for every stored record, and it had no
 * tests. It now absorbs TWO breaking shape changes at once — v1.2.0's factory
 * set and v1.3.0's trace-transform pipeline — and a record saved before either
 * has to come back correct, which is what these pin down.
 *
 * The fixtures are deliberately hand-shaped legacy JSON, cast at the boundary.
 * Do not "modernize" them: they are the shapes already on disk.
 */

/** A v1.1.0 record: singular factory, union transform. */
function v110(): unknown {
  return {
    schemaVersion: "1.1.0",
    id: "11111111-0000-4000-8000-000000000000",
    name: "old run",
    createdAt: "2026-07-01T00:00:00.000Z",
    application: { type: "benchmark", benchmarkId: "quantum-dynamics" },
    architecture: {
      type: "gateBased",
      errorRate: 0.0001,
      gateTime: 50,
      measurementTime: 100,
      twoQubitGateTime: null,
    },
    qecCode: "surface_code",
    magicStateFactory: "litinski19",
    traceTransform: { type: "psspc", tStatesPerRotation: 7, ccxMagicStates: true },
    maxError: 1,
    qreVersion: "qdk-qre-1.29.1",
  };
}

const upgrade = (config: unknown): RunConfig =>
  upgradeRunConfig(config as RunConfig);

describe("upgradeRunConfig absorbs both breaking changes", () => {
  it("lifts a v1.1.0 record's singular factory into the set", () => {
    expect(upgrade(v110()).magicStateFactories).toEqual(["litinski19"]);
  });

  it("drops the retired singular field rather than leaving both", () => {
    expect(upgrade(v110())).not.toHaveProperty("magicStateFactory");
  });

  it("resolves a v1.1.0 union transform into the pipeline object", () => {
    expect(upgrade(v110()).traceTransform).toEqual({
      tStatesPerRotation: 7,
      ccxMagicStates: true,
      slowDownFactor: 1.0,
    });
  });

  it("upgrades a v1.2.0 record, which has the set but still the union", () => {
    // The window between the two contract changes: factories already migrated,
    // transform not yet. Passing this through untouched would leave a union on a
    // field the engine now parses strictly.
    const v120 = {
      ...(v110() as Record<string, unknown>),
      schemaVersion: "1.2.0",
      magicStateFactories: ["round_based"],
      magicStateFactory: undefined,
      traceTransform: { type: "latticeSurgery", slowDownFactor: 1.0 },
    };
    const upgraded = upgrade(v120);

    expect(upgraded.magicStateFactories).toEqual(["round_based"]);
    expect(upgraded.traceTransform).toEqual(DEFAULT_TRACE_TRANSFORM);
  });

  it("leaves schemaVersion exactly as saved", () => {
    // A run configured under 1.1.0 must keep saying so in History and exports.
    expect(upgrade(v110()).schemaVersion).toBe("1.1.0");
    expect(upgrade(v110()).schemaVersion).not.toBe(SCHEMA_VERSION);
  });

  it("passes a current record through untouched, by identity", () => {
    const current = {
      ...(v110() as Record<string, unknown>),
      schemaVersion: SCHEMA_VERSION,
      magicStateFactories: ["round_based"],
      magicStateFactory: undefined,
      traceTransform: { ...DEFAULT_TRACE_TRANSFORM },
    } as unknown as RunConfig;
    delete (current as { magicStateFactory?: unknown }).magicStateFactory;

    expect(upgradeRunConfig(current)).toBe(current);
  });

  it("is idempotent", () => {
    const once = upgrade(v110());
    expect(upgradeRunConfig(once)).toEqual(once);
  });

  it("defaults a record that names no factory at all", () => {
    const noFactory = { ...(v110() as Record<string, unknown>) };
    delete noFactory.magicStateFactory;
    expect(upgrade(noFactory).magicStateFactories).toEqual(["round_based"]);
  });
});

describe("v1.4.0 needs no migration branch, because it is additive", () => {
  /** A v1.3.0 record: factory set and pipeline object already, no v1.4.0 fields. */
  function v130(): RunConfig {
    return {
      ...(v110() as Record<string, unknown>),
      schemaVersion: "1.3.0",
      magicStateFactories: ["litinski19"],
      magicStateFactory: undefined,
      traceTransform: { ...DEFAULT_TRACE_TRANSFORM },
    } as unknown as RunConfig;
  }

  it("passes a v1.3.0 record through by identity", () => {
    // The assertion that keeps v1.4.0 honest about its version number. If this
    // ever fails, v1.4.0 reshaped something and is a BREAKING change wearing a
    // minor bump — it would owe stored records a migration branch above.
    const record = v130();
    delete (record as { magicStateFactory?: unknown }).magicStateFactory;

    expect(upgradeRunConfig(record)).toBe(record);
  });

  it("does not invent the optional pipeline stages on an older record", () => {
    // A pre-v1.4.0 record ran PSSPC × LatticeSurgery and nothing else. Filling
    // in dynamicMemoryCompute here would rewrite history: the record would claim
    // a stage that never ran when it was estimated.
    const upgraded = upgrade(v130());

    expect(upgraded.traceTransform).not.toHaveProperty("dynamicMemoryCompute");
    expect(upgraded.traceTransform.unmemory).toBeUndefined();
  });

  it("does not invent provenance, so an old record stays human-authored", () => {
    // Absent provenance means human-authored. Stamping "human" onto records that
    // predate the field would assert something we never actually observed.
    expect(upgrade(v130())).not.toHaveProperty("provenance");
  });
});
