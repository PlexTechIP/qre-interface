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

/** Both stages' parameters. Every estimate runs both stages. */
export interface TraceTransform {
  /** PSSPC: T states used to synthesize each arbitrary rotation. 5 <= x <= 20. */
  tStatesPerRotation: number;
  /** PSSPC: synthesize CCX from magic states. Bound to the GSJ24 CCX factory. */
  ccxMagicStates: boolean;
  /** Lattice Surgery: fixed at 1.0 (optimistic); no other value is contract-valid. */
  slowDownFactor: 1.0;
}

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

function rejected(message: string): TraceTransformParse {
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

  return { ok: true, transform: { tStatesPerRotation, ccxMagicStates, slowDownFactor: 1.0 } };
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
 * One line naming BOTH stages. The summary previously printed a single transform
 * name, which read as "this is the one that ran" when in fact both always did.
 */
export function describeTraceTransform(transform: TraceTransform): string {
  const parts = [
    "PSSPC → Lattice Surgery",
    `${transform.tStatesPerRotation} T/rotation`,
  ];
  if (transform.ccxMagicStates) parts.push("CCX magic states");
  parts.push(`slowdown ${transform.slowDownFactor}`);
  return parts.join(" · ");
}
