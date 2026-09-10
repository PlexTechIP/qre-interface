/**
 * Data projections for MCP tool outputs.
 *
 * Converts RunRecord and FormState into MCP-safe types with bounded,
 * properly-escaped user-authored text and no sensitive internal fields.
 */

import { boundedText } from "./toolResult.js";
import type {
  FieldMetric,
  NumericMetric,
  RunRecord,
  RunSummary,
  RunSummaryApplication,
  FrontierRow,
  FrontierSpan,
  RunError,
  ArchitectureType,
} from "../shared/types.js";

/**
 * What the analyst asked for, as distinct from what came back.
 *
 * Without this a failure was unexplainable. `ESTIMATION_FAILED — the estimator
 * found no feasible Pareto frontier point; relax maxError or adjust the model`
 * names the field to relax, and nothing could say what it had been set to, so
 * "why did this fail?" dead-ended on every failed run. The only other tool
 * carrying configuration is `qre_draft_from_run`, which refuses the runs whose
 * settings a draft cannot express — so precisely the unusual configurations
 * most worth asking about were the ones nothing could report.
 *
 * Loose maps rather than a typed union, for the two fields that genuinely have
 * no fixed shape: architecture parameters differ per architecture and
 * hyperparameters differ per benchmark, so a union of every branch would be a
 * fourth copy of a contract that already exists in the JSON Schema — and would
 * silently drop a field the day a benchmark gains one. Values are bounded
 * primitives, the same treatment `additional` metrics already get.
 */
export interface RunSettings {
  qecCode: string;
  maxError: number;
  magicStateFactories: string[];
  secondaryFactories: string[];
  memoryOptimization: string;
  /** Architecture-specific values, as this run set them. */
  architecture: Record<string, number | string | boolean | null>;
  /** Benchmark hyperparameters, as this run set them. Empty for a non-benchmark run. */
  parameters: Record<string, number | string | boolean | null>;
  /** Trace-transform settings, as this run set them. */
  traceTransform: Record<string, number | string | boolean | null>;
}

/**
 * RunDetail — a fuller view of a run than RunSummary, but still with `raw`
 * excluded, and every engine-controlled field bounded, so the response has a
 * computable maximum size.
 */
export interface RunDetail {
  id: string;
  name: string;
  createdAt: string;
  savedAt: string;
  startedAt: string;
  completedAt: string;
  status: "succeeded" | "failed";
  error: RunError | null;
  architecture: ArchitectureType;
  application: RunSummaryApplication;
  /** What was asked for. `error` and `frontierSample` are what came back. */
  settings: RunSettings;
  qreVersion: string;
  /** One representative frontier row (index 0, if available). */
  frontierSample: FrontierRow | null;
  /** Number of frontier rows in the result (null if failed). */
  frontierRowCount: number | null;
  /**
   * How much of `frontierSample` is not being shown: entries past the cap,
   * names that collided once capped, and values too structured to represent.
   * Zero for an ordinary run; above zero means the engine reported more than
   * is here, so this is not the whole row.
   */
  frontierSampleOmitted: number;
}

/**
 * Project a RunRecord into a RunSummary — a bounded view safe for agent context.
 *
 * - Caps run name to 200 Unicode code points and escapes control characters
 * - Excludes full config, result.raw, full frontier, and all other internal fields
 * - Returns only the 6 key fields for agent understanding
 */
export function toRunSummary(record: RunRecord): RunSummary {
  const application = buildRunSummaryApplication(record.config.application);

  return {
    id: record.id,
    name: boundedText(record.config.name, 200),
    createdAt: record.config.createdAt,
    savedAt: record.savedAt,
    status: record.result.status,
    architecture: record.config.architecture.type,
    application,
    frontier: toFrontierSpan(record.result.frontier),
  };
}

/**
 * The cheapest and most expensive points a frontier reaches.
 *
 * Sorted here rather than trusted: the engine's row order is not a documented
 * ranking, so reading `frontier[0]` as "the cheapest" would be a rule this
 * projection invented.
 *
 * Each end is carried as a whole point. Taking a minimum per measurement would
 * pair the smallest qubit count with the shortest runtime, and on a frontier
 * that trades one against the other those two belong to opposite rows — the
 * result would be a configuration the engine never returned and nothing can be
 * run at.
 *
 * The units come from the cheapest point. A frontier that changed units between
 * rows would make any comparison meaningless and the engine does not do that;
 * reading them from one named row makes the assumption visible rather than
 * averaging over it.
 */
function toFrontierSpan(
  frontier: readonly FrontierRow[] | null,
): FrontierSpan | null {
  if (frontier === null || frontier.length === 0) return null;

  const byQubits = [...frontier].sort(
    (a, b) => a.physicalQubits.value - b.physicalQubits.value,
  );
  const cheapest = byQubits[0];
  const largest = byQubits[byQubits.length - 1];
  if (cheapest === undefined || largest === undefined) return null;

  return {
    points: frontier.length,
    physicalQubitsUnit: boundedText(cheapest.physicalQubits.unit, MAX_SHORT_FIELD),
    runtimeUnit: boundedText(cheapest.runtime.unit, MAX_SHORT_FIELD),
    fewestQubits: {
      physicalQubits: cheapest.physicalQubits.value,
      runtime: cheapest.runtime.value,
    },
    mostQubits: {
      physicalQubits: largest.physicalQubits.value,
      runtime: largest.runtime.value,
    },
  };
}

/**
 * Caps that make a RunDetail's size computable instead of hoped-for.
 *
 * The frontier row is the only part of this projection an engine controls the
 * SIZE of: `additional` is an open map and every metric carries a free-form
 * `display` string. Bounding it here is what lets `qre_get_run` answer for any
 * run at all — the alternative it replaces was refusing oversized runs, which
 * made them permanently unreadable over MCP.
 */
const MAX_NAME = 200;
const MAX_ERROR_MESSAGE = 1000;
/** Codes, versions, units, display strings, and metric keys. */
const MAX_SHORT_FIELD = 100;
const MAX_ADDITIONAL_METRICS = 24;
/** Architecture fields, hyperparameters, and factory sets are all small. */
const MAX_SETTING_ENTRIES = 32;
const MAX_FACTORY_ENTRIES = 16;

function boundedNumericMetric(metric: NumericMetric): NumericMetric {
  return {
    value: metric.value,
    unit: boundedText(metric.unit, MAX_SHORT_FIELD),
    display: boundedText(metric.display, MAX_SHORT_FIELD),
  };
}

/**
 * An `additional` metric's value is typed `unknown`, so an engine could put a
 * whole object graph there. Primitives are carried through; anything else is
 * flattened to null, because there is no bound to give it — and the caller is
 * told, because a null that used to be data is data loss.
 */
function boundedMetricValue(value: unknown): {
  value: unknown;
  flattened: boolean;
} {
  if (value === null) return { value: null, flattened: false };
  if (typeof value === "number" || typeof value === "boolean") {
    return { value, flattened: false };
  }
  if (typeof value === "string") {
    return { value: boundedText(value, MAX_SHORT_FIELD), flattened: false };
  }
  return { value: null, flattened: true };
}

function boundedFrontierSample(row: FrontierRow): {
  sample: FrontierRow;
  omitted: number;
} {
  const factoryUses = row.factories.value;
  const additionalEntries = Object.entries(row.additional ?? {});

  const kept: Record<string, FieldMetric> = {};
  let lost = 0;
  for (const [key, metric] of additionalEntries.slice(0, MAX_ADDITIONAL_METRICS)) {
    // Capping the KEY can make two long, similarly-named metrics collide. The
    // second must not be served under a name that belongs to the first, so it
    // is dropped and counted rather than silently overwriting.
    const boundedKey = boundedText(key, MAX_SHORT_FIELD);
    if (Object.hasOwn(kept, boundedKey)) {
      lost += 1;
      continue;
    }
    const bounded = boundedMetricValue(metric.value);
    if (bounded.flattened) lost += 1;
    kept[boundedKey] = {
      value: bounded.value,
      unit: boundedText(metric.unit, MAX_SHORT_FIELD),
      display: boundedText(metric.display, MAX_SHORT_FIELD),
    };
  }

  const sample: FrontierRow = {
    physicalQubits: boundedNumericMetric(row.physicalQubits),
    runtime: boundedNumericMetric(row.runtime),
    logicalCycleTime: boundedNumericMetric(row.logicalCycleTime),
    factories: {
      value: factoryUses.slice(0, MAX_FACTORY_ENTRIES).map((use) => ({
        stateType: boundedText(use.stateType, MAX_SHORT_FIELD),
        copies: use.copies,
      })),
      unit: boundedText(row.factories.unit, MAX_SHORT_FIELD),
      display: boundedText(row.factories.display, MAX_SHORT_FIELD),
    },
    totalError: boundedNumericMetric(row.totalError),
    codeDistance: boundedNumericMetric(row.codeDistance),
  };
  if (Object.keys(kept).length > 0) sample.additional = kept;

  const omitted =
    lost +
    Math.max(0, additionalEntries.length - MAX_ADDITIONAL_METRICS) +
    Math.max(0, factoryUses.length - MAX_FACTORY_ENTRIES);

  return { sample, omitted };
}

/**
 * Project a RunRecord into a RunDetail — a fuller view but still bounded.
 *
 * - Includes config/result metadata but excludes result.raw entirely
 * - Caps name and escapes error messages (user and engine text)
 * - Returns ONE bounded frontier row and a count, not the full frontier
 * - Returns error details capped, escaped, and stripped of paths
 */
export function toRunDetail(record: RunRecord): RunDetail {

  const application = buildRunSummaryApplication(record.config.application);

  const frontier = record.result.frontier;
  const frontierRowCount = frontier ? frontier.length : null;
  const firstRow = frontier && frontier.length > 0 ? frontier[0] : undefined;
  const bounded = firstRow ? boundedFrontierSample(firstRow) : null;

  let error = record.result.error;
  if (error !== null) {
    error = {
      code: boundedText(error.code, MAX_SHORT_FIELD),
      // Engine failures carry up to 2000 characters of Python stderr, so this
      // is the field that most needs path redaction, not just capping.
      message: boundedText(error.message, MAX_ERROR_MESSAGE),
    };
  }

  return {
    id: record.id,
    name: boundedText(record.config.name, MAX_NAME),
    createdAt: record.config.createdAt,
    savedAt: record.savedAt,
    startedAt: record.result.startedAt,
    completedAt: record.result.completedAt,
    status: record.result.status,
    error,
    architecture: record.config.architecture.type,
    application,
    settings: toRunSettings(record.config),
    qreVersion: boundedText(record.result.qreVersion, MAX_SHORT_FIELD),
    frontierSample: bounded?.sample ?? null,
    frontierRowCount,
    frontierSampleOmitted: bounded?.omitted ?? 0,
  };
}

/** One level of nesting is all these config shapes have; the cap is the guard. */
const MAX_SETTING_DEPTH = 3;

/**
 * Flatten one settings group into bounded primitives, nested keys joined by `.`.
 *
 * `type` is dropped where it appears: the architecture discriminator is already
 * reported at the top of the detail, and repeating it invites an agent to treat
 * the two as independently meaningful.
 *
 * Nested values are FLATTENED, not discarded, and the reason is that discarding
 * them is not neutral. `traceTransform.dynamicMemoryCompute` is either null,
 * meaning the stage is off, or an object describing the stage — so collapsing
 * the object to null did not withhold information, it asserted the opposite of
 * the truth, beside a `qre_draft_from_run` refusal naming that very stage as the
 * reason the run could not be drafted. A view of a configuration has to be able
 * to distinguish "off" from "on, and not shown".
 *
 * Depth and entry count are both capped, so an unexpectedly deep future setting
 * is bounded rather than unbounded.
 */
function toBoundedSettings(
  source: Record<string, unknown> | undefined,
): Record<string, number | string | boolean | null> {
  const bounded: Record<string, number | string | boolean | null> = {};
  if (source === undefined) return bounded;

  const walk = (value: unknown, prefix: string, depth: number): void => {
    if (Object.keys(bounded).length >= MAX_SETTING_ENTRIES) return;

    const key = boundedText(prefix, MAX_SHORT_FIELD);
    if (Object.hasOwn(bounded, key)) return;

    if (typeof value === "number" || typeof value === "boolean") {
      bounded[key] = value;
    } else if (typeof value === "string") {
      bounded[key] = boundedText(value, MAX_SHORT_FIELD);
    } else if (value === null || value === undefined) {
      // A real null: the stage is off, the option is unset. Distinct from the
      // null below, which means "too deep to show".
      bounded[key] = null;
    } else if (depth >= MAX_SETTING_DEPTH) {
      bounded[key] = null;
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${prefix}.${index}`, depth + 1));
    } else {
      for (const [childKey, childValue] of Object.entries(value)) {
        walk(childValue, `${prefix}.${childKey}`, depth + 1);
      }
    }
  };

  for (const [key, value] of Object.entries(source)) {
    if (key === "type") continue;
    walk(value, key, 1);
  }
  return bounded;
}

/**
 * Project a run's configuration into the settings an agent may see.
 *
 * `application` is deliberately absent — it is reported separately, by
 * `buildRunSummaryApplication`, which is the projection that strips an uploaded
 * program's file path. Reading the application from here instead would route
 * around that.
 */
function toRunSettings(config: RunRecord["config"]): RunSettings {
  const architecture = config.architecture as unknown as Record<string, unknown>;

  return {
    qecCode: boundedText(config.qecCode, MAX_SHORT_FIELD),
    maxError: config.maxError,
    magicStateFactories: config.magicStateFactories
      .slice(0, MAX_SETTING_ENTRIES)
      .map((factory) => boundedText(factory, MAX_SHORT_FIELD)),
    secondaryFactories: (config.secondaryFactories ?? [])
      .slice(0, MAX_SETTING_ENTRIES)
      .map((factory) => boundedText(factory, MAX_SHORT_FIELD)),
    // Absent means "none" — see RunConfig. Saying so beats an empty string an
    // agent has to interpret.
    memoryOptimization: boundedText(config.memoryOptimization ?? "none", MAX_SHORT_FIELD),
    architecture: toBoundedSettings(architecture),
    parameters: toBoundedSettings(
      config.parameters as unknown as Record<string, unknown> | undefined,
    ),
    traceTransform: toBoundedSettings(
      config.traceTransform as unknown as Record<string, unknown>,
    ),
  };
}

/**
 * Build the MCP-safe RunSummaryApplication from a RunConfig's application.
 * Deliberately omits filePath for uploaded applications (data-egress risk).
 */
function buildRunSummaryApplication(
  application: RunRecord["config"]["application"],
): RunSummaryApplication {
  switch (application.type) {
    case "benchmark":
      return {
        type: "benchmark",
        benchmarkId: application.benchmarkId,
      };
    case "uploaded":
      return {
        type: "uploaded",
        format: application.format,
      };
    case "manualCounts":
      return {
        type: "manualCounts",
      };
  }
}
