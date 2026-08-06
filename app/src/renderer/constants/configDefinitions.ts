export const CONFIG_DEFINITIONS = {
  applicationType:
    "Choose whether the run estimates a built-in benchmark, a saved uploaded program, or a new Q#/OpenQASM/QIR upload.",
  benchmark:
    "Canonical QRE sample program. Benchmark-specific hyperparameters tune the generated workload before estimation.",
  savedPrograms:
    "Programs uploaded earlier in this session that can be re-selected without picking the source file again.",
  uploadProgram:
    "Q#, OpenQASM, or QIR source/bitcode file to compile or ingest for resource estimation.",
  architecture:
    "Physical hardware model whose supported operations, timings, and error rates drive the resource estimate.",
  errorRate:
    "Physical operation error probability used by the hardware model. Lower error rates usually reduce QEC overhead.",
  singleQubitGateTime:
    "Duration of a one-qubit physical gate in nanoseconds.",
  measurementTime:
    "Duration of a physical qubit measurement in nanoseconds.",
  twoQubitGateTime:
    "Optional duration of a two-qubit physical gate. Leave blank to use the engine/default assumption.",
  majoranaErrorRate:
    "Majorana physical operation error assumption. The current contract only accepts 1e-4, 1e-5, or 1e-6.",
  majoranaOperationTime:
    "Duration of a Majorana primitive operation in nanoseconds.",
  qecCode:
    "Quantum error-correction encoding used to protect logical qubits. In this UI it is locked to the selected architecture.",
  magicStateFactory:
    "Factory model that produces magic/T states for universal fault-tolerant computation. It can dominate qubit count and runtime.",
  secondaryFactory:
    "Optional specialized magic-state factory selection. This renderer-only control defaults to None.",
  memoryOptimization:
    "Optional yoked-surface-code memory optimization. This renderer-only control defaults to None.",
  traceTransform:
    "Compilation strategy for mapping the logical operation trace onto the QEC fabric.",
  tStatesPerRotation:
    "Number of T states spent synthesizing each arbitrary rotation in PSSPC.",
  ccxMagicStates:
    "Whether Toffoli/CCX operations consume dedicated CCX magic states.",
  latticeSlowdown:
    "Lattice-surgery timing multiplier. This build fixes it at 1.0.",
  maxError:
    "Cap on total fault-tolerant execution error for the computation.",
  runName:
    "Optional display name for history and results. Blank runs use an auto-generated name.",
} as const;

export const HYPERPARAMETER_DEFINITIONS: Record<string, string> = {
  bitSize: "Number of bits in the integer factored by Shor's algorithm.",
  generator: "Classical generator/base parameter used by the selected factoring benchmark.",
  rsaInstance: "Predefined RSA modulus size for the Ekerå-Håstad factoring benchmark.",
  latticeN1: "First lattice dimension for the quantum dynamics simulation.",
  latticeN2: "Second lattice dimension for the quantum dynamics simulation.",
  totalTime: "Total simulated evolution time for the quantum dynamics workload.",
  trotterStep: "Simulation time step used for Trotterization; it cannot exceed Total Time.",
  couplingJ: "Coupling constant J in the quantum dynamics model.",
  fieldG: "Field strength g in the quantum dynamics model.",
  searchQubits: "Number of qubits in Grover's search space.",
  iterations: "Grover iteration count derived from Search Qubits during estimation.",
  precision: "Number of precision bits requested by the phase-estimation workload.",
  registerSize: "Register size used by the phase-estimation workload.",
};
