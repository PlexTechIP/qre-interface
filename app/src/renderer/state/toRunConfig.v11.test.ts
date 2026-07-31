/**
 * Unit tests for the v1.1.0 contract additions to the FormState -> RunConfig
 * serializer (Week 4 — Team 1): Neutral Atom architecture, Low-Move QEC pairing,
 * GSJ24 / secondary factories, memory optimization, and benchmark
 * hyperparameters reaching RunConfig. Mirrors the conventions of the sibling
 * toRunConfig.test.ts: explicit vitest imports, a placeholder stamp, and every
 * non-null output additionally validated against the committed JSON Schema.
 *
 * Place next to toRunConfig.ts in app/src/renderer/state/.
 */
 
import { describe, expect, it } from "vitest";
 
import { createInitialFormState, type FormState } from "./formState";
import { schemaValidationStamp, toRunConfig } from "./toRunConfig";
import { validateForm } from "./validation";
import { validateRunConfigSchema } from "./schemaValidation";
 
const STAMP = schemaValidationStamp();
 
function serialize(state: FormState) {
  return toRunConfig(state, STAMP);
}
 
/** A defaults draft with the two required GateBased times filled. */
function validGateBasedDraft(): FormState {
  const s = createInitialFormState();
  s.architecture.gateBased.gateTime = 50;
  s.architecture.gateBased.measurementTime = 100;
  return s;
}
 
/** Serialize, assert non-null, and assert schema-valid; returns the config. */
function expectSchemaValid(state: FormState) {
  const config = serialize(state);
  expect(config).not.toBeNull();
  const result = validateRunConfigSchema(config!);
  expect(result.errors).toBe("");
  expect(result.valid).toBe(true);
  return config!;
}
 
describe("v1.1.0 — Neutral Atom architecture", () => {
  it("serializes a schema-valid Neutral Atom config", () => {
    const s = validGateBasedDraft();
    s.architecture.type = "neutralAtom";
    expect(expectSchemaValid(s).architecture.type).toBe("neutralAtom");
  });
 
  it("derives Low-Move Surface Code as the Neutral Atom QEC pairing", () => {
    const s = validGateBasedDraft();
    s.architecture.type = "neutralAtom";
    expect(expectSchemaValid(s).qecCode).toBe("low_move_surface_code");
  });
 
  it("carries all twelve Neutral Atom fields with their spec defaults", () => {
    const s = validGateBasedDraft();
    s.architecture.type = "neutralAtom";
    const arch = expectSchemaValid(s).architecture;
    expect(arch).toEqual({
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
    });
  });
 
  it("auto-names a Neutral Atom run with its derived architecture + QEC", () => {
    const s = validGateBasedDraft();
    s.architecture.type = "neutralAtom";
    const name = serialize(s)?.name ?? "";
    // The benchmark display segment is covered by the sibling toRunConfig.test.ts;
    // here we pin the architecture + derived-QEC segments this feature introduces.
    expect(name).toContain("Neutral Atom");
    expect(name).toContain("Low-Move Surface Code");
  });
});
 
describe("v1.1.0 — magic-state factory availability", () => {
  it("keeps litinski19 on GateBased at the 1e-3 boundary", () => {
    const s = validGateBasedDraft();
    s.architecture.gateBased.errorRate = 0.001;
    s.magicStateFactory = "litinski19";
    expect(expectSchemaValid(s).magicStateFactory).toBe("litinski19");
  });
 
  it("falls back to round_based when GateBased error rate exceeds 1e-3", () => {
    const s = validGateBasedDraft();
    s.architecture.gateBased.errorRate = 0.002;
    s.magicStateFactory = "litinski19";
    expect(expectSchemaValid(s).magicStateFactory).toBe("round_based");
  });
 
  it("allows litinski19 on Neutral Atom when all three errors are <= 1e-3", () => {
    const s = validGateBasedDraft();
    s.architecture.type = "neutralAtom";
    s.magicStateFactory = "litinski19";
    expect(expectSchemaValid(s).magicStateFactory).toBe("litinski19");
  });
 
  it("falls back from litinski19 on Neutral Atom when an error exceeds 1e-3", () => {
    const s = validGateBasedDraft();
    s.architecture.type = "neutralAtom";
    s.architecture.neutralAtom.singleQubitError = 0.005;
    s.magicStateFactory = "litinski19";
    expect(expectSchemaValid(s).magicStateFactory).toBe("round_based");
  });
 
  it("allows gsj24 on Neutral Atom under its looser error conditions", () => {
    const s = validGateBasedDraft();
    s.architecture.type = "neutralAtom";
    s.architecture.neutralAtom.singleQubitError = 0.005;
    s.architecture.neutralAtom.measurementError = 0.005;
    s.magicStateFactory = "gsj24";
    expect(expectSchemaValid(s).magicStateFactory).toBe("gsj24");
  });
});
 
describe("v1.1.0 — secondary factories and memory optimization", () => {
  it("omits the optional fields entirely when unused (backward compatible)", () => {
    const config = expectSchemaValid(validGateBasedDraft());
    expect(config).not.toHaveProperty("secondaryFactories");
    expect(config).not.toHaveProperty("memoryOptimization");
  });
 
  it("serializes a multi-select secondary factory set", () => {
    const s = validGateBasedDraft();
    s.secondaryFactories = ["magic_up_to_clifford", "gsj24_ccx"];
    expect(expectSchemaValid(s).secondaryFactories).toEqual([
      "magic_up_to_clifford",
      "gsj24_ccx",
    ]);
  });
 
  it("drops magic_up_to_clifford under Majorana (schema-forbidden pairing)", () => {
    const s = createInitialFormState();
    s.architecture.type = "majorana";
    s.secondaryFactories = ["magic_up_to_clifford", "gsj24_ccx"];
    expect(expectSchemaValid(s).secondaryFactories).toEqual(["gsj24_ccx"]);
  });
 
  it("serializes memory optimization only when not 'none'", () => {
    const none = expectSchemaValid(validGateBasedDraft());
    expect(none).not.toHaveProperty("memoryOptimization");
 
    const s = validGateBasedDraft();
    s.memoryOptimization = "yoked_2d";
    expect(expectSchemaValid(s).memoryOptimization).toBe("yoked_2d");
  });
});
 
describe("v1.1.0 — hyperparameters reach RunConfig", () => {
  it("serializes a benchmark's default hyperparameters into parameters", () => {
    const s = validGateBasedDraft();
    s.application.benchmarkId = "shors-factoring";
    s.application.hyperparams["shors-factoring"] = { bitSize: 31, generator: 11 };
    expect(expectSchemaValid(s).parameters).toEqual({ bitSize: 31, generator: 11 });
  });
 
  it("excludes computed fields (Grover's iterations) from parameters", () => {
    const s = validGateBasedDraft();
    s.application.benchmarkId = "grovers-search";
    expect(expectSchemaValid(s).parameters).toEqual({ searchQubits: 5 });
  });
 
  it("drops cleared (null) hyperparameter values", () => {
    const s = validGateBasedDraft();
    s.application.benchmarkId = "shors-factoring";
    s.application.hyperparams["shors-factoring"] = { bitSize: 31, generator: null };
    expect(expectSchemaValid(s).parameters).toEqual({ bitSize: 31 });
  });
 
  it("omits parameters for a non-benchmark application", () => {
    const s = validGateBasedDraft();
    s.application.type = "uploaded";
    s.application.upload = {
      filePath: "/tmp/p.qs",
      format: "qsharp",
      addToLibrary: false,
    };
    expect(expectSchemaValid(s)).not.toHaveProperty("parameters");
  });
});
 
describe("v1.1.0 — Neutral Atom field validation (validateForm)", () => {
  it("reports no architecture errors for a default Neutral Atom draft", () => {
    const s = validGateBasedDraft();
    s.architecture.type = "neutralAtom";
    const errors = validateForm(s);
    expect(errors.rydbergTime).toBeUndefined();
    expect(errors.rydbergError).toBeUndefined();
    expect(errors.handoffTime).toBeUndefined();
    expect(errors.surfaceCodeOneQubitTimeFactor).toBeUndefined();
  });
 
  it("flags a Rydberg error at the exclusive 0.01 upper bound", () => {
    const s = validGateBasedDraft();
    s.architecture.type = "neutralAtom";
    s.architecture.neutralAtom.rydbergError = 0.01;
    expect(validateForm(s).rydbergError).toBeDefined();
  });
 
  it("accepts handoff time of 0 (inclusive lower bound)", () => {
    const s = validGateBasedDraft();
    s.architecture.type = "neutralAtom";
    s.architecture.neutralAtom.handoffTime = 0;
    expect(validateForm(s).handoffTime).toBeUndefined();
  });
 
  it("flags a Surface Code time factor below 1", () => {
    const s = validGateBasedDraft();
    s.architecture.type = "neutralAtom";
    s.architecture.neutralAtom.surfaceCodeOneQubitTimeFactor = 0;
    expect(validateForm(s).surfaceCodeOneQubitTimeFactor).toBeDefined();
  });
 
  it("flags a non-integer time field", () => {
    const s = validGateBasedDraft();
    s.architecture.type = "neutralAtom";
    s.architecture.neutralAtom.rydbergTime = 500.5;
    expect(validateForm(s).rydbergTime).toBeDefined();
  });
});