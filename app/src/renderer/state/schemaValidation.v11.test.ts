/**
 * v1.1.0 JSON Schema tests (Week 4 — Team 1). Exercises validateRunConfigSchema
 * directly with hand-built configs, including the NEGATIVE cases the form can't
 * produce (wrong architecture->QEC pairing, a disallowed factory/architecture
 * combination). These pin the schema's conditional (allOf) rules so a future
 * edit can't loosen them unnoticed.
 *
 * Uses buildRunConfig from the test builders for a valid baseline. Place next to
 * toRunConfig.ts in app/src/renderer/state/ (builders import path assumes that
 * location: ../../shared/testing/builders).
 */
 
import { describe, expect, it } from "vitest";
 
import { buildRunConfig } from "../../shared/testing/builders";
import { validateRunConfigSchema } from "./schemaValidation";
import type { NeutralAtomArchitecture, RunConfig } from "../../shared/types";
 
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
 
function config(overrides: Partial<RunConfig>): RunConfig {
  return buildRunConfig(overrides);
}
 
/** A valid Neutral Atom config: correct architecture + Low-Move pairing. */
function neutralAtomConfig(
  archOverrides: Partial<NeutralAtomArchitecture> = {},
): RunConfig {
  return config({
    architecture: { ...NEUTRAL_ATOM, ...archOverrides },
    qecCode: "low_move_surface_code",
    magicStateFactory: "round_based",
  });
}
 
describe("schema v1.1.0 — architecture -> QEC pairing", () => {
  it("accepts Neutral Atom paired with Low-Move Surface Code", () => {
    expect(validateRunConfigSchema(neutralAtomConfig()).valid).toBe(true);
  });
 
  it("rejects Neutral Atom paired with the wrong QEC code", () => {
    const bad = config({
      architecture: NEUTRAL_ATOM,
      qecCode: "surface_code",
      magicStateFactory: "round_based",
    });
    expect(validateRunConfigSchema(bad).valid).toBe(false);
  });
 
  it("rejects GateBased paired with Low-Move (Neutral Atom's code)", () => {
    expect(validateRunConfigSchema(config({ qecCode: "low_move_surface_code" })).valid).toBe(false);
  });
});
 
describe("schema v1.1.0 — litinski19 availability", () => {
  it("accepts litinski19 on Neutral Atom with all errors <= 1e-3", () => {
    const ok = neutralAtomConfig();
    ok.magicStateFactory = "litinski19";
    expect(validateRunConfigSchema(ok).valid).toBe(true);
  });
 
  it("rejects litinski19 on Neutral Atom when an error exceeds 1e-3", () => {
    const bad = neutralAtomConfig({ measurementError: 0.005 });
    bad.magicStateFactory = "litinski19";
    expect(validateRunConfigSchema(bad).valid).toBe(false);
  });
});
 
describe("schema v1.1.0 — gsj24 availability", () => {
  it("accepts gsj24 on Neutral Atom under its looser conditions", () => {
    const ok = neutralAtomConfig({ singleQubitError: 0.005, measurementError: 0.005 });
    ok.magicStateFactory = "gsj24";
    expect(validateRunConfigSchema(ok).valid).toBe(true);
  });
 
  it("rejects gsj24 on Neutral Atom when an error reaches the 1e-2 ceiling", () => {
    const bad = neutralAtomConfig({ measurementError: 0.01 });
    bad.magicStateFactory = "gsj24";
    expect(validateRunConfigSchema(bad).valid).toBe(false);
  });
});
 
describe("schema v1.1.0 — secondary factories", () => {
  it("accepts a multi-select secondary factory set", () => {
    const ok = config({ secondaryFactories: ["magic_up_to_clifford", "gsj24_ccx"] });
    expect(validateRunConfigSchema(ok).valid).toBe(true);
  });
 
  it("rejects magic_up_to_clifford under Majorana", () => {
    const bad = config({
      architecture: { type: "majorana", errorRate: 0.00001, operationTime: 1000 },
      qecCode: "three_aux",
      magicStateFactory: "round_based",
      secondaryFactories: ["magic_up_to_clifford"],
    });
    expect(validateRunConfigSchema(bad).valid).toBe(false);
  });
 
  it("rejects an unknown secondary factory value", () => {
    const bad = config({ secondaryFactories: ["not_a_factory" as never] });
    expect(validateRunConfigSchema(bad).valid).toBe(false);
  });
});
 
describe("schema v1.1.0 — Neutral Atom field bounds", () => {
  it("rejects a Rydberg error at the exclusive 0.01 upper bound", () => {
    expect(validateRunConfigSchema(neutralAtomConfig({ rydbergError: 0.01 })).valid).toBe(false);
  });
 
  it("rejects a Surface Code time factor below 1", () => {
    expect(
      validateRunConfigSchema(neutralAtomConfig({ surfaceCodeOneQubitTimeFactor: 0 })).valid,
    ).toBe(false);
  });
 
  it("accepts handoff time of 0 (inclusive lower bound)", () => {
    expect(validateRunConfigSchema(neutralAtomConfig({ handoffTime: 0 })).valid).toBe(true);
  });
});
 
describe("schema v1.1.0 — memory optimization + parameters", () => {
  it("accepts a memory optimization value", () => {
    expect(validateRunConfigSchema(config({ memoryOptimization: "yoked_2d" })).valid).toBe(true);
  });
 
  it("accepts a benchmark parameters map", () => {
    expect(
      validateRunConfigSchema(config({ parameters: { bitSize: 31, generator: 11 } })).valid,
    ).toBe(true);
  });
 
  it("rejects an unknown top-level field (additionalProperties: false)", () => {
    const bad = config({}) as RunConfig & { bogus?: number };
    bad.bogus = 1;
    expect(validateRunConfigSchema(bad).valid).toBe(false);
  });
});