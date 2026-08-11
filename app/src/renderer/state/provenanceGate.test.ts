/**
 * Provenance has to be INSIDE the schema gate.
 *
 * The Run gate is `isConfigValid`: it serializes the draft with `toRunConfig`
 * and validates the result against the canonical schema. Provenance used to be
 * attached after that — `useRunFlow` mutating the config it had just built — so
 * the object that executed carried a field the gate had never inspected. These
 * tests pin the invariant that closed it: the object the gate validates is the
 * object that runs, provenance included.
 */

import { describe, expect, it } from "vitest";

import type { RunProvenance } from "../../shared/types";
import { createInitialFormState, type FormState } from "./formState";
import { validateRunConfigSchema } from "./schemaValidation";
import { schemaValidationStamp, toRunConfig } from "./toRunConfig";
import { isConfigValid } from "./validation";

const MODEL_ASSISTED: RunProvenance = {
  authoredBy: "model_assisted",
  model: "anthropic/claude-sonnet-4-5",
};

/** The minimal valid draft: defaults plus the two undefaulted GateBased times. */
function validDraft(): FormState {
  const state = createInitialFormState();
  state.architecture.gateBased.gateTime = 50;
  state.architecture.gateBased.measurementTime = 100;
  return state;
}

describe("provenance travels with the stamp", () => {
  it("serializes into the config toRunConfig returns", () => {
    const config = toRunConfig(validDraft(), schemaValidationStamp(MODEL_ASSISTED));

    expect(config).not.toBeNull();
    expect(config!.provenance).toEqual(MODEL_ASSISTED);
    expect(validateRunConfigSchema(config!).valid).toBe(true);
  });

  it("is omitted, not written as undefined, on an analyst-authored draft", () => {
    const config = toRunConfig(validDraft(), schemaValidationStamp());

    expect(config).not.toBeNull();
    // `additionalProperties: false` plus exactOptionalPropertyTypes: absence is
    // the contract's "human-authored", and `provenance: undefined` is not it.
    expect(config!).not.toHaveProperty("provenance");
  });
});

describe("the Run gate inspects provenance", () => {
  it("accepts a draft whose provenance the canonical schema accepts", () => {
    expect(isConfigValid(validDraft(), MODEL_ASSISTED)).toBe(true);
  });

  it("refuses a draft whose provenance the canonical schema rejects", () => {
    // `provenance.model` is `minLength: 1` in runconfig.schema.json. While
    // provenance was attached after the gate, nothing on the Run path ever
    // looked at it: the button enabled, the engine ran, and the store took a
    // record the schema forbids.
    expect(
      isConfigValid(validDraft(), { authoredBy: "model_assisted", model: "" }),
    ).toBe(false);
  });
});
