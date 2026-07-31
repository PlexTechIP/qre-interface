/**
 * Contract types — RunConfig & RunResult (v1.2.0).
 *
 * CANONICAL, PM-owned, frozen with the schemas in this folder. Import these
 * types (copy this file into your workspace verbatim until the shared app
 * scaffold wires it in) — NEVER re-declare contract shapes locally. If a field
 * here and a schema ever disagree, the schema wins and the mismatch is a bug:
 * report it in the channel.
 *
 * Changes only via the contract-change process (docs/engineering-workflow.md).
 *
 * v1.2.0 (BREAKING, one field): `traceTransform` becomes a single object
 * carrying both pipeline stages' parameters — { tStatesPerRotation,
 * ccxMagicStates, slowDownFactor } — instead of a `psspc` | `latticeSurgery`
 * discriminated union. The union claimed the analyst picks one transform; qdk
 * always runs both, no UI control ever set the discriminant, and the
 * latticeSurgery branch silently discarded the PSSPC values the form collected.
 * Stored v1.1.0 records are read through `normalizeTraceTransform`; records are
 * validated on save only and are immutable, so nothing needs migrating on disk.
 *
 * v1.1.0 (additive, backward-compatible): Neutral Atom architecture; Low-Move
 * Surface Code QEC (paired with Neutral Atom); GSJ24 / GSJ24 CCX / Magic
 * Up-to-Clifford factory values; secondary factories and memory optimization as
 * optional sets; an optional `parameters` field carrying benchmark
 * hyperparameters; Litinski19 availability widened to Neutral Atom. The primary
 * `magicStateFactory` field remains a single value in this version — the
 * multi-select migration is tracked separately (see PR notes) because it changes
 * an existing field's shape and touches the store and Team 2's consumers.
 */
 
/** Contract version stamped into every RunConfig and RunResult. */
export const SCHEMA_VERSION = "1.2.0";
 
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
  /** Max Velocity (m/s) — float > 0. Default 0.25. */
  maxVelocity: number;
  /** Max Acceleration (m/s²) — float > 0. Default 5000.0. */
  maxAcceleration: number;
  /** Surface Code Single-Qubit Time Factor — integer >= 1. Default 1. */
  surfaceCodeOneQubitTimeFactor: number;
  /** Surface Code Two-Qubit Time Factor — integer >= 1. Default 1. */
  surfaceCodeTwoQubitTimeFactor: number;
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
 * The trace transform (v1.2.0). PSSPC and Lattice Surgery are stages of one
 * pipeline that always both run, not alternatives — see traceTransform.ts for
 * the shape, the defaults, and the v1.1.0 read path.
 */
import type { TraceTransform } from "./traceTransform";

export {
  DEFAULT_TRACE_TRANSFORM,
  describeTraceTransform,
  normalizeTraceTransform,
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
 
export interface RunConfig {
  schemaVersion: typeof SCHEMA_VERSION;
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
   * Primary magic-state factory. round_based by default; litinski19 and gsj24
   * only for qualifying architectures (see isLitinski19Allowed / isGsj24Allowed).
   * NOTE (v1.1.0): still a single value. The spec calls for multi-select; that
   * migration (magicStateFactory -> magicStateFactories: MagicStateFactoryId[])
   * is deferred to its own contract change because it reshapes an existing field
   * that the store and Team 2's history/results consumers read.
   */
  magicStateFactory: MagicStateFactoryId;
  /**
   * Secondary factories (v1.1.0). Optional; omitted or [] means none. Multi-select
   * set, independent of the primary factory. Absent on v1.0.0 records.
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
  schemaVersion: typeof SCHEMA_VERSION;
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
  schemaVersion: typeof SCHEMA_VERSION;
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
 * The filter set the Run History surface exposes (SOW Part 2). Every field is
 * optional; an omitted field does not constrain. `nameSearch` is a
 * case-insensitive substring over the run name; the rest are exact matches.
 * `qreVersion` matches the AUTHORITATIVE `result.qreVersion`.
 */
export interface RunFilter {
  nameSearch?: string;
  /** applicationKey(config): a benchmark id, or `uploaded:<filePath>`. */
  application?: string;
  architecture?: ArchitectureType;
  qecCode?: QecCodeId;
  magicStateFactory?: MagicStateFactoryId;
  qreVersion?: string;
}
 
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
  return "manual-counts";
}
 
/** Does a record satisfy every constraint in the filter? Pure — the reference match semantics. */
export function matchesRunFilter(record: RunRecord, filter: RunFilter): boolean {
  const { config, result } = record;
  if (filter.nameSearch !== undefined) {
    const needle = filter.nameSearch.trim().toLowerCase();
    if (needle.length > 0 && !config.name.toLowerCase().includes(needle)) return false;
  }
  if (filter.application !== undefined && applicationKey(config) !== filter.application) return false;
  if (filter.architecture !== undefined && config.architecture.type !== filter.architecture) return false;
  if (filter.qecCode !== undefined && config.qecCode !== filter.qecCode) return false;
  if (filter.magicStateFactory !== undefined && config.magicStateFactory !== filter.magicStateFactory) return false;
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
export interface RunStore {
  save(record: RunRecord): Promise<void>;
  list(): Promise<RunRecord[]>;
  get(id: string): Promise<RunRecord | null>;
  delete(id: string): Promise<void>;
  query(filter: RunFilter): Promise<RunRecord[]>;
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