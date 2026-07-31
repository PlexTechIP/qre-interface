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

/**
 * Read a trace transform from a config of any contract version.
 *
 * Records are validated on save, never on load, and are immutable once saved —
 * so v1.1.0 records outlive the contract bump and History, Comparison and Rerun
 * must keep reading them. A legacy `latticeSurgery` record normalizes to the
 * PSSPC defaults because that is literally what the old engine ran for it:
 * `build_trace_query` called `PSSPC.q()` with no arguments on that branch.
 */
export function normalizeTraceTransform(value: unknown): TraceTransform {
  if (!isRecord(value)) return { ...DEFAULT_TRACE_TRANSFORM };

  if (value.type === undefined) {
    const { tStatesPerRotation, ccxMagicStates } = value;
    if (typeof tStatesPerRotation !== "number" || typeof ccxMagicStates !== "boolean") {
      return { ...DEFAULT_TRACE_TRANSFORM };
    }
    return { tStatesPerRotation, ccxMagicStates, slowDownFactor: 1.0 };
  }

  const legacy = value as unknown as LegacyTraceTransform;
  if (legacy.type === "psspc") {
    return {
      tStatesPerRotation: legacy.tStatesPerRotation,
      ccxMagicStates: legacy.ccxMagicStates,
      slowDownFactor: 1.0,
    };
  }
  return { ...DEFAULT_TRACE_TRANSFORM };
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
