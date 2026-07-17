/**
 * Contract types — RunConfig & RunResult (v1.0.0).
 *
 * CANONICAL, PM-owned, frozen with the schemas in this folder. Import these
 * types (copy this file into your workspace verbatim until the shared app
 * scaffold wires it in) — NEVER re-declare contract shapes locally. If a field
 * here and a schema ever disagree, the schema wins and the mismatch is a bug:
 * report it in the channel.
 *
 * Changes only via the contract-change process (docs/engineering-workflow.md).
 */

/** Contract version stamped into every RunConfig and RunResult. */
export const SCHEMA_VERSION = "1.0.0";

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

export type Application = BenchmarkApplication | UploadedApplication;

export const ARCHITECTURE_TYPES = ["gateBased", "majorana"] as const;
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

export type Architecture = GateBasedArchitecture | MajoranaArchitecture;

export const QEC_CODE_IDS = ["surface_code", "three_aux"] as const;
export type QecCodeId = (typeof QEC_CODE_IDS)[number];

export function expectedQecCode(architecture: Architecture): QecCodeId {
  return architecture.type === "gateBased" ? "surface_code" : "three_aux";
}

export const MAGIC_STATE_FACTORY_IDS = ["round_based", "litinski19"] as const;
export type MagicStateFactoryId = (typeof MAGIC_STATE_FACTORY_IDS)[number];

export function isLitinski19Allowed(architecture: Architecture): boolean {
  return architecture.type === "gateBased" && architecture.errorRate <= 0.001;
}

export const TRACE_TRANSFORM_TYPES = ["psspc", "latticeSurgery"] as const;
export type TraceTransformType = (typeof TRACE_TRANSFORM_TYPES)[number];

export interface PsspcTraceTransform {
  type: "psspc";
  /** Default UI value: 20. Valid range: 5 <= value <= 20. */
  tStatesPerRotation: number;
  /** Default UI value: false. */
  ccxMagicStates: boolean;
}

export interface LatticeSurgeryTraceTransform {
  type: "latticeSurgery";
  /** Fixed at 1.0 (optimistic); no other values are contract-valid. */
  slowDownFactor: 1.0;
}

export type TraceTransform = PsspcTraceTransform | LatticeSurgeryTraceTransform;

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
  /** round_based by default; litinski19 only for qualifying GateBased runs. */
  magicStateFactory: MagicStateFactoryId;
  traceTransform: TraceTransform;
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
 * benchmark runs, or `uploaded:<filePath>` for uploaded programs. Team 1 builds
 * the filter's option list from the distinct keys present across the records.
 */
export function applicationKey(config: RunConfig): string {
  return config.application.type === "benchmark"
    ? config.application.benchmarkId
    : `uploaded:${config.application.filePath}`;
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
