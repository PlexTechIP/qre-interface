// @vitest-environment node
import { describe, expect, it } from "vitest";
import { generatedDraftFromFormState, generatedDraftToFormState } from "./projections.js";
import type { GeneratedRunDraft } from "../shared/agentTypes.js";

const cases: Array<[string, GeneratedRunDraft]> = [
  [
    "gate-based benchmark",
    {
      name: "My Gate Draft",
      application: { type: "benchmark", benchmarkId: "quantum-dynamics" },
      architecture: {
        type: "gateBased",
        errorRate: 0.0001,
        gateTime: 50,
        measurementTime: 100,
        twoQubitGateTime: null,
      },
      magicStateFactories: ["round_based"],
      secondaryFactories: [],
      memoryOptimization: "none",
      traceTransform: { tStatesPerRotation: 10, ccxMagicStates: false },
      maxError: 0.5,
      parameters: {},
    },
  ],
  [
    "majorana",
    {
      name: "My Majorana Draft",
      application: { type: "benchmark", benchmarkId: "shors-factoring" },
      architecture: { type: "majorana", errorRate: 0.00001, operationTime: 1000 },
      magicStateFactories: ["round_based"],
      secondaryFactories: [],
      memoryOptimization: "none",
      traceTransform: { tStatesPerRotation: 15, ccxMagicStates: true },
      maxError: 0.1,
      parameters: {},
    },
  ],
  [
    "neutral atom",
    {
      name: "My Neutral Atom Draft",
      application: { type: "benchmark", benchmarkId: "grovers-search" },
      architecture: {
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
      },
      magicStateFactories: ["gsj24"],
      secondaryFactories: ["gsj24_ccx"],
      memoryOptimization: "none",
      traceTransform: { tStatesPerRotation: 12, ccxMagicStates: true },
      maxError: 0.2,
      parameters: {},
    },
  ],
  [
    "manual counts",
    {
      name: "My Manual Draft",
      application: {
        type: "manualCounts",
        numQubits: 50,
        tCount: 100,
        rotationCount: 200,
        rotationDepth: 50,
        cczCount: 10,
        ccixCount: 5,
        measurementCount: 50,
      },
      architecture: {
        type: "gateBased",
        errorRate: 0.0001,
        gateTime: 50,
        measurementTime: 100,
        twoQubitGateTime: 75,
      },
      magicStateFactories: ["litinski19"],
      secondaryFactories: [],
      memoryOptimization: "none",
      traceTransform: { tStatesPerRotation: 8, ccxMagicStates: false },
      maxError: 0.3,
      parameters: {},
    },
  ],
  [
    "null name",
    {
      name: null,
      application: { type: "benchmark", benchmarkId: "phase-estimation" },
      architecture: {
        type: "gateBased",
        errorRate: 0.00001,
        gateTime: 100,
        measurementTime: 200,
        twoQubitGateTime: null,
      },
      magicStateFactories: ["round_based"],
      secondaryFactories: [],
      memoryOptimization: "none",
      traceTransform: { tStatesPerRotation: 20, ccxMagicStates: false },
      maxError: 1.0,
      parameters: {},
    },
  ],
  [
    "hyperparameters",
    {
      name: "With Params",
      application: { type: "benchmark", benchmarkId: "quantum-dynamics" },
      architecture: {
        type: "gateBased",
        errorRate: 0.0001,
        gateTime: 50,
        measurementTime: 100,
        twoQubitGateTime: null,
      },
      magicStateFactories: ["round_based"],
      secondaryFactories: [],
      memoryOptimization: "none",
      traceTransform: { tStatesPerRotation: 10, ccxMagicStates: false },
      maxError: 0.5,
      parameters: { someParam: 42, stringParam: "value", boolParam: true },
    },
  ],
];

describe("Projection round-trip tests", () => {
  it.each(cases)("%s round-trips through FormState", (_label, draft) => {
    const formState = generatedDraftToFormState(draft);
    const roundTripped = generatedDraftFromFormState(formState);

    expect(roundTripped.name).toBe(draft.name);
    expect(roundTripped.application.type).toBe(draft.application.type);

    if (draft.application.type === "benchmark" && roundTripped.application.type === "benchmark") {
      expect(roundTripped.application.benchmarkId).toBe(draft.application.benchmarkId);
    } else if (draft.application.type === "manualCounts" && roundTripped.application.type === "manualCounts") {
      expect(roundTripped.application.numQubits).toBe(draft.application.numQubits);
      expect(roundTripped.application.tCount).toBe(draft.application.tCount);
      expect(roundTripped.application.rotationCount).toBe(draft.application.rotationCount);
      expect(roundTripped.application.rotationDepth).toBe(draft.application.rotationDepth);
      expect(roundTripped.application.cczCount).toBe(draft.application.cczCount);
      expect(roundTripped.application.ccixCount).toBe(draft.application.ccixCount);
      expect(roundTripped.application.measurementCount).toBe(draft.application.measurementCount);
    }

    expect(roundTripped.architecture.type).toBe(draft.architecture.type);
    expect(roundTripped.magicStateFactories).toEqual(draft.magicStateFactories);
    expect(roundTripped.secondaryFactories).toEqual(draft.secondaryFactories);
    expect(roundTripped.memoryOptimization).toBe(draft.memoryOptimization);
    expect(roundTripped.traceTransform.tStatesPerRotation).toBe(draft.traceTransform.tStatesPerRotation);
    expect(roundTripped.traceTransform.ccxMagicStates).toBe(draft.traceTransform.ccxMagicStates);
    expect(roundTripped.maxError).toBe(draft.maxError);
  });
});
