/**
 * The trace transform: a PIPELINE, not a choice between two transforms.
 *
 * qdk applies PSSPC and Lattice Surgery in sequence. PSSPC lowers arbitrary
 * rotations and CCX into Pauli-based operations; Lattice Surgery maps those onto
 * lattice-surgery instructions. Verified against qdk 1.30.0:
 *
 *   PSSPC.q()                       -> empty frontier (nothing consumes it)
 *   LatticeSurgery.q() * PSSPC.q()  -> EstimationError: unsupported instruction
 *                                      LATTICE_SURGERY in transformation 'PSSPC'
 *   PSSPC.q() * LatticeSurgery.q()  -> an estimate
 *
 * v1.1.0 modelled this as a discriminated union, which said the analyst picks
 * one. Nothing in the UI ever set the discriminant (it was seeded to "psspc" and
 * never written), the engine ran both stages for either value, and the
 * latticeSurgery branch silently dropped the T-states and CCX settings the form
 * had collected. v1.2.0 records the pipeline's parameters in one object.
 */

/**
 * qdk's `EvictionStrategy`, which Dynamic Memory Compute uses to decide what
 * leaves memory when capacity is reached. Verified present on qdk 1.30.0 as
 * `EvictionStrategy.{LEAST_RECENTLY_USED, LEAST_FREQUENTLY_USED,
 * FIRST_AVAILABLE}`.
 */
export const EVICTION_STRATEGIES = [
  "least_recently_used",
  "least_frequently_used",
  "first_available",
] as const;
export type EvictionStrategy = (typeof EVICTION_STRATEGIES)[number];

/**
 * Stage 0's parameters (v1.4.0). Present ONLY when the stage runs — see
 * `TraceTransform.dynamicMemoryCompute`.
 */
export interface DynamicMemoryCompute {
  /** Fraction of capacity given to compute. 0 < x <= 1. qdk default 0.5. */
  computeCapacityPercentage: number;
  /** qdk default: least_recently_used. */
  evictionStrategy: EvictionStrategy;
}

/**
 * The pipeline's parameters. PSSPC and Lattice Surgery always run; Dynamic
 * Memory Compute and Unmemory are optional stages added in v1.4.0.
 *
 * Execution order is fixed and is a correctness property, not a presentation
 * choice:
 *
 *   DynamicMemoryCompute × PSSPC × LatticeSurgery × Unmemory
 *
 * **An off stage is ABSENT, never present at its defaults.** Those are
 * different pipelines and therefore different estimates: filling in
 * `{ computeCapacityPercentage: 0.5, ... }` for a stage the analyst left off
 * would silently add a stage to every run. This is the same rule that makes
 * `slowDownFactor` checked rather than rewritten.
 */
export interface TraceTransform {
  /** PSSPC: T states used to synthesize each arbitrary rotation. 5 <= x <= 20. */
  tStatesPerRotation: number;
  /** PSSPC: synthesize CCX from magic states. Bound to the GSJ24 CCX factory. */
  ccxMagicStates: boolean;
  /** Lattice Surgery: fixed at 1.0 (optimistic); no other value is contract-valid. */
  slowDownFactor: 1.0;
  /** Stage 0 (v1.4.0). Absent means the stage is not in the pipeline. */
  dynamicMemoryCompute?: DynamicMemoryCompute;
  /** Stage 3 (v1.4.0). Absent or false means the stage is not in the pipeline. */
  unmemory?: boolean;
}

/** Both optional stages off — the pipeline every pre-v1.4.0 record ran. */
export const DEFAULT_TRACE_TRANSFORM: TraceTransform = {
  tStatesPerRotation: 20,
  ccxMagicStates: false,
  slowDownFactor: 1.0,
};

/** The v1.1.0 union, accepted on read so stored records keep rendering. */
type LegacyTraceTransform =
  | { type: "psspc"; tStatesPerRotation: number; ccxMagicStates: boolean }
  | { type: "latticeSurgery"; slowDownFactor: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type TraceTransformParse =
  | { ok: true; transform: TraceTransform }
  | { ok: false; message: string };

/**
 * Returns the narrow failure shape, not `TraceTransformParse` — the failure
 * branch is common to every parse helper here, so keeping it narrow lets each
 * one declare its own success shape and still reject through this.
 */
function rejected(message: string): { ok: false; message: string } {
  return { ok: false, message };
}

/**
 * STRICT read, for anything that gates execution.
 *
 * Accepts the v1.2.0 pipeline object and both v1.1.0 union shapes, and rejects
 * everything else rather than repairing it. Repairing is what a display path
 * may do; an execution path must not, because a repaired config runs something
 * other than what the record says. In particular `slowDownFactor` is CHECKED,
 * not overwritten: qdk honours it (2.0 doubles the runtime), so quietly
 * rewriting a 2.0 to 1.0 would estimate a different run than the one saved.
 *
 * A legacy `latticeSurgery` record resolves to the PSSPC defaults because that
 * is literally what the old engine ran for it — `build_trace_query` called
 * `PSSPC.q()` with no arguments on that branch.
 */
export function parseTraceTransform(value: unknown): TraceTransformParse {
  if (!isRecord(value)) {
    return rejected("traceTransform must be an object.");
  }

  const { type } = value;

  // A record carrying the v1.1.0 `type` discriminant predates v1.4.0, so a
  // v1.4.0 stage field on it is a contradiction — the record mixes two contract
  // shapes and cannot have been written by any version of this app. Reject it
  // rather than pick a repair: dropping the stage would run a shorter pipeline
  // than the record describes, and honouring it would claim a stage the legacy
  // engine never ran. Both branches below are covered, so the two legacy shapes
  // behave identically.
  if (type !== undefined && (value.dynamicMemoryCompute !== undefined || value.unmemory !== undefined)) {
    return rejected(
      `traceTransform carries the legacy "${String(type)}" discriminant together with v1.4.0 pipeline stages; a record cannot be both shapes.`,
    );
  }

  if (type === "latticeSurgery") {
    const legacy = value as unknown as Extract<
      LegacyTraceTransform,
      { type: "latticeSurgery" }
    >;
    if (legacy.slowDownFactor !== 1) {
      return rejected(
        `Lattice Surgery slowDownFactor must be 1.0, got ${String(legacy.slowDownFactor)}.`,
      );
    }
    return { ok: true, transform: { ...DEFAULT_TRACE_TRANSFORM } };
  }

  if (type !== undefined && type !== "psspc") {
    return rejected(`Unknown traceTransform type ${JSON.stringify(type)}.`);
  }

  const { tStatesPerRotation, ccxMagicStates } = value;
  if (typeof tStatesPerRotation !== "number" || !Number.isFinite(tStatesPerRotation)) {
    return rejected(
      `traceTransform.tStatesPerRotation must be a number, got ${JSON.stringify(tStatesPerRotation)}.`,
    );
  }
  if (typeof ccxMagicStates !== "boolean") {
    return rejected(
      `traceTransform.ccxMagicStates must be a boolean, got ${JSON.stringify(ccxMagicStates)}.`,
    );
  }

  // v1.1.0 psspc records carry no slowDownFactor; the stage ran at 1.0.
  const slowDownFactor = type === "psspc" ? 1 : value.slowDownFactor;
  if (slowDownFactor !== 1) {
    return rejected(
      `Lattice Surgery slowDownFactor must be 1.0, got ${String(slowDownFactor)}.`,
    );
  }

  const optional = parseOptionalStages(value);
  if (!optional.ok) return optional;

  return {
    ok: true,
    transform: {
      tStatesPerRotation,
      ccxMagicStates,
      slowDownFactor: 1.0,
      ...optional.stages,
    },
  };
}

/** The v1.4.0 optional stages. Absent stays absent; malformed is rejected. */
type OptionalStages = Pick<TraceTransform, "dynamicMemoryCompute" | "unmemory">;

function parseOptionalStages(
  value: Record<string, unknown>,
): { ok: true; stages: OptionalStages } | { ok: false; message: string } {
  const stages: OptionalStages = {};

  const dmc = value.dynamicMemoryCompute;
  if (dmc !== undefined) {
    if (!isRecord(dmc)) {
      return rejected(
        `traceTransform.dynamicMemoryCompute must be an object when the stage runs, got ${JSON.stringify(dmc)}.`,
      );
    }
    const { computeCapacityPercentage, evictionStrategy } = dmc;
    if (
      typeof computeCapacityPercentage !== "number" ||
      !Number.isFinite(computeCapacityPercentage) ||
      computeCapacityPercentage <= 0 ||
      computeCapacityPercentage > 1
    ) {
      return rejected(
        `traceTransform.dynamicMemoryCompute.computeCapacityPercentage must be in (0, 1], got ${JSON.stringify(computeCapacityPercentage)}.`,
      );
    }
    if (
      typeof evictionStrategy !== "string" ||
      !(EVICTION_STRATEGIES as readonly string[]).includes(evictionStrategy)
    ) {
      return rejected(
        `traceTransform.dynamicMemoryCompute.evictionStrategy must be one of ${EVICTION_STRATEGIES.join(", ")}, got ${JSON.stringify(evictionStrategy)}.`,
      );
    }
    stages.dynamicMemoryCompute = {
      computeCapacityPercentage,
      evictionStrategy: evictionStrategy as EvictionStrategy,
    };
  }

  const unmemory = value.unmemory;
  if (unmemory !== undefined) {
    if (typeof unmemory !== "boolean") {
      return rejected(
        `traceTransform.unmemory must be a boolean when present, got ${JSON.stringify(unmemory)}.`,
      );
    }
    // NORMALIZE false to absent, so "off" has exactly one representation — the
    // same rule dynamicMemoryCompute follows, where absence is the only way to
    // say off. Otherwise two configs describing the same run (one written by a
    // form toggle, one where the key was never set) compare unequal everywhere
    // downstream: tests, JSON equality, any future run-dedup.
    if (unmemory) stages.unmemory = true;
  }

  return { ok: true, stages };
}

/**
 * LENIENT read, for display and for rehydrating a draft.
 *
 * Records are validated on save, never on load, and are immutable once saved —
 * so v1.1.0 records outlive the contract bump and History, Comparison and Rerun
 * must keep rendering them. Anything `parseTraceTransform` rejects falls back to
 * the defaults so the UI shows a coherent value; refusing to RUN such a record
 * is the engine's job, not this one's.
 */
export function normalizeTraceTransform(value: unknown): TraceTransform {
  const parsed = parseTraceTransform(value);
  return parsed.ok ? parsed.transform : { ...DEFAULT_TRACE_TRANSFORM };
}

/**
 * One line naming the stages that ACTUALLY RUN, in execution order. The summary
 * previously printed a single transform name, which read as "this is the one
 * that ran" when in fact both always did. Since v1.4.0 the pipeline also varies
 * in length, so listing only the stages present is what keeps it honest — a
 * reader can tell a two-stage run from a four-stage one.
 */
export function describeTraceTransform(transform: TraceTransform): string {
  const stages = ["PSSPC", "Lattice Surgery"];
  if (transform.dynamicMemoryCompute) stages.unshift("Dynamic Memory Compute");
  if (transform.unmemory) stages.push("Unmemory");

  const parts = [stages.join(" → "), `${transform.tStatesPerRotation} T/rotation`];
  if (transform.ccxMagicStates) parts.push("CCX magic states");
  parts.push(`slowdown ${transform.slowDownFactor}`);
  return parts.join(" · ");
}
