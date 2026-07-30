/**
 * Per-benchmark hyperparameter schemas — the fields, bounds, and defaults each
 * starter benchmark exposes (see qre-application.md).
 *
 * These describe the RENDERER's form inputs only. The frozen contract's
 * BenchmarkApplication carries just a `benchmarkId` today, so hyperparameter
 * VALUES live in FormState and are not yet serialized into RunConfig — the
 * serialization seam is marked in toRunConfig.ts and opens when the contract
 * gains a `parameters` field (a PM-owned change). Keeping the schema in one
 * place means that future wiring is a single, obvious edit.
 */

import { BENCHMARK_IDS, type BenchmarkId } from "../../shared/types";

/** A whole-number field, e.g. Bit Size or Search Qubits. */
export interface IntField {
  kind: "int";
  key: string;
  label: string;
  /** Lower bound. Inclusive unless `exclusiveMin`. */
  min: number;
  /** Inclusive upper bound, if any. */
  max?: number;
  exclusiveMin?: boolean;
  default: number;
  help: string;
}

/** A real-valued field, e.g. Total Time or Coupling J. */
export interface FloatField {
  kind: "float";
  key: string;
  label: string;
  min?: number;
  max?: number;
  exclusiveMin?: boolean;
  /** Another field's key whose current value is this field's upper bound
   *  (e.g. Trotter Step ≤ Total Time). Resolved at validation time. */
  maxFromKey?: string;
  default: number;
  help: string;
}

/** A fixed set of choices, e.g. the RSA instance. */
export interface SelectField {
  kind: "select";
  key: string;
  label: string;
  options: readonly { value: string; label: string }[];
  default: string;
  help?: string;
}

/** A read-only value the engine derives at estimation time (not user-entered). */
export interface ComputedField {
  kind: "computed";
  key: string;
  label: string;
  note: string;
}

export type HyperparamField =
  | IntField
  | FloatField
  | SelectField
  | ComputedField;

/** A stored hyperparameter value: a number, a select value, or null (cleared). */
export type HyperparamValue = number | string | null;
export type HyperparamValues = Record<string, HyperparamValue>;

/** The fields each benchmark exposes, in display order. */
export const BENCHMARK_HYPERPARAMS: Record<BenchmarkId, readonly HyperparamField[]> = {
  "shors-factoring": [
    { kind: "int", key: "bitSize", label: "Bit Size", min: 2, default: 31, help: "Integer ≥ 2" },
    { kind: "int", key: "generator", label: "Generator", min: 2, default: 11, help: "Integer ≥ 2" },
  ],
  "ekera-hastad-factoring": [
    {
      kind: "select",
      key: "rsaInstance",
      label: "RSA Instance",
      options: [
        { value: "rsa-100", label: "RSA-100 (330-bit)" },
        { value: "rsa-1024", label: "RSA-1024 (1024-bit)" },
        { value: "rsa-2048", label: "RSA-2048 (2048-bit)" },
      ],
      default: "rsa-100",
    },
    { kind: "int", key: "generator", label: "Generator", min: 2, default: 7, help: "Integer ≥ 2" },
  ],
  "quantum-dynamics": [
    { kind: "int", key: "latticeN1", label: "Lattice N₁", min: 1, default: 10, help: "Integer ≥ 1" },
    { kind: "int", key: "latticeN2", label: "Lattice N₂", min: 1, default: 10, help: "Integer ≥ 1" },
    {
      kind: "float",
      key: "totalTime",
      label: "Total Time",
      min: 0,
      exclusiveMin: true,
      default: 30.0,
      help: "Greater than 0",
    },
    {
      kind: "float",
      key: "trotterStep",
      label: "Trotter Step",
      min: 0,
      exclusiveMin: true,
      maxFromKey: "totalTime",
      default: 0.9,
      help: "0 < Trotter Step ≤ Total Time",
    },
    { kind: "float", key: "couplingJ", label: "Coupling J", default: 1.0, help: "Any real number" },
    { kind: "float", key: "fieldG", label: "Field g", default: 1.0, help: "Any real number" },
  ],
  "grovers-search": [
    { kind: "int", key: "searchQubits", label: "Search Qubits", min: 1, default: 5, help: "Integer ≥ 1" },
    {
      kind: "computed",
      key: "iterations",
      label: "Iterations",
      note: "Computed from Search Qubits upon estimation",
    },
  ],
  "phase-estimation": [
    { kind: "int", key: "precision", label: "Precision", min: 1, default: 6, help: "Integer ≥ 1" },
    { kind: "int", key: "registerSize", label: "Register Size", min: 1, default: 3, help: "Integer ≥ 1" },
  ],
};

/** Fields the user actually edits (excludes engine-computed read-only fields). */
function editableFields(fields: readonly HyperparamField[]): Exclude<HyperparamField, ComputedField>[] {
  return fields.filter((f): f is Exclude<HyperparamField, ComputedField> => f.kind !== "computed");
}

/** The default value record for one benchmark (computed fields carry no value). */
export function defaultHyperparams(benchmarkId: string): HyperparamValues {
  const fields = BENCHMARK_HYPERPARAMS[benchmarkId as BenchmarkId] ?? [];
  const values: HyperparamValues = {};
  for (const field of editableFields(fields)) {
    values[field.key] = field.default;
  }
  return values;
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
 * Validate one benchmark's hyperparameter values against its schema. Returns a
 * message per invalid field (empty = all valid). Select and computed fields
 * never error; numeric fields check presence, integer-ness, and bounds —
 * including the Trotter Step ≤ Total Time cross-field rule.
 */
export function validateHyperparams(
  benchmarkId: string,
  values: HyperparamValues,
): HyperparamError[] {
  const fields = BENCHMARK_HYPERPARAMS[benchmarkId as BenchmarkId] ?? [];
  const errors: HyperparamError[] = [];

  for (const field of fields) {
    if (field.kind === "computed" || field.kind === "select") continue;

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
      const belowMin = field.exclusiveMin ? n <= field.min : n < field.min;
      if (belowMin) {
        const bound = field.exclusiveMin ? `greater than ${field.min}` : `at least ${field.min}`;
        errors.push({ key: field.key, label: field.label, message: `${field.label} must be ${bound}.` });
        continue;
      }
    }
    if (field.max !== undefined && n > field.max) {
      errors.push({ key: field.key, label: field.label, message: `${field.label} must be at most ${field.max}.` });
      continue;
    }
    if (field.kind === "float" && field.maxFromKey !== undefined) {
      const boundRaw = values[field.maxFromKey];
      const bound = typeof boundRaw === "number" ? boundRaw : Number(boundRaw);
      const boundField = fields.find((f) => f.key === field.maxFromKey);
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
