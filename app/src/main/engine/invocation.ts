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
      };
  qecCode: "surface_code" | "three_aux";
  magicStateFactory: "round_based" | "litinski19";
  traceTransform:
    | { type: "psspc"; tStatesPerRotation: number; ccxMagicStates: boolean }
    | { type: "latticeSurgery"; slowDownFactor: 1.0 };
  maxError: number;
  timeoutMs: number;
}
