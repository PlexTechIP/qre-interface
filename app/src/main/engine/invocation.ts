/**
 * Internal seam between configToInvocation and execute/outputToResult.
 * Not part of the frozen contracts/ — owned entirely by this engine module.
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
        maxVelocity: number;
        maxAcceleration: number;
        surfaceCodeOneQubitTimeFactor: number;
        surfaceCodeTwoQubitTimeFactor: number;
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
   * Both stages of the trace pipeline. estimate.py composes them in this order —
   * `PSSPC.q(...) * LatticeSurgery.q(...)` — which is the only order qdk accepts.
   */
  traceTransform: {
    tStatesPerRotation: number;
    ccxMagicStates: boolean;
    slowDownFactor: 1.0;
  };
  maxError: number;
  timeoutMs: number;
}