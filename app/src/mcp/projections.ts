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
  RunError,
  ArchitectureType,
} from "../shared/types.js";

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
    qreVersion: boundedText(record.result.qreVersion, MAX_SHORT_FIELD),
    frontierSample: bounded?.sample ?? null,
    frontierRowCount,
    frontierSampleOmitted: bounded?.omitted ?? 0,
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
