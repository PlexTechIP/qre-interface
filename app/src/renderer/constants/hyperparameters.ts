/**
 * Per-benchmark hyperparameter form model.
 *
 * The fields, bounds, and defaults are NOT declared here — they come from
 * `shared/benchmarkParams.ts`, which is also what the engine adapter turns into
 * the Q# entry expression it runs. This module is the renderer-side view of that
 * one spec: it adapts the shared shapes to the form's field types and owns the
 * draft-time validation messages.
 *
 * Keeping a second copy of the numbers here is what previously let the form
 * advertise a 31-bit Shor input while the engine ran a fixed 10-qubit register.
 */

import {
  BENCHMARK_PARAMS,
  defaultBenchmarkParameters,
  editableParams,
  type BenchmarkParamSpec,
  type ChoiceParam,
  type ComputedParam,
  type DoubleParam,
  type IntParam,
} from "../../shared/benchmarkParams";
import { BENCHMARK_IDS, type BenchmarkId } from "../../shared/types";

export type {
  BenchmarkParamSpec as HyperparamField,
  ChoiceParam,
  ComputedParam,
  DoubleParam,
  IntParam,
};

/** A stored hyperparameter value: a number, a select value, or null (cleared). */
export type HyperparamValue = number | string | null;
export type HyperparamValues = Record<string, HyperparamValue>;

/** The fields each benchmark exposes, in display order. */
export const BENCHMARK_HYPERPARAMS: Record<
  BenchmarkId,
  readonly BenchmarkParamSpec[]
> = BENCHMARK_PARAMS;

/** The default value record for one benchmark (computed fields carry no value). */
export function defaultHyperparams(benchmarkId: string): HyperparamValues {
  return defaultBenchmarkParameters(benchmarkId);
}

/** Seed the full per-benchmark map so switching benchmarks never loses entries. */
export function defaultAllHyperparams(): Record<string, HyperparamValues> {
  const all: Record<string, HyperparamValues> = {};
  for (const id of BENCHMARK_IDS) {
    all[id] = defaultHyperparams(id);
  }
  return all;
}

/** One invalid hyperparameter: the field it belongs to plus a display message. */
export interface HyperparamError {
  key: string;
  label: string;
  message: string;
}

/**
 * Validate one benchmark's hyperparameter values against the shared spec.
 * Returns a message per invalid field (empty = all valid). Choice and computed
 * fields never error; numeric fields check presence, integer-ness, and bounds —
 * including the Trotter Step ≤ Total Time cross-field rule.
 *
 * This is the DRAFT-time check, so it can flag a cleared field the user still
 * has to fill. The engine adapter re-checks the same bounds at Run against the
 * same spec, because a config can also arrive from an import or a rerun.
 */
export function validateHyperparams(
  benchmarkId: string,
  values: HyperparamValues,
): HyperparamError[] {
  const errors: HyperparamError[] = [];

  for (const field of editableParams(benchmarkId)) {
    if (field.kind === "choice") continue;

    const raw = values[field.key];
    if (raw === null || raw === undefined || raw === "") {
      errors.push({ key: field.key, label: field.label, message: `${field.label} is required.` });
      continue;
    }
    const n = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(n)) {
      errors.push({ key: field.key, label: field.label, message: `${field.label} must be a number.` });
      continue;
    }
    if (field.kind === "int" && !Number.isInteger(n)) {
      errors.push({ key: field.key, label: field.label, message: `${field.label} must be a whole number.` });
      continue;
    }
    if (field.min !== undefined) {
      const belowMin =
        field.kind === "double" && field.exclusiveMin ? n <= field.min : n < field.min;
      if (belowMin) {
        const bound =
          field.kind === "double" && field.exclusiveMin
            ? `greater than ${field.min}`
            : `at least ${field.min}`;
        errors.push({ key: field.key, label: field.label, message: `${field.label} must be ${bound}.` });
        continue;
      }
    }
    if (field.max !== undefined && n > field.max) {
      errors.push({ key: field.key, label: field.label, message: `${field.label} must be at most ${field.max}.` });
      continue;
    }
    if (field.kind === "double" && field.maxFromKey !== undefined) {
      const boundRaw = values[field.maxFromKey];
      const bound = typeof boundRaw === "number" ? boundRaw : Number(boundRaw);
      const boundField = editableParams(benchmarkId).find(
        (f) => f.key === field.maxFromKey,
      );
      if (Number.isFinite(bound) && n > bound) {
        errors.push({
          key: field.key,
          label: field.label,
          message: `${field.label} must be at most ${boundField?.label ?? field.maxFromKey}.`,
        });
      }
    }
  }

  return errors;
}
