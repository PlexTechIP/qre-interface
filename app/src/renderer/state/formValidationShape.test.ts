/**
 * The shape `validateForm` answers in, and why it is two things.
 *
 * `hyperparams` used to be a member of `FieldErrors`, and the one member of it
 * that was not a string. Every consumer that walked the object had to know:
 * `ValidationSummary` destructured it out before iterating, `fieldAnchors`
 * wrote `Exclude<keyof FieldErrors, "hyperparams">`, and the MCP
 * `qre_validate_config` tool special-cased it by name. Two independent
 * implementations of that tool were written against the type and BOTH got it
 * wrong — one rendered every benchmark-parameter error as the literal text
 * `[object Object]`, the other passed the array to a string function and died
 * with `text.replace is not a function`, turning the commonest error an agent
 * tuning a benchmark can hit into a failed tool call.
 *
 * Three workarounds and two bugs is the type's fault, not the callers'. These
 * tests hold the separation, and — more importantly — hold the Run gate, which
 * is the thing the separation could have silently broken: hyperparameter errors
 * used to block Run by virtue of living inside `FieldErrors`, and now have to
 * be counted deliberately.
 */

import { describe, expect, it } from "vitest";

import {
  hasFieldErrors,
  hasFormErrors,
  isConfigValid,
  validateForm,
} from "./validation.js";
import { createInitialFormState, type FormState } from "./formState.js";

/**
 * A form that would run — defaults plus the two undefaulted GateBased times,
 * the same minimal valid draft `provenanceGate.test.ts` uses.
 */
function validForm(): FormState {
  const state = createInitialFormState();
  state.architecture.gateBased.gateTime = 50;
  state.architecture.gateBased.measurementTime = 100;
  return state;
}

/** That form, with a benchmark hyperparameter far outside its range. */
function withBadHyperparameter(): FormState {
  const state = validForm();
  if (state.application.type !== "benchmark") {
    throw new Error("the initial form is expected to start on a benchmark");
  }
  const benchmarkId = state.application.benchmarkId;
  return {
    ...state,
    application: {
      ...state.application,
      hyperparams: {
        ...state.application.hyperparams,
        [benchmarkId]: {
          ...(state.application.hyperparams[benchmarkId] ?? {}),
          // Far outside any benchmark's accepted range, whichever it is.
          bitSize: 10_000_000,
          latticeN1: 10_000_000,
          numQubits: 10_000_000,
        },
      },
    },
  };
}

describe("what validateForm answers", () => {
  it("keeps every field error a string", () => {
    // The property the old shape broke, and the one every consumer assumed.
    for (const state of [validForm(), withBadHyperparameter()]) {
      for (const [field, message] of Object.entries(validateForm(state).fields)) {
        expect(typeof message, `${field} is not a string`).toBe("string");
      }
    }
  });

  it("reports a hyperparameter problem in hyperparams, not in fields", () => {
    const validation = validateForm(withBadHyperparameter());

    expect(validation.hyperparams.length).toBeGreaterThan(0);
    expect(Object.keys(validation.fields)).not.toContain("hyperparams");
    for (const issue of validation.hyperparams) {
      expect(typeof issue.key).toBe("string");
      expect(typeof issue.label).toBe("string");
      expect(typeof issue.message).toBe("string");
    }
  });

  it("still blocks Run on a hyperparameter alone", () => {
    // The regression this refactor could have introduced. These errors used to
    // count simply by living inside FieldErrors; now they are counted on
    // purpose, and `isConfigValid` has to keep saying no.
    const state = withBadHyperparameter();
    const validation = validateForm(state);

    expect(hasFieldErrors(validation.fields), "no scalar error to hide behind").toBe(
      false,
    );
    expect(hasFormErrors(validation)).toBe(true);
    expect(isConfigValid(state)).toBe(false);
  });

  it("says a clean form is clean", () => {
    const validation = validateForm(validForm());

    expect(validation.hyperparams).toEqual([]);
    expect(validation.fields).toEqual({});
    expect(hasFormErrors(validation)).toBe(false);
    expect(isConfigValid(validForm())).toBe(true);
  });
});
