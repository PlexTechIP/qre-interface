/**
 * Benchmark hyperparameters — the CANONICAL spec, shared by both processes.
 *
 * The renderer builds its form controls from these (see
 * `renderer/constants/hyperparameters.ts`) and the engine adapter turns them
 * into the Q# entry expression it actually runs (see `configToInvocation.ts`).
 * One definition, so a bound or default can never drift between the number the
 * form shows and the number the estimator receives — the failure mode this
 * module was introduced to end.
 *
 * Field sets, bounds, and defaults come from the Features and Fields doc's
 * Application tab (docs/features-and-fields.md § Benchmarks).
 *
 * ## Emitting Q#
 *
 * `parameters` reaches the engine as free-form JSON on a RunConfig, and its
 * values are interpolated into a string the Q# compiler then evaluates. Every
 * value is therefore validated against its spec and re-emitted as a literal:
 * numbers are range-checked and formatted, choices are looked up in a fixed
 * table, and anything unrecognised is refused. A caller-supplied string is
 * never passed through.
 */

import { BENCHMARK_IDS, type BenchmarkId, type HyperparameterValues } from "./types";

interface BaseParam {
  key: string;
  /** Analyst-facing name; used in the form and in validation messages. */
  label: string;
  help?: string;
}

/** A whole-number argument, emitted as a Q# `Int`. */
export interface IntParam extends BaseParam {
  kind: "int";
  /** Inclusive lower bound. */
  min: number;
  /** Inclusive upper bound, if any. */
  max?: number;
  default: number;
}

/** A real-valued argument, emitted as a Q# `Double`. */
export interface DoubleParam extends BaseParam {
  kind: "double";
  min?: number;
  /** When set, `min` is exclusive (value must be strictly greater). */
  exclusiveMin?: boolean;
  max?: number;
  /** Another parameter whose value is this one's inclusive upper bound. */
  maxFromKey?: string;
  default: number;
}

/** A fixed set of choices; the selected option's `literal` is emitted as an `Int`. */
export interface ChoiceParam extends BaseParam {
  kind: "choice";
  options: readonly { value: string; label: string; literal: number }[];
  default: string;
}

/**
 * A value the Q# operation derives from the other arguments (Grover's iteration
 * count). Shown read-only in the form; never passed, never recorded.
 */
export interface ComputedParam extends BaseParam {
  kind: "computed";
  note: string;
}

export type BenchmarkParamSpec =
  | IntParam
  | DoubleParam
  | ChoiceParam
  | ComputedParam;

/** Parameters a user actually supplies (everything but the computed ones). */
export type EditableParamSpec = IntParam | DoubleParam | ChoiceParam;

/** The Q# operation each benchmark's entry expression calls. */
export const BENCHMARK_ENTRY_OPERATION: Record<BenchmarkId, string> = {
  "shors-factoring": "ShorsFactoring.Run",
  "ekera-hastad-factoring": "EkeraHastadFactoring.Run",
  "quantum-dynamics": "QuantumDynamics.Run",
  "grovers-search": "GroversSearch.Run",
  "phase-estimation": "PhaseEstimation.Run",
};

/**
 * Each benchmark's parameters IN THE ARGUMENT ORDER of its Q# entry operation.
 * Reordering this list changes which value lands in which argument, so it must
 * stay in step with the corresponding `.qs` signature.
 */
export const BENCHMARK_PARAMS: Record<BenchmarkId, readonly BenchmarkParamSpec[]> = {
  "shors-factoring": [
    { kind: "int", key: "bitSize", label: "Bit Size", min: 2, default: 31, help: "Integer ≥ 2" },
    { kind: "int", key: "generator", label: "Generator", min: 2, default: 11, help: "Integer ≥ 2" },
  ],
  "ekera-hastad-factoring": [
    {
      kind: "choice",
      key: "rsaInstance",
      label: "RSA Instance",
      options: [
        { value: "rsa-100", label: "RSA-100 (330-bit)", literal: 330 },
        { value: "rsa-1024", label: "RSA-1024 (1024-bit)", literal: 1024 },
        { value: "rsa-2048", label: "RSA-2048 (2048-bit)", literal: 2048 },
      ],
      default: "rsa-100",
    },
    { kind: "int", key: "generator", label: "Generator", min: 2, default: 7, help: "Integer ≥ 2" },
  ],
  "quantum-dynamics": [
    { kind: "int", key: "latticeN1", label: "Lattice N₁", min: 1, default: 10, help: "Integer ≥ 1" },
    { kind: "int", key: "latticeN2", label: "Lattice N₂", min: 1, default: 10, help: "Integer ≥ 1" },
    {
      kind: "double",
      key: "totalTime",
      label: "Total Time",
      min: 0,
      exclusiveMin: true,
      default: 30.0,
      help: "Greater than 0",
    },
    {
      kind: "double",
      key: "trotterStep",
      label: "Trotter Step",
      min: 0,
      exclusiveMin: true,
      maxFromKey: "totalTime",
      default: 0.9,
      help: "0 < Trotter Step ≤ Total Time",
    },
    { kind: "double", key: "couplingJ", label: "Coupling J", default: 1.0, help: "Any real number" },
    { kind: "double", key: "fieldG", label: "Field g", default: 1.0, help: "Any real number" },
  ],
  "grovers-search": [
    {
      kind: "int",
      key: "searchQubits",
      label: "Search Qubits",
      min: 1,
      default: 5,
      help: "Integer ≥ 1",
    },
    {
      kind: "computed",
      key: "iterations",
      label: "Iterations",
      note: "Computed from Search Qubits upon estimation",
    },
  ],
  "phase-estimation": [
    { kind: "int", key: "precision", label: "Precision", min: 1, default: 6, help: "Integer ≥ 1" },
    {
      kind: "int",
      key: "registerSize",
      label: "Register Size",
      min: 1,
      default: 3,
      help: "Integer ≥ 1",
    },
  ],
};

function isBenchmarkId(value: string): value is BenchmarkId {
  return (BENCHMARK_IDS as readonly string[]).includes(value);
}

/** The parameters a user supplies, in argument order. */
export function editableParams(benchmarkId: string): readonly EditableParamSpec[] {
  if (!isBenchmarkId(benchmarkId)) return [];
  return BENCHMARK_PARAMS[benchmarkId].filter(
    (param): param is EditableParamSpec => param.kind !== "computed",
  );
}

/** Every editable parameter's default, as a recordable value map. */
export function defaultBenchmarkParameters(benchmarkId: string): HyperparameterValues {
  const values: HyperparameterValues = {};
  for (const param of editableParams(benchmarkId)) {
    values[param.key] = param.default;
  }
  return values;
}

export type EntryExprResult =
  | { ok: true; entryExpr: string }
  | { ok: false; message: string };

function invalid(message: string): EntryExprResult {
  return { ok: false, message };
}

/**
 * Format a Q# `Double` literal. `String(30)` yields "30", which Q# reads as an
 * `Int` and rejects with a type mismatch, so a whole number gains an explicit
 * ".0". Exponent forms ("1e-7") are already valid Q# and pass through.
 */
export function qsharpDouble(value: number): string {
  const text = String(value);
  return text.includes(".") || text.includes("e") || text.includes("E")
    ? text
    : `${text}.0`;
}

/**
 * Resolve one parameter to its Q# literal, or explain why it cannot be emitted.
 * `siblings` carries the benchmark's other effective numeric values, which the
 * cross-field `maxFromKey` bounds are checked against.
 */
function literalFor(
  param: EditableParamSpec,
  values: HyperparameterValues,
  siblings: Map<string, number>,
): { ok: true; literal: string } | { ok: false; message: string } {
  const raw = values[param.key] ?? param.default;

  if (param.kind === "choice") {
    const option = param.options.find((o) => o.value === raw);
    if (!option) {
      const allowed = param.options.map((o) => o.value).join(", ");
      return {
        ok: false,
        message: `${param.label} must be one of: ${allowed}. Got ${JSON.stringify(raw)}.`,
      };
    }
    return { ok: true, literal: String(option.literal) };
  }

  if (typeof raw !== "number") {
    return {
      ok: false,
      message: `${param.label} must be a number, got ${JSON.stringify(raw)}.`,
    };
  }
  if (!Number.isFinite(raw)) {
    return { ok: false, message: `${param.label} must be a finite number, got ${raw}.` };
  }

  if (param.kind === "int") {
    if (!Number.isInteger(raw)) {
      return { ok: false, message: `${param.label} must be a whole number, got ${raw}.` };
    }
    if (raw < param.min) {
      return { ok: false, message: `${param.label} must be at least ${param.min}, got ${raw}.` };
    }
    if (param.max !== undefined && raw > param.max) {
      return { ok: false, message: `${param.label} must be at most ${param.max}, got ${raw}.` };
    }
    return { ok: true, literal: String(raw) };
  }

  if (param.min !== undefined) {
    const belowMin = param.exclusiveMin ? raw <= param.min : raw < param.min;
    if (belowMin) {
      const bound = param.exclusiveMin
        ? `greater than ${param.min}`
        : `at least ${param.min}`;
      return { ok: false, message: `${param.label} must be ${bound}, got ${raw}.` };
    }
  }
  if (param.max !== undefined && raw > param.max) {
    return { ok: false, message: `${param.label} must be at most ${param.max}, got ${raw}.` };
  }
  if (param.maxFromKey !== undefined) {
    // Bound against the value the engine will actually use for the referenced
    // parameter, which is its default when the config omitted it.
    const bound = siblings.get(param.maxFromKey);
    if (bound !== undefined && raw > bound) {
      return {
        ok: false,
        message: `${param.label} must be at most ${bound}, got ${raw}.`,
      };
    }
  }
  return { ok: true, literal: qsharpDouble(raw) };
}

/**
 * The effective numeric value of every numeric parameter in one benchmark:
 * what was recorded, or the spec default when it was omitted. Backs the
 * cross-field `maxFromKey` bounds.
 */
function effectiveNumbers(
  params: readonly EditableParamSpec[],
  values: HyperparameterValues,
): Map<string, number> {
  const effective = new Map<string, number>();
  for (const param of params) {
    if (param.kind === "choice") continue;
    const raw = values[param.key] ?? param.default;
    if (typeof raw === "number" && Number.isFinite(raw)) {
      effective.set(param.key, raw);
    }
  }
  return effective;
}

/**
 * Build the Q# entry expression for a benchmark run: the entry operation
 * applied to the recorded hyperparameters, with spec defaults filling anything
 * the config omitted. Fails with an analyst-facing message when a recorded
 * value is outside its spec, rather than emitting an expression the compiler
 * would reject (or, worse, one it would accept as something else).
 */
export function buildBenchmarkEntryExpr(
  benchmarkId: string,
  parameters: HyperparameterValues | undefined,
): EntryExprResult {
  if (!isBenchmarkId(benchmarkId)) {
    return invalid(`Unknown benchmark id "${benchmarkId}".`);
  }
  const values = parameters ?? {};
  const params = editableParams(benchmarkId);
  const siblings = effectiveNumbers(params, values);
  const args: string[] = [];
  for (const param of params) {
    const resolved = literalFor(param, values, siblings);
    if (!resolved.ok) return invalid(resolved.message);
    args.push(resolved.literal);
  }
  return {
    ok: true,
    entryExpr: `${BENCHMARK_ENTRY_OPERATION[benchmarkId]}(${args.join(", ")})`,
  };
}
