/**
 * The two directions between a form and a generated draft, and the rule that
 * kept being restated beside them.
 *
 * Design follow-up F-5 says the parts that own these adapters "must reuse one
 * shared projection rather than implementing two subtly different draft
 * shapes". The forward direction lived inside `src/mcp/`, where only one tool
 * could reach it; the reverse was reachable only through a function that also
 * demands a model name and a conversation id. Both have somewhere to be called
 * from now, so the next caller has no reason to write a third copy.
 *
 * Runs under the renderer project rather than node: the reverse adapter reaches
 * `fieldAnchors.ts`, which needs a DOM. That dependency is the whole reason the
 * two directions live in separate modules — see `generatedDraftToForm.ts`.
 */

import { describe, expect, it } from "vitest";

import { generatedDraftFromFormState } from "./generatedDraft.js";
import { formStateFromGeneratedDraft } from "./generatedDraftToForm.js";
import { formStateFromRunConfig, isSecondaryFactoryAllowed } from "./formState.js";
import { toRunConfig } from "./toRunConfig.js";
import { validateGeneratedDraft } from "../../main/draftValidation.js";
import { buildRunConfig } from "../../shared/testing/builders.js";
import type { RunConfig } from "../../shared/types.js";

const GATE_BASED = {
  type: "gateBased",
  errorRate: 0.0001,
  gateTime: 50,
  measurementTime: 100,
} as const;

const MAJORANA = {
  type: "majorana",
  errorRate: 0.00001,
  operationTime: 1000,
} as const;

describe("isSecondaryFactoryAllowed", () => {
  it("rules magic_up_to_clifford out under Majorana", () => {
    expect(isSecondaryFactoryAllowed("magic_up_to_clifford", "majorana")).toBe(
      false,
    );
  });

  it("allows it on the architectures the schema permits", () => {
    expect(isSecondaryFactoryAllowed("magic_up_to_clifford", "gateBased")).toBe(
      true,
    );
    expect(
      isSecondaryFactoryAllowed("magic_up_to_clifford", "neutralAtom"),
    ).toBe(true);
  });

  it("still drops the factory when serialising a Majorana run", () => {
    // The rule used to be restated at each site; this pins the behaviour that
    // routing them through one helper must preserve.
    const state = formStateFromRunConfig(
      buildRunConfig({ architecture: MAJORANA }),
    );
    const withFactory = {
      ...state,
      secondaryFactories: ["magic_up_to_clifford" as const],
    };

    const config = toRunConfig(withFactory, {
      id: "11111111-1111-4111-8111-111111111111",
      createdAt: "2026-08-20T00:00:00Z",
    });

    expect(config?.secondaryFactories ?? []).not.toContain(
      "magic_up_to_clifford",
    );
  });
});

/** One config per branch the adapters have to carry. */
const CORPUS: ReadonlyArray<{ label: string; config: RunConfig }> = [
  {
    label: "benchmark on gateBased",
    config: buildRunConfig({
      application: { type: "benchmark", benchmarkId: "shors-factoring" },
      architecture: GATE_BASED,
    }),
  },
  {
    label: "benchmark on majorana",
    config: buildRunConfig({
      application: { type: "benchmark", benchmarkId: "quantum-dynamics" },
      architecture: MAJORANA,
      qecCode: "three_aux",
    }),
  },
  {
    label: "manual counts on gateBased",
    config: buildRunConfig({
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
      architecture: GATE_BASED,
    }),
  },
];

describe("the draft adapters agree with each other", () => {
  for (const { label, config } of CORPUS) {
    it(`round-trips a ${label}`, () => {
      const original = formStateFromRunConfig(config);

      const draft = generatedDraftFromFormState(original);
      const back = formStateFromGeneratedDraft(draft);

      expect(back.ok, back.ok ? "" : back.message).toBe(true);
      if (!back.ok) return;

      // A draft carries the run's shape, not its identity, so compare what a
      // draft is able to say: application, architecture, and the factory sets.
      expect(back.state.application).toEqual(original.application);
      expect(back.state.architecture.type).toBe(original.architecture.type);
      expect(back.state.magicStateFactories).toEqual(
        original.magicStateFactories,
      );
    });
  }

  for (const { label, config } of CORPUS) {
    it(`produces a ${label} draft the generation contract accepts`, () => {
      // The committed schema is the arbiter of what a draft may look like, so
      // producing one it rejects means the run cannot be handed on to anything
      // that checks — including qre_validate_config.
      const draft = generatedDraftFromFormState(formStateFromRunConfig(config));

      const validated = validateGeneratedDraft(draft);

      expect(validated.ok, validated.ok ? "" : validated.reason).toBe(true);
    });
  }

  it("refuses an uploaded application rather than inventing a path", () => {
    const state = formStateFromRunConfig(
      buildRunConfig({
        application: {
          type: "uploaded",
          filePath: "/path/to/program.qs",
          format: "qsharp",
          addToLibrary: false,
        },
        architecture: GATE_BASED,
      }),
    );

    expect(() => generatedDraftFromFormState(state)).toThrowError(/upload/i);
  });

  it("refuses Majorana fields a draft cannot carry", () => {
    const state = formStateFromRunConfig(
      buildRunConfig({ architecture: { ...MAJORANA, tErrorRate: 0.00001 } }),
    );

    expect(() => generatedDraftFromFormState(state)).toThrowError(/tErrorRate/);
  });
});
