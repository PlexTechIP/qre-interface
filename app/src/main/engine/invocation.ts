/**
 * Internal seam between configToInvocation and execute/outputToResult.
 * Not part of the frozen contracts/ — owned entirely by this engine module.
 *
 * Every union below is spelled out inline rather than imported from the
 * contract, deliberately: this shape is what `estimate.py` actually receives,
 * and keeping it independent means a contract-side rename does not silently
 * change the wire format the Python adapter parses.
 */
export interface QreInvocation {
  program:
    | {
        /** Absolute path to the Q# project root (dir with qsharp.json), or the OpenQASM/QIR source file. */
        sourcePath: string;
        format: "qsharp" | "openqasm" | "qir";
        /** Fully-qualified Q# entry expression, e.g. "QuantumDynamics.Main()". Empty for openqasm/qir. */
        entryExpr: string;
      }
    | {
        /** Manual Logical Counts — no source file; the engine builds a
         *  QSharpApplication whose entry_expr is a LogicalCounts of these. */
        format: "logicalCounts";
        logicalCounts: {
          numQubits: number;
          tCount: number;
          rotationCount: number;
          rotationDepth: number;
          cczCount: number;
          ccixCount: number;
          measurementCount: number;
        };
      };
  architecture:
    | {
        type: "gateBased";
        errorRate: number;
        gateTime: number;
        measurementTime: number;
        twoQubitGateTime: number | null;
      }
    | {
        type: "majorana";
        errorRate: 0.0001 | 0.00001 | 0.000001;
        operationTime: number;
        /** v1.4.0, optional. Omitted => qdk derives it from errorRate. */
        tErrorRate?: number;
        /** v1.4.0, optional. INERT on this pipeline; recorded, not influential. */
        targetYear?: number;
      }
    | {
        type: "neutralAtom";
        rydbergTime: number;
        rydbergError: number;
        singleQubitTime: number;
        singleQubitError: number;
        measurementTime: number;
        measurementError: number;
        handoffTime: number;
        atomSpacing: number;
        /** v1.4.0, optional. Omitted => estimate.py omits the kwarg, so qdk's own default applies. */
        dataQubitSpacing?: number;
        maxVelocity: number;
        maxAcceleration: number;
        surfaceCodeOneQubitTimeFactor: number;
        surfaceCodeTwoQubitTimeFactor: number;
        /** v1.4.0, optional. INERT on this pipeline; recorded, not influential. */
        targetYear?: number;
      };
  qecCode: "surface_code" | "three_aux" | "low_move_surface_code";
  /**
   * Primary factories — non-empty. estimate.py unions them into ONE ISA query
   * (`qec * (f1 + f2 + …)`), so the estimator explores every selected factory
   * and returns a single Pareto frontier across all of them.
   */
  magicStateFactories: ("round_based" | "litinski19" | "gsj24")[];
  /** Secondary factories layered on the primary factories; empty/omitted by default. */
  secondaryFactories?: ("magic_up_to_clifford" | "gsj24_ccx")[];
  /**
   * The trace pipeline's stages. estimate.py composes them in this order —
   * `DynamicMemoryCompute × PSSPC × LatticeSurgery × Unmemory` — which is the
   * only order qdk accepts. PSSPC and Lattice Surgery always run; the two v1.4.0
   * stages run only when present here.
   *
   * An ABSENT optional stage means the stage is not in the pipeline. It does not
   * mean "run it at its defaults" — see `TraceTransform` in shared/traceTransform.ts.
   */
  traceTransform: {
    tStatesPerRotation: number;
    ccxMagicStates: boolean;
    slowDownFactor: 1.0;
    dynamicMemoryCompute?: {
      computeCapacityPercentage: number;
      evictionStrategy: "least_recently_used" | "least_frequently_used" | "first_available";
    };
    unmemory?: boolean;
  };
  maxError: number;
  timeoutMs: number;
}