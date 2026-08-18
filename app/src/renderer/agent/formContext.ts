import type { FormContextEntry } from "../../shared/agentTypes";
import { createInitialFormState, type FormState } from "../state/formState";

/**
 * What the analyst has already decided, in the vocabulary the model knows.
 *
 * Sent with every turn so a proposal starts from their work rather than from
 * defaults — the week-6 backlog's "a model draft still discards a half-filled
 * form", fixed at the point the draft is authored rather than after.
 *
 * Two decisions shape this:
 *
 * **Only what differs from a fresh form.** "Filled in" has to mean something,
 * and the only defensible definition is "not what the app put there". Sending
 * the whole state would tell the model that every default was a deliberate
 * choice, which is precisely the instruction that stops it proposing anything.
 *
 * **Addressed by schema path, not by UI label.** `architecture.errorRate` is
 * the same string the field guide teaches and the same one a draft comes back
 * with, so "carry this through" needs no translation table at either end. A
 * label like "Error rate" would need one, and it would drift.
 */
/**
 * A fresh form, built once.
 *
 * `createInitialFormState` constructs the whole nested state and seeds a
 * hyperparameter record for every benchmark, and this function only ever READS
 * the result. Rebuilding it per call meant doing all of that on every keystroke
 * in the run form, to answer the same question every time.
 */
let defaultForm: FormState | null = null;
const initialForm = (): FormState => (defaultForm ??= createInitialFormState());

export function formContextFromState(state: FormState): FormContextEntry[] {
  const initial = initialForm();
  const entries: FormContextEntry[] = [];
  const add = (field: string, value: string): void => {
    entries.push({ field, value });
  };

  if (state.name.trim().length > 0) add("name", state.name.trim());

  // Only the two application shapes a draft can express. Uploaded and saved
  // programs are deliberately outside the generation contract, so naming one
  // here would describe a configuration the model has no way to propose.
  if (state.application.type === "benchmark") {
    if (state.application.benchmarkId !== initial.application.benchmarkId) {
      add("application.benchmarkId", state.application.benchmarkId);
    }
    for (const [key, value] of Object.entries(
      state.application.hyperparams[state.application.benchmarkId] ?? {},
    )) {
      const untouched =
        initial.application.hyperparams[state.application.benchmarkId]?.[key];
      if (value !== null && value !== untouched) add(`parameters.${key}`, String(value));
    }
  } else if (state.application.type === "manualCounts") {
    add("application.type", "manualCounts");
    for (const [key, value] of Object.entries(state.application.manualCounts)) {
      if (value !== null) add(`application.${key}`, String(value));
    }
  }

  if (state.architecture.type !== initial.architecture.type) {
    add("architecture.type", state.architecture.type);
  }
  const branch = state.architecture[state.architecture.type] as unknown as Record<
    string,
    unknown
  >;
  const branchDefaults = initial.architecture[initial.architecture.type] as unknown as Record<
    string,
    unknown
  >;
  for (const [key, value] of Object.entries(branch)) {
    // A null is an unset control, not a choice. Reporting it as one would ask
    // the model to preserve an emptiness the analyst never expressed.
    if (value === null || value === undefined) continue;
    if (state.architecture.type === initial.architecture.type && value === branchDefaults[key]) {
      continue;
    }
    add(`architecture.${key}`, String(value));
  }

  if (!sameSet(state.magicStateFactories, initial.magicStateFactories)) {
    add("magicStateFactories", state.magicStateFactories.join(", "));
  }
  if (!sameSet(state.secondaryFactories, initial.secondaryFactories)) {
    add("secondaryFactories", state.secondaryFactories.join(", ") || "none");
  }
  if (state.memoryOptimization !== initial.memoryOptimization) {
    add("memoryOptimization", state.memoryOptimization);
  }
  if (state.traceTransform.tStatesPerRotation !== initial.traceTransform.tStatesPerRotation) {
    add("traceTransform.tStatesPerRotation", String(state.traceTransform.tStatesPerRotation));
  }
  if (state.traceTransform.ccxMagicStates !== initial.traceTransform.ccxMagicStates) {
    add("traceTransform.ccxMagicStates", String(state.traceTransform.ccxMagicStates));
  }
  if (state.maxError !== null && state.maxError !== initial.maxError) {
    add("maxError", String(state.maxError));
  }

  return entries;
}

/** Order is a UI accident in both lists, so it must not read as a change. */
function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const other = new Set(b);
  return a.every((value) => other.has(value));
}
