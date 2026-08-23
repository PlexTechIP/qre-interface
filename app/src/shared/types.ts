/**
 * Contract types — RunConfig & RunResult (v1.4.0).
 *
 * CANONICAL, PM-owned, frozen with the schemas in this folder. Import these
 * types (copy this file into your workspace verbatim until the shared app
 * scaffold wires it in) — NEVER re-declare contract shapes locally. If a field
 * here and a schema ever disagree, the schema wins and the mismatch is a bug:
 * report it in the channel.
 *
 * Changes only via the contract-change process (docs/engineering-workflow.md).
 *
 * v1.4.0 (ADDITIVE, backward-compatible — every v1.3.0 record is already a
 * valid v1.4.0 record, which is why `upgradeRunConfig` gains no branch):
 *
 *  - `traceTransform` gains two OPTIONAL pipeline stages, `dynamicMemoryCompute`
 *    and `unmemory`, making the full ordered pipeline
 *    `DynamicMemoryCompute × PSSPC × LatticeSurgery × Unmemory`. An off stage is
 *    ABSENT, never present at its defaults — see `TraceTransform`.
 *  - Majorana gains optional `tErrorRate` and `targetYear`; Neutral Atom gains
 *    optional `dataQubitSpacing` and `targetYear`. All four are optional, and
 *    omitting one means "let qdk use its own default" — which is exactly what
 *    every record written before this version did.
 *  - `provenance` records whether a model helped author the configuration. It
 *    exists because `RunConfig` is `additionalProperties: false`, so an audit
 *    trail for model-assisted runs was impossible to add later without another
 *    contract change.
 *
 * Restored to the spec by the Jul 31 Config Descriptions tab. Two of the four
 * QPU parameters (`targetYear` on both architectures) are INERT on our pipeline:
 * qdk consumes a target year only through a trace transform that takes one, and
 * ours does not. They are recorded, not influential, and any UI exposing them
 * must say so.
 *
 * v1.3.0 (BREAKING, one field): `traceTransform` becomes a single object
 * carrying both pipeline stages' parameters — { tStatesPerRotation,
 * ccxMagicStates, slowDownFactor } — instead of a `psspc` | `latticeSurgery`
 * discriminated union. The union claimed the analyst picks one transform; qdk
 * always runs both, no UI control ever set the discriminant, and the
 * latticeSurgery branch silently discarded the PSSPC values the form collected.
 *
 * This landed alongside v1.2.0's factory change rather than inside it: two
 * different breaking shapes must never both answer to "1.2.0", or a record's
 * version stops identifying its shape. Records saved under any earlier version
 * are read back through `upgradeRunConfig`, which now absorbs BOTH differences.
 *
 * v1.2.0 (BREAKING — reshapes one existing field): `magicStateFactory:
 * MagicStateFactoryId` becomes `magicStateFactories: MagicStateFactoryId[]`,
 * the multi-select the spec always called for and v1.1.0 deferred. The set is
 * non-empty and unique; every member must be allowed on the chosen architecture
 * (see `isMagicStateFactoryAllowed`). The engine unions the selected factories
 * into ONE ISA query, so a multi-select run returns a single Pareto frontier
 * explored across all of them — not one frontier per factory.
 *
 * Records saved under 1.0.0/1.1.0 carry the old singular field. They are read
 * back through `upgradeRunConfig`, which lifts it to a one-element set and
 * LEAVES `schemaVersion` alone, so a record keeps saying which version
 * configured it. Nothing rewrites stored rows in place.
 *
 * v1.1.0 (additive, backward-compatible): Neutral Atom architecture; Low-Move
 * Surface Code QEC (paired with Neutral Atom); GSJ24 / GSJ24 CCX / Magic
 * Up-to-Clifford factory values; secondary factories and memory optimization as
 * optional sets; an optional `parameters` field carrying benchmark
 * hyperparameters; Litinski19 availability widened to Neutral Atom.
 */

/**
 * Every contract version this build can READ. New records are always stamped
 * with SCHEMA_VERSION; older values appear only on records loaded from the store.
 */
export const SCHEMA_VERSIONS = ["1.0.0", "1.1.0", "1.2.0", "1.3.0", "1.4.0"] as const;
export type SchemaVersion = (typeof SCHEMA_VERSIONS)[number];

/** Contract version stamped into every RunConfig and RunResult written today. */
export const SCHEMA_VERSION: SchemaVersion = "1.4.0";
 
// ---------------------------------------------------------------------------
// RunConfig — what a configured run looks like going in (Team 1 → engine)
// ---------------------------------------------------------------------------
 
export const BENCHMARK_IDS = [
  "shors-factoring",
  "ekera-hastad-factoring",
  "quantum-dynamics",
  "grovers-search",
  "phase-estimation",
] as const;
export type BenchmarkId = (typeof BENCHMARK_IDS)[number];
 
export const UPLOADED_PROGRAM_FORMATS = ["qsharp", "openqasm", "qir"] as const;
export type UploadedProgramFormat = (typeof UPLOADED_PROGRAM_FORMATS)[number];
 
export interface BenchmarkApplication {
  type: "benchmark";
  /** A benchmark id from contracts/benchmarks.json. */
  benchmarkId: string;
}
 
export interface UploadedApplication {
  type: "uploaded";
  /** Absolute or app-resolved path selected by the user. */
  filePath: string;
  format: UploadedProgramFormat;
  /** Mirrors the "Add Program" option in the upload flow. */
  addToLibrary: boolean;
}
 
/**
 * Manual Logical Counts — a program described directly by its logical resource
 * counts, with no source file. The seven fields map one-to-one onto qdk's
 * `LogicalCounts` keys; the engine builds a `QSharpApplication` whose
 * `entry_expr` is that `LogicalCounts`, skipping Q# compilation entirely.
 * All counts are non-negative integers; numQubits is >= 1 and rotationDepth is
 * bounded by rotationCount (0 <= rotationDepth <= rotationCount).
 */
export interface ManualCountsApplication {
  type: "manualCounts";
  /** Number of Qubits — integer >= 1. */
  numQubits: number;
  /** T Count — integer >= 0. */
  tCount: number;
  /** Rotation Count — integer >= 0. */
  rotationCount: number;
  /** Rotation Depth — integer, 0 <= rotationDepth <= rotationCount. */
  rotationDepth: number;
  /** CCZ Count — integer >= 0. */
  cczCount: number;
  /** CCiX Count — integer >= 0. */
  ccixCount: number;
  /** Measurement Count — integer >= 0. */
  measurementCount: number;
}
 
export type Application =
  | BenchmarkApplication
  | UploadedApplication
  | ManualCountsApplication;
 
export const ARCHITECTURE_TYPES = [
  "gateBased",
  "majorana",
  "neutralAtom",
] as const;
export type ArchitectureType = (typeof ARCHITECTURE_TYPES)[number];
 
export interface GateBasedArchitecture {
  type: "gateBased";
  /** Default UI value: 1e-4. Valid range: 0 < errorRate < 0.01. */
  errorRate: number;
  /** Nanoseconds. Required; no UI default. */
  gateTime: number;
  /** Nanoseconds. Required; no UI default. */
  measurementTime: number;
  /** Nanoseconds. Optional; null means use the engine/default model. */
  twoQubitGateTime?: number | null;
}
 
export interface MajoranaArchitecture {
  type: "majorana";
  /** UI select value: 1e-4, 1e-5, or 1e-6. Default UI value: 1e-5. */
  errorRate: 0.0001 | 0.00001 | 0.000001;
  /** Nanoseconds. Default UI value: 1000. */
  operationTime: number;
  /**
   * T Error Rate (v1.4.0). Optional; 0 < x <= 0.05. OMITTED means qdk derives it
   * from `errorRate`, which is what every pre-v1.4.0 record did.
   */
  tErrorRate?: number;
  /**
   * Target Year (v1.4.0). Optional; integer >= 0. **INERT on our pipeline** —
   * qdk reads a target year only through a trace transform that accepts one, and
   * ours does not. Recorded, not influential; label it as such wherever it is
   * shown.
   */
  targetYear?: number;
}
 
/**
 * Neutral Atom architecture (v1.1.0). Field set, ranges, and defaults per the
 * Features and Fields Google Doc's QPU Specification tab. Unlike GateBased,
 * every field has a UI default, so none is nullable at the contract level. The
 * three error rates each fall in [0, 0.01); times are integer nanoseconds; the
 * two Surface Code time factors are integers >= 1 and feed the Low-Move Surface
 * Code pairing. Pairs with qecCode "low_move_surface_code".
 */
export interface NeutralAtomArchitecture {
  type: "neutralAtom";
  /** Rydberg Time (ns) — integer > 0. Default 500. */
  rydbergTime: number;
  /** Rydberg Error — float [0, 0.01). Default 1e-3. */
  rydbergError: number;
  /** Single-Qubit Time (ns) — integer > 0. Default 1000. */
  singleQubitTime: number;
  /** Single-Qubit Error — float [0, 0.01). Default 1e-4. */
  singleQubitError: number;
  /** Measurement Time (ns) — integer > 0. Default 10000. */
  measurementTime: number;
  /** Measurement Error — float [0, 0.01). Default 1e-4. */
  measurementError: number;
  /** Handoff Time (ns) — integer >= 0. Default 0. */
  handoffTime: number;
  /** Atom Spacing (µm) — float > 0. Default 3.0. */
  atomSpacing: number;
  /**
   * Data Qubit Spacing (µm) (v1.4.0). Optional; float > 0. OMITTED means qdk's
   * own default of 12.0 — which is what every pre-v1.4.0 record ran with.
   * Measured bit-identical across 6.0 / 12.0 / 30.0 on our pipeline as of qdk
   * 1.30.0, so treat it as recorded-not-yet-influential until re-measured.
   */
  dataQubitSpacing?: number;
  /** Max Velocity (m/s) — float > 0. Default 0.25. */
  maxVelocity: number;
  /** Max Acceleration (m/s²) — float > 0. Default 5000.0. */
  maxAcceleration: number;
  /** Surface Code Single-Qubit Time Factor — integer >= 1. Default 1. */
  surfaceCodeOneQubitTimeFactor: number;
  /** Surface Code Two-Qubit Time Factor — integer >= 1. Default 1. */
  surfaceCodeTwoQubitTimeFactor: number;
  /**
   * Target Year (v1.4.0). Optional; integer >= 0. **INERT on our pipeline**, for
   * the same reason as Majorana's — recorded, not influential.
   */
  targetYear?: number;
}
 
export type Architecture =
  | GateBasedArchitecture
  | MajoranaArchitecture
  | NeutralAtomArchitecture;
 
export const QEC_CODE_IDS = [
  "surface_code",
  "three_aux",
  "low_move_surface_code",
] as const;
export type QecCodeId = (typeof QEC_CODE_IDS)[number];
 
/**
 * QEC code is derived from the architecture, one-to-one:
 *   gateBased   -> surface_code
 *   majorana    -> three_aux
 *   neutralAtom -> low_move_surface_code   (v1.1.0)
 * The switch is exhaustive over ArchitectureType; adding an architecture without
 * a pairing here is a compile error, which is the point.
 */
export function expectedQecCode(architecture: Architecture): QecCodeId {
  switch (architecture.type) {
    case "gateBased":
      return "surface_code";
    case "majorana":
      return "three_aux";
    case "neutralAtom":
      return "low_move_surface_code";
  }
}
 
export const MAGIC_STATE_FACTORY_IDS = [
  "round_based",
  "litinski19",
  "gsj24",
] as const;
export type MagicStateFactoryId = (typeof MAGIC_STATE_FACTORY_IDS)[number];
 
/**
 * Secondary factories (v1.1.0) — an optional, independent set layered on top of
 * the primary magic-state factory. Empty by default. `magic_up_to_clifford` is
 * incompatible with Majorana; `gsj24_ccx` is bound to the PSSPC ccxMagicStates
 * flag (turning either on turns the other on).
 */
export const SECONDARY_FACTORY_IDS = [
  "magic_up_to_clifford",
  "gsj24_ccx",
] as const;
export type SecondaryFactoryId = (typeof SECONDARY_FACTORY_IDS)[number];
 
/**
 * Memory optimization (v1.1.0) — optional; "none" is the default. The two yoked
 * codes trade compute for a smaller memory footprint.
 *
 * RECORDED ONLY, AND THE UI SAYS SO. This field does not reach the engine, and
 * wiring it up would not change any estimate: `OneDimensionalYokedSurfaceCode`
 * and `TwoDimensionalYokedSurfaceCode` are ISATransforms that PROVIDE a MEMORY
 * instruction, and nothing in this pipeline demands one. MEMORY demand comes
 * only from READ_FROM_MEMORY / WRITE_TO_MEMORY trace gates, emitted either by
 * the `DynamicMemoryCompute` trace transform (deliberately excluded — see
 * features-and-fields.md § Teams TO-DO) or by LogicalCounts keys this contract
 * does not carry (numComputeQubits, readFromMemoryCount, writeToMemoryCount).
 * Measured on qdk 1.30.0: layering either yoked code onto the ISA query returns
 * byte-identical estimates. The form's control is disabled and explains this;
 * `memoryOptimization.test.ts` holds the claim to account.
 */
export const MEMORY_OPTIMIZATION_IDS = [
  "none",
  "yoked_1d",
  "yoked_2d",
] as const;
export type MemoryOptimizationId = (typeof MEMORY_OPTIMIZATION_IDS)[number];
 
/**
 * Litinski19 availability (v1.1.0, widened per spec). Allowed on:
 *   - Superconducting (gateBased) with errorRate <= 1e-3, or
 *   - Neutral Atom with rydbergError, singleQubitError, measurementError
 *     all <= 1e-3.
 * Majorana never qualifies.
 */
export function isLitinski19Allowed(architecture: Architecture): boolean {
  if (architecture.type === "gateBased") {
    return architecture.errorRate <= 0.001;
  }
  if (architecture.type === "neutralAtom") {
    return (
      architecture.rydbergError <= 0.001 &&
      architecture.singleQubitError <= 0.001 &&
      architecture.measurementError <= 0.001
    );
  }
  return false;
}
 
/**
 * GSJ24 availability (v1.1.0, per spec). Allowed on:
 *   - Superconducting (gateBased) with errorRate <= 1e-3, or
 *   - Neutral Atom with rydbergError <= 1e-3 and both singleQubitError and
 *     measurementError < 1e-2 (looser than Litinski19's Neutral Atom rule).
 * Majorana never qualifies.
 */
export function isGsj24Allowed(architecture: Architecture): boolean {
  if (architecture.type === "gateBased") {
    return architecture.errorRate <= 0.001;
  }
  if (architecture.type === "neutralAtom") {
    return (
      architecture.rydbergError <= 0.001 &&
      architecture.singleQubitError < 0.01 &&
      architecture.measurementError < 0.01
    );
  }
  return false;
}
 
/**
 * Is one primary factory allowed on this architecture? round_based always is;
 * the other two delegate to the predicates above. This is the single rule the
 * form, the serializer, the schema and the engine adapter all answer to.
 */
export function isMagicStateFactoryAllowed(
  factory: MagicStateFactoryId,
  architecture: Architecture,
): boolean {
  switch (factory) {
    case "round_based":
      return true;
    case "litinski19":
      return isLitinski19Allowed(architecture);
    case "gsj24":
      return isGsj24Allowed(architecture);
  }
}

/**
 * Every factory selectable on this architecture, in contract order. Never empty:
 * round_based qualifies everywhere, which is what keeps the non-empty-set
 * invariant satisfiable no matter how the architecture changes under the user.
 */
export function allowedMagicStateFactories(
  architecture: Architecture,
): MagicStateFactoryId[] {
  return MAGIC_STATE_FACTORY_IDS.filter((id) =>
    isMagicStateFactoryAllowed(id, architecture),
  );
}

/**
 * The trace transform (v1.3.0). PSSPC and Lattice Surgery are stages of one
 * pipeline that always both run, not alternatives — see traceTransform.ts for
 * the shape, the defaults, and the pre-v1.3.0 read path. The v1.0.0–v1.2.0
 * `psspc` | `latticeSurgery` union is gone from the type surface; it survives
 * only as an input `parseTraceTransform` still accepts.
 */
import { normalizeTraceTransform, type TraceTransform } from "./traceTransform";

export {
  DEFAULT_TRACE_TRANSFORM,
  describeTraceTransform,
  normalizeTraceTransform,
  parseTraceTransform,
  type TraceTransform,
} from "./traceTransform";
 
/**
 * Benchmark hyperparameter values carried on the config (v1.1.0). A flat map of
 * parameter key -> value for the selected benchmark (e.g. bitSize, generator,
 * searchQubits). These ARE inputs to the estimate: the engine turns them into
 * the arguments of the benchmark's Q# entry operation, so they size the circuit
 * that gets traced. Values are validated against the shared spec
 * (shared/benchmarkParams.ts) before they reach the compiler; an omitted key
 * means "use that parameter's default", which is what the engine then runs.
 * Absent/empty when the application is not a benchmark.
 */
export type HyperparameterValues = Record<string, number | string>;
 
export const CONFIG_AUTHORS = ["human", "model_assisted"] as const;
export type ConfigAuthor = (typeof CONFIG_AUTHORS)[number];

/**
 * Run provenance (v1.4.0) — whether a model helped author the configuration.
 *
 * Deliberately minimal. It records THAT a model was involved and optionally
 * WHICH one; it never records the prompt. Prompts are user content, the store is
 * local and unencrypted, and "what did you ask it" is not a question a run
 * record should be able to answer. The schema is closed, so a prompt cannot be
 * added by a well-meaning producer either.
 */
export interface RunProvenance {
  authoredBy: ConfigAuthor;
  /** Provider/model identifier, informational and free-form. Never the prompt. */
  model?: string;
}

export interface RunConfig {
  schemaVersion: SchemaVersion;
  /** UUID v4, stamped at Run-click (not while editing). */
  id: string;
  /** User-editable label; auto-derived and serialized when the user leaves it blank. */
  name: string;
  /** ISO 8601 UTC, stamped at Run-click. */
  createdAt: string;
  application: Application;
  architecture: Architecture;
  /** Derived from architecture: GateBased -> surface_code; Majorana -> three_aux. */
  qecCode: QecCodeId;
  /**
   * Primary magic-state factories (v1.2.0) — a NON-EMPTY, unique set. Defaults
   * to ["round_based"]; litinski19 and gsj24 may join it only on qualifying
   * architectures (see isMagicStateFactoryAllowed). Majorana admits round_based
   * alone, so its set is always exactly ["round_based"].
   *
   * The engine unions the set into one ISA query, so selecting several factories
   * asks "explore all of these and give me the combined frontier" — the result
   * is one frontier whose rows may come from different factories, each row
   * naming its own under `additional.magicStateFactory`.
   */
  magicStateFactories: MagicStateFactoryId[];
  /**
   * Secondary factories (v1.1.0). Optional; omitted or [] means none. Multi-select
   * set, independent of the primary factories. Absent on v1.0.0 records.
   */
  secondaryFactories?: SecondaryFactoryId[];
  /**
   * Memory optimization (v1.1.0). Optional; omitted is equivalent to "none".
   * Absent on v1.0.0 records.
   */
  memoryOptimization?: MemoryOptimizationId;
  traceTransform: TraceTransform;
  /**
   * Benchmark hyperparameter values (v1.1.0). Optional; present only for
   * benchmark applications. Drives the estimate — see HyperparameterValues.
   */
  parameters?: HyperparameterValues;
  /**
   * How this configuration was authored (v1.4.0). Optional; ABSENT means
   * human-authored, which is what every record written before this version was.
   *
   * This is an audit field, not a feature flag: it answers "which of these
   * estimates had a model in the loop?" and nothing else reads it to decide
   * behaviour. It travels with Rerun, because a configuration a model drafted is
   * still a configuration a model drafted after a human re-runs it.
   */
  provenance?: RunProvenance;
  /** Cap on total logical error probability. Valid range: 0 < maxError <= 1. */
  maxError: number;
  /**
   * The bundled engine version shown to the user at configuration time —
   * INFORMATIONAL. `RunResult.qreVersion` is the authoritative record of what
   * actually executed; the engine does not reject on mismatch.
   */
  qreVersion: string;
}
 
// ---------------------------------------------------------------------------
// RunResult — what comes out (engine → Team 2)
// ---------------------------------------------------------------------------
 
/**
 * One displayable result field. `display` is the producer's human-friendly
 * rendering; consumers may show it but never parse it. Numeric fields use a
 * numeric `value`; non-numeric appendix fields may use strings/booleans/etc.
 */
export interface FieldMetric<TValue = unknown> {
  value: TValue;
  unit: string;
  display: string;
}
 
export type NumericMetric = FieldMetric<number>;
 
export interface FactoryUse {
  /** Magic-state type, for example "T" or "CCX". */
  stateType: string;
  /** Number of factory copies of this state type used at the frontier point. */
  copies: number;
}
 
export type FactoryMetric = FieldMetric<FactoryUse[]>;
 
export const DEFAULT_RESULT_FIELD_KEYS = [
  "physicalQubits",
  "runtime",
  "logicalCycleTime",
  "factories",
  "totalError",
  "codeDistance",
] as const;
export type DefaultResultFieldKey = (typeof DEFAULT_RESULT_FIELD_KEYS)[number];
 
export const RESULT_FIELD_KEYS = [
  "physicalQubits",
  "runtime",
  "totalError",
  "factories",
  "source",
  "physicalComputeQubits",
  "physicalFactoryQubits",
  "physicalMemoryQubits",
  "logicalComputeQubits",
  "logicalMemoryQubits",
  "algorithmComputeQubits",
  "algorithmMemoryQubits",
  "logicalCycleTime",
  "codeCycleTime",
  "runtimeSingleShot",
  "expectedShots",
  "evaluationTime",
  "codeDistance",
  "numTsPerRotation",
  "blockSize",
  "feasibility",
  "loss",
  "targetYear",
  "name",
  "assumptions",
  "baseSystemCost",
  "shotCost",
  "costPerQubit",
  "costPerHour",
  "costPerQubitPerHour",
  "atomSpacing",
  "dataQubitSpacing",
  "velocity",
  "acceleration",
  "surfaceCodeOneQubitTimeFactor",
  "surfaceCodeTwoQubitTimeFactor",
  "molecule",
] as const;
export type ResultFieldKey = (typeof RESULT_FIELD_KEYS)[number];
 
export interface FrontierRow {
  physicalQubits: NumericMetric;
  runtime: NumericMetric;
  logicalCycleTime: NumericMetric;
  factories: FactoryMetric;
  totalError: NumericMetric;
  codeDistance: NumericMetric;
  /** Optional fields reported for this row, keyed by RESULT_FIELD_KEYS where possible. */
  additional?: Record<string, FieldMetric>;
}
 
/**
 * Canonical error codes the engine emits (docs/data-contracts.md documents
 * when each fires). `RunError.code` is typed `string`, not this union: new
 * codes may be added by future contract versions, and consumers must render
 * unknown codes gracefully rather than crash.
 */
export const ERROR_CODES = [
  "INVALID_CONFIG",
  "COMPILE_ERROR",
  "ESTIMATION_FAILED",
  "TIMEOUT",
  "ENGINE_CRASH",
] as const;
export type KnownErrorCode = (typeof ERROR_CODES)[number];
 
export interface RunError {
  /** One of ERROR_CODES from conformant producers; consumers tolerate unknown strings. */
  code: string;
  /** Analyst-facing explanation with a suggested next step. */
  message: string;
}
 
export interface RunResult {
  schemaVersion: SchemaVersion;
  /** Matches the RunConfig.id that produced this result. */
  runId: string;
  /** The ONLY flow control — never infer failure from missing fields. */
  status: "succeeded" | "failed";
  /** null on success; populated on failure. */
  error: RunError | null;
  /** Pareto frontier rows; null on failure. */
  frontier: FrontierRow[] | null;
  /**
   * The COMPLETE, unmodified engine output — verbatim, schema-less; its shape
   * varies by config and QRE version. null ONLY on failure when the engine
   * produced no output at all (TIMEOUT, ENGINE_CRASH); structured engine
   * diagnostics, when they exist, appear here verbatim.
   */
  raw: Record<string, unknown> | null;
  /** Engine version that ACTUALLY executed, self-reported at runtime. Authoritative. */
  qreVersion: string;
  startedAt: string;
  completedAt: string;
}
 
/** Narrowing helper: does this result carry displayable frontier rows? */
export function isSucceeded(
  result: RunResult,
): result is RunResult & { status: "succeeded"; error: null; frontier: FrontierRow[]; raw: Record<string, unknown> } {
  return result.status === "succeeded" && result.error === null && result.frontier !== null && result.raw !== null;
}
 
// ---------------------------------------------------------------------------
// The estimation boundary (renderer ⇄ main process)
// ---------------------------------------------------------------------------
 
/**
 * The ONE interface UI code talks to. Week 2: `MockEngine implements
 * EstimatorService` (Team 1 builds it to the spec in their technical brief).
 * Week 3: Team 3's `QreEngine implements EstimatorService` swaps in behind the
 * same signature.
 *
 * `run()` RESOLVES with a failed RunResult on engine failure — it rejects only
 * on programmer error (e.g. schema-invalid input reaching the boundary).
 * Week 3+: `cancel(runId)` / `onProgress(...)` will be added via contract
 * change when scheduled — do not build them speculatively.
 */
export interface EstimatorService {
  run(config: RunConfig): Promise<RunResult>;
}
 
// ---------------------------------------------------------------------------
// The Results seam (Team 1 ⇄ Team 2) — canonical prop contract
// ---------------------------------------------------------------------------
 
/**
 * Parent-owned rendering phase for the Results surface. Deliberately coarse:
 * `done` covers BOTH succeeded and failed runs — the Results surface reads
 * `result.status` to pick its success or failure rendering. (Producers may
 * track a richer internal lifecycle; it must collapse to this at the seam.)
 */
export type ResultsPhase = "idle" | "running" | "done";
 
/**
 * The exact props of the Results surface (Team 2's component). Team 1's parent
 * supplies them; Team 2 renders EVERY state from them — empty, running,
 * success, AND failure. Retry/edit-config affordances after a failure live in
 * Team 1's chrome around the surface, driven by the same `result.status`.
 */
export interface ResultsAreaProps {
  result: RunResult | null;
  phase: ResultsPhase;
  /** The producing config, for the configuration summary. Pass it when available. */
  config?: RunConfig | null;
}
 
// ---------------------------------------------------------------------------
// RunRecord — an immutable saved run (Part 2: persistence, history, rerun)
// ---------------------------------------------------------------------------
 
/**
 * A saved run: the producing RunConfig, its RunResult, and when it was
 * persisted. IMMUTABLE — a record is never edited after it is written; to
 * iterate on a run you Rerun it, which produces a NEW record with a new id.
 *
 * `id` is the run's UUID; it equals `config.id` AND `result.runId` (the record
 * IS one run). The run's launch time and the engine version that executed are
 * NOT duplicated here — they live on `config.createdAt` and the authoritative
 * `result.qreVersion`, so no copy can drift out of sync. Query helpers derive
 * every filterable value from `config`/`result`.
 */
export interface RunRecord {
  schemaVersion: SchemaVersion;
  /** The run's UUID — equals config.id and result.runId. The record's stable key. */
  id: string;
  config: RunConfig;
  result: RunResult;
  /** ISO 8601 UTC, stamped when the record is persisted. */
  savedAt: string;
}
 
/**
 * Assemble an immutable RunRecord from a finished run. THROWS on a mismatched
 * (config, result) pair — `result.runId` MUST equal `config.id`, or these did
 * not come from the same run. This is the sanctioned way to mint a record; the
 * save-after-run trigger (week 4) calls it. `savedAt` is passed in (ISO 8601
 * UTC) so the function stays pure and testable.
 */
export function makeRunRecord(config: RunConfig, result: RunResult, savedAt: string): RunRecord {
  if (result.runId !== config.id) {
    throw new Error(
      `RunRecord mismatch: result.runId (${result.runId}) !== config.id (${config.id}) — not the same run.`,
    );
  }
  return { schemaVersion: SCHEMA_VERSION, id: config.id, config, result, savedAt };
}
 
/**
 * Reading a record saved before v1.3.0.
 *
 * Two shape differences have to be absorbed, and this is the one place that
 * knows about either:
 *
 *  - v1.2.0 turned a singular `magicStateFactory` into the `magicStateFactories`
 *    set. A pre-1.2.0 record is lifted to a one-element set.
 *  - v1.3.0 turned the `psspc` | `latticeSurgery` `traceTransform` union into
 *    one pipeline object. A pre-1.3.0 record is read through
 *    `normalizeTraceTransform`, which resolves either legacy variant to the
 *    parameters that variant actually ran.
 *
 * `schemaVersion` is deliberately LEFT AS SAVED — a run configured under 1.1.0
 * must keep saying 1.1.0 in History and in exports; claiming a later version
 * would be a lie about what the user actually chose.
 *
 * Pure and idempotent: a record already in v1.3.0 shape passes through as-is.
 * Applied at the store's read boundary, so nothing downstream needs to know
 * several shapes exist. Nothing rewrites stored JSON in place.
 */
export function upgradeRunConfig(config: RunConfig): RunConfig {
  const needsFactorySet = !Array.isArray(config.magicStateFactories);
  // The union carried a discriminant; the pipeline object has none.
  const needsPipeline =
    typeof config.traceTransform === "object" &&
    config.traceTransform !== null &&
    "type" in config.traceTransform;

  if (!needsFactorySet && !needsPipeline) return config;

  const { magicStateFactory: legacyFactory, ...rest } = config as RunConfig & {
    magicStateFactory?: MagicStateFactoryId;
  };

  return {
    ...rest,
    magicStateFactories: needsFactorySet
      ? [legacyFactory ?? "round_based"]
      : config.magicStateFactories,
    traceTransform: needsPipeline
      ? normalizeTraceTransform(config.traceTransform)
      : config.traceTransform,
  };
}

/** `upgradeRunConfig` applied to a record's config. Pure; idempotent. */
export function upgradeRunRecord(record: RunRecord): RunRecord {
  const config = upgradeRunConfig(record.config);
  return config === record.config ? record : { ...record, config };
}

/**
 * Application type for RunSummary — exposed to the MCP server and agents.
 * Uploaded applications deliberately omit the filePath (data-egress risk).
 * The type is discriminated by the "type" field matching the Application type.
 */
export type RunSummaryApplication =
  | { type: "benchmark"; benchmarkId: string }
  | { type: "uploaded"; format: UploadedProgramFormat }
  | { type: "manualCounts" };

/**
 * What a run's Pareto frontier spans, as a summary can honestly state it.
 *
 * A frontier has no "the" answer — `agentRunReport.ts` says so where it reports
 * one to the chat surface, and picking row zero here would be this type
 * inventing a ranking the engine deliberately did not supply. The span between
 * the cheapest and most expensive point is what the frontier actually says.
 *
 * Bare numbers plus one unit, rather than a `NumericMetric` per bound: this is
 * repeated once per run in a list of up to a hundred, and four `{ value, unit,
 * display }` objects per row is most of a page's context spent on units that do
 * not vary. `qre_get_run` is where the formatted metrics live.
 */
export interface FrontierSpan {
  /** How many points the engine returned. */
  points: number;
  physicalQubitsUnit: string;
  runtimeUnit: string;
  /**
   * The two ends of the trade-off, as whole points rather than as independent
   * minima. A frontier trades qubits against time, so the run with the fewest
   * qubits is generally the SLOWEST — reporting a `min` and a `max` per
   * measurement would pair a qubit count with a runtime from a different row
   * and describe a configuration the engine never returned.
   *
   * Equal to each other when the frontier has one point.
   */
  fewestQubits: FrontierEndpoint;
  mostQubits: FrontierEndpoint;
}

/** One frontier point, reduced to the two numbers a comparison turns on. */
export interface FrontierEndpoint {
  physicalQubits: number;
  runtime: number;
}

/**
 * Summarized run for MCP exposure — a stripped-down view of RunRecord.
 * This type deliberately excludes most fields from the full RunRecord to keep
 * the agent's context bounded and avoid flooding it with full configs, results,
 * and raw engine output.
 *
 * `frontier` is the one measurement it carries, because without it the question
 * this app exists to answer — which configuration costs less — took one call per
 * run to ask.
 */
export interface RunSummary {
  id: string;
  name: string;
  createdAt: string;
  savedAt: string;
  status: "succeeded" | "failed";
  architecture: ArchitectureType;
  application: RunSummaryApplication;
  /** Null for a failed run, and for a run that produced no feasible points. */
  frontier: FrontierSpan | null;
}

/**
 * The filter set the Run History surface exposes (SOW Part 2). Every field is
 * optional; an omitted field does not constrain. `nameSearch` is a
 * case-insensitive substring over the run name; the rest are exact matches,
 * except `magicStateFactory`, which matches any member of the run's factory set.
 * `qreVersion` matches the AUTHORITATIVE `result.qreVersion`.
 */
export interface RunFilter {
  nameSearch?: string;
  /** applicationKey(config): a benchmark id, or `uploaded:<filePath>`. */
  application?: string;
  /**
   * Match any ONE of these application keys.
   *
   * `application` can only ask about a single run source. A caller that wants
   * "any benchmark" would otherwise have to read the whole history and filter
   * it afterwards, which is what the MCP list tool did.
   */
  applications?: readonly string[];
  architecture?: ArchitectureType;
  qecCode?: QecCodeId;
  magicStateFactory?: MagicStateFactoryId;
  qreVersion?: string;
}
 
/** The application key for a Manual Logical Counts run, which has no source. */
export const MANUAL_COUNTS_APPLICATION_KEY = "manual-counts";

/**
 * The stable key the Application filter groups by: the benchmark id for
 * benchmark runs, `uploaded:<filePath>` for uploaded programs, or
 * `manual-counts` for Manual Logical Counts runs (which have no source). Team 1
 * builds the filter's option list from the distinct keys present in the records.
 */
export function applicationKey(config: RunConfig): string {
  const app = config.application;
  if (app.type === "benchmark") return app.benchmarkId;
  if (app.type === "uploaded") return `uploaded:${app.filePath}`;
  return MANUAL_COUNTS_APPLICATION_KEY;
}
 
/** Does a record satisfy every constraint in the filter? Pure — the reference match semantics. */
export function matchesRunFilter(record: RunRecord, filter: RunFilter): boolean {
  const { config, result } = record;
  if (filter.nameSearch !== undefined) {
    const needle = filter.nameSearch.trim().toLowerCase();
    if (needle.length > 0 && !config.name.toLowerCase().includes(needle)) return false;
  }
  if (filter.application !== undefined && applicationKey(config) !== filter.application) return false;
  if (filter.applications !== undefined && !filter.applications.includes(applicationKey(config))) return false;
  if (filter.architecture !== undefined && config.architecture.type !== filter.architecture) return false;
  if (filter.qecCode !== undefined && config.qecCode !== filter.qecCode) return false;
  // "Runs that used this factory" — a multi-select run matches on any member.
  if (
    filter.magicStateFactory !== undefined &&
    !config.magicStateFactories.includes(filter.magicStateFactory)
  ) {
    return false;
  }
  if (filter.qreVersion !== undefined && result.qreVersion !== filter.qreVersion) return false;
  return true;
}
 
/**
 * Newest-first ordering used by list()/query(): by the run's launch time
 * (`config.createdAt`) descending, tie-broken by `savedAt` then `id` so the
 * order is total and deterministic (no reliance on insertion order).
 */
export function sortRunRecordsNewestFirst(records: readonly RunRecord[]): RunRecord[] {
  return [...records].sort((a, b) => {
    if (a.config.createdAt !== b.config.createdAt) return a.config.createdAt < b.config.createdAt ? 1 : -1;
    if (a.savedAt !== b.savedAt) return a.savedAt < b.savedAt ? 1 : -1;
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });
}
 
/**
 * Apply a filter and return the matches newest-first. Pure — the canonical
 * query semantics a real store (SQLite) must reproduce.
 */
export function queryRunRecords(records: readonly RunRecord[], filter: RunFilter = {}): RunRecord[] {
  return sortRunRecordsNewestFirst(records.filter((r) => matchesRunFilter(r, filter)));
}
 
// ---------------------------------------------------------------------------
// RunStore — the persistence/query boundary (Team 1 UI ⇄ Team 2 store)
// ---------------------------------------------------------------------------
 
/**
 * The ONE interface the Run History UI talks to. Week 3: Team 1 builds against
 * `InMemoryRunStore` (mock records, see app/src/shared/runStore.ts); Team 2
 * builds a SQLite `RunStore` behind the same signature. Week 4: the SQLite
 * store swaps in — the same play as MockEngine -> QreEngine.
 *
 * Records are WRITE-ONCE: `save` REJECTS if a record with the same id already
 * exists (immutability is structural — there is no update path). `list`/`query`
 * return newest-first; `get`/`query`/`list` hand back copies so callers can
 * never mutate stored state.
 */
/**
 * The read half of the store boundary.
 *
 * A consumer that must not change the run history takes this rather than
 * `RunStore`, so "it only reads" is checked by the compiler instead of being
 * asserted in a comment. The MCP server is the first such consumer.
 */
export interface ReadableRunStore {
  list(): Promise<RunRecord[]>;
  get(id: string): Promise<RunRecord | null>;
  query(filter: RunFilter): Promise<RunRecord[]>;
}

export interface RunStore extends ReadableRunStore {
  save(record: RunRecord): Promise<void>;
  delete(id: string): Promise<void>;
}
 
/**
 * Reconstruct a config that pre-fills the Run Configuration form for a Rerun.
 * Rerun makes a NEW run, so the caller supplies a fresh `id`/`createdAt` stamp;
 * everything else is carried from the saved run. The original config was
 * schema-valid and internally consistent (coupling/availability rules), so the
 * reconstruction is too — and it is re-runnable through `EstimatorService.run`.
 *
 * `qreVersion` is carried as-is (it is informational on the config side). When
 * the UI hydrates the form it may refresh it to the currently bundled engine;
 * the authoritative version of the re-run is re-read at execution time into the
 * new RunResult.
 */
export function reconstructConfig(record: RunRecord, stamp: { id: string; createdAt: string }): RunConfig {
  return { ...record.config, id: stamp.id, createdAt: stamp.createdAt };
}