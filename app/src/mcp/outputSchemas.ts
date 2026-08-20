/**
 * What each tool promises to return.
 *
 * §6 of the design requires every tool to declare an `outputSchema`, and the
 * SDK validates `structuredContent` against it on the way out — so a projection
 * that drifts from the contract fails loudly at the boundary instead of quietly
 * handing an agent a shape it cannot read.
 *
 * A hand-written schema beside a hand-written type is the kind of second copy
 * this codebase has been bitten by, so the leaf shapes carry `satisfies
 * z.ZodType<T>` to make drift a compile error, and `toolBoundary.test.ts`
 * drives every tool through a real client to cover the rest.
 *
 * `qre_draft_from_run` is the deliberate exception. `GeneratedRunDraft` already
 * has a committed JSON Schema (`runconfig-generation.schema.json`), and
 * restating all of its architecture branches and bounds here would be a third
 * copy of that contract. The envelope is declared instead, and the handler
 * validates the draft itself against the committed artifact.
 */

import { z } from "zod";

import {
  ARCHITECTURE_TYPES,
  UPLOADED_PROGRAM_FORMATS,
  type RunSummary,
  type RunSummaryApplication,
} from "../shared/types.js";

const runStatus = z.enum(["succeeded", "failed"]);

const runSummaryApplication = z.union([
  z.object({ type: z.literal("benchmark"), benchmarkId: z.string() }),
  z.object({
    type: z.literal("uploaded"),
    format: z.enum(UPLOADED_PROGRAM_FORMATS),
  }),
  z.object({ type: z.literal("manualCounts") }),
]) satisfies z.ZodType<RunSummaryApplication>;

const runSummary = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
  savedAt: z.string(),
  status: runStatus,
  architecture: z.enum(ARCHITECTURE_TYPES),
  application: runSummaryApplication,
}) satisfies z.ZodType<RunSummary>;

/** A measured quantity as the engine reports it: value, unit, and display form. */
const fieldMetric = z.object({
  value: z.unknown(),
  unit: z.string(),
  display: z.string(),
});

const numericMetric = z.object({
  value: z.number(),
  unit: z.string(),
  display: z.string(),
});

const frontierRow = z.object({
  physicalQubits: numericMetric,
  runtime: numericMetric,
  logicalCycleTime: numericMetric,
  factories: z.object({
    value: z.array(z.object({ stateType: z.string(), copies: z.number() })),
    unit: z.string(),
    display: z.string(),
  }),
  totalError: numericMetric,
  codeDistance: numericMetric,
  additional: z.record(z.string(), fieldMetric).optional(),
});

const runDetail = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
  savedAt: z.string(),
  startedAt: z.string(),
  completedAt: z.string(),
  status: runStatus,
  error: z.object({ code: z.string(), message: z.string() }).nullable(),
  architecture: z.enum(ARCHITECTURE_TYPES),
  application: runSummaryApplication,
  qreVersion: z.string(),
  frontierSample: frontierRow.nullable(),
  frontierRowCount: z.number().nullable(),
});

export const LIST_BENCHMARKS_OUTPUT = {
  benchmarks: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      format: z.enum(["qsharp", "openqasm", "qir"]),
    }),
  ),
};

export const LIST_RUNS_OUTPUT = {
  runs: z.array(runSummary),
  totalMatched: z.number(),
  nextCursor: z.string().optional(),
};

export const GET_RUN_OUTPUT = {
  run: runDetail,
};

/**
 * Only the envelope. The draft inside is governed by
 * `runconfig-generation.schema.json`, which `handleDraftFromRun` validates it
 * against — restating that contract here would be a copy that drifts the next
 * time the contract version moves.
 */
export const DRAFT_FROM_RUN_OUTPUT = {
  draft: z.looseObject({}),
};

// The leaf schemas above carry `satisfies z.ZodType<T>`, which catches drift in
// the shapes that have a stable TypeScript counterpart. The whole-output
// schemas cannot: zod infers an optional field as `T | undefined`, which
// `exactOptionalPropertyTypes` rejects against a `field?: T` declaration.
// `toolBoundary.test.ts` covers them instead, by driving every tool through a
// real MCP client — the SDK parses `structuredContent` with these very schemas,
// so a drifted projection fails there.
