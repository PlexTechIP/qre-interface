/**
 * Tooltip copy for the configuration surface.
 *
 * EVERY string here is transcribed VERBATIM from `docs/features-and-fields.md`
 * § Config Descriptions (Preston's tab, added 2026-07-31). That document is the
 * source of truth for this copy and this file is a mirror of it — if a phrasing
 * reads oddly, the fix is a channel message and an edit there, not an edit here.
 * Rewriting a string locally is what makes the repo and the Google Doc disagree.
 *
 * Two consequences worth knowing:
 *
 *  - **Trotter Step carries the CORRECTED wording.** The Google Doc's original
 *    ("the number of discrete steps used to approximate the system evolution")
 *    describes a step COUNT, but the field is a step SIZE — `QuantumDynamics.qs`
 *    derives the count as `ceil(totalTime / trotterStep)`. Shipping the original
 *    would tell an analyst the default 0.9 means "0.9 steps".
 *
 *  - **Controls with no canonical copy carry no tooltip.** Application Type,
 *    Select Benchmark, Your Programs and Upload Program are not in the Config
 *    Descriptions tab. An invented tooltip is worse than none: it reads as
 *    reviewed product copy while being one engineer's guess. They are listed in
 *    the PR description as copy to request.
 */

/** Fields whose key is unambiguous across the form. */
export const CONFIG_DEFINITIONS = {
  maxError:
    "The maximum allowed error probability for the entire fault-tolerant computation. Lower values require additional resources to achieve higher reliability.",
} as const;

/** QEC Code, per option — the control is locked, but the copy explains each. */
export const QEC_CODE_DEFINITIONS: Record<string, string> = {
  surface_code:
    "A quantum error correction method used to protect logical qubits from physical errors in gate-based architectures.",
  three_aux:
    "A quantum error correction method using additional auxiliary qubits for stabilizer measurements in Majorana architectures.",
  low_move_surface_code:
    "A surface code optimized for neutral-atom architectures with mobile qubits.",
};

/**
 * The five Magic State Factory options, in one list. The former "Secondary
 * Factory" members carry their own copy; the analyst never sees the split.
 */
export const FACTORY_DEFINITIONS: Record<string, string> = {
  round_based:
    "A method for producing high-quality magic states used for non-Clifford operations such as T gates.",
  litinski19:
    "A magic state factory design based on Litinski's 2019 fault-tolerant quantum computing architecture.",
  gsj24:
    "A magic state cultivation method that produces high-quality T states from physical operations.",
  magic_up_to_clifford:
    "An optimization that converts certain magic operations into equivalent Clifford operations to reduce resource costs.",
  gsj24_ccx:
    "A factory that converts magic states into CCX (Toffoli) resources for fault-tolerant computation.",
};

/** Memory Optimization: the section's own copy, then each yoked code. */
export const MEMORY_OPTIMIZATION_DEFINITIONS: Record<string, string> = {
  section:
    "Memory optimization techniques that reduce quantum memory resource requirements.",
  yoked_1d:
    "A memory optimization technique using a 1D yoked surface code structure to reduce quantum memory resource requirements.",
  yoked_2d:
    "A memory optimization technique using a 2D yoked surface code structure to reduce quantum memory resource requirements.",
};

/** The four pipeline stages and their parameters. */
export const TRACE_TRANSFORM_DEFINITIONS = {
  dynamicMemoryCompute:
    "An optimization technique that dynamically manages quantum memory resources during execution.",
  computeCapacityPercentage:
    "The percentage of available memory resources reserved for active computation. Higher values allocate more resources to computation and less to memory storage.",
  evictionStrategy:
    "The strategy used to decide which stored quantum data is removed from memory when additional space is needed.",
  psspc:
    "A compilation method that converts logical operations into fault-tolerant resources for estimation, including rotation synthesis and non-Clifford resource accounting.",
  tStatesPerRotation:
    "The number of T gates used to approximate arbitrary rotation operations. Higher values increase non-Clifford resource requirements and may increase physical resource estimates.",
  ccxMagicStates:
    "Determines whether CCX (Toffoli) operations are represented using dedicated magic states during resource estimation.",
  latticeSurgery:
    "A compilation method that models fault-tolerant operations using lattice surgery techniques.",
  slowDownFactor:
    "A multiplier applied to operation timing when estimating runtime using lattice surgery. Higher values increase the estimated runtime.",
  unmemory:
    "Reverses Dynamic Memory Compute by removing memory operations and mapping memory qubits back to compute qubits. This produces a trace without a memory model.",
} as const;

/** Superconducting (GateBased) QPU fields. */
export const GATE_BASED_DEFINITIONS = {
  errorRate:
    "The error probability for physical gate operations on hardware qubits. Lower error rates reduce the overhead required for error correction.",
  gateTime:
    "The time required to perform a physical single-qubit operation. Affects the estimated runtime of the quantum computation.",
  measurementTime:
    "The time required to measure physical qubits. Affects the estimated runtime of operations that require measurement.",
  twoQubitGateTime:
    "The time required for physical two-qubit operations such as CNOT and CZ gates. Two-qubit operations often contribute significantly to estimated runtime.",
} as const;

/** Majorana QPU fields, including the two added by contract v1.4.0. */
export const MAJORANA_DEFINITIONS = {
  errorRate:
    "The error probability for physical Clifford operations. This value is used to model hardware reliability and determine error correction requirements.",
  tErrorRate:
    "The error probability for physical T gate operations. If not specified, it is automatically derived from the general error rate. This affects the resources required for fault-tolerant T gate execution.",
  operationTime:
    "The time required for physical operations, including Clifford operations and T gates. Affects the estimated runtime.",
  targetYear:
    "Specifies the target hardware generation. Currently has no effect unless a compatible trace transform is enabled.",
} as const;

/** Neutral Atom QPU fields, including the two added by contract v1.4.0. */
export const NEUTRAL_ATOM_DEFINITIONS = {
  rydbergTime:
    "The duration of physical two-qubit interactions between neutral atoms. Affects the estimated runtime.",
  rydbergError:
    "The error probability of physical two-qubit interactions between neutral atoms. Affects the required error correction overhead.",
  singleQubitTime:
    "The duration of physical single-qubit operations on neutral atoms.",
  singleQubitError:
    "The error probability of physical single-qubit operations on neutral atoms.",
  measurementTime: "The duration of physical qubit measurement operations.",
  measurementError:
    "The error probability associated with measuring physical qubits.",
  handoffTime:
    "The time required to move atoms between computational regions. Affects estimated runtime in movement-aware architectures.",
  atomSpacing:
    "The physical spacing between atoms used when modeling atom placement and movement.",
  dataQubitSpacing:
    "The spacing between data qubits used in the physical layout model.",
  maxVelocity:
    "The maximum speed at which atoms can be transported during computation.",
  maxAcceleration:
    "The maximum acceleration allowed when transporting atoms.",
  surfaceCodeOneQubitTimeFactor:
    "A multiplier that adjusts estimated single-qubit operation timing during surface code error correction.",
  surfaceCodeTwoQubitTimeFactor:
    "A multiplier that adjusts estimated two-qubit operation timing during surface code error correction.",
  targetYear:
    "Specifies the target hardware generation. Currently has no effect unless a compatible trace transform is enabled.",
} as const;

/**
 * The seven Manual Logical Counts fields — the POC's stated top priority, keyed
 * by contract id. The section's own copy is `MANUAL_COUNTS_SECTION`.
 */
export const MANUAL_COUNTS_SECTION =
  "Manually specify the logical resource requirements of a quantum program. These values represent logical operations before physical hardware and error correction overhead are applied.";

export const MANUAL_COUNT_DEFINITIONS: Record<string, string> = {
  numQubits:
    "The number of logical qubits required by the quantum program. The QRE uses this value to estimate the physical qubit resources needed after error correction.",
  tCount:
    "The total number of logical T gates required by the quantum program. T gates are non-Clifford operations that require additional resources in fault-tolerant quantum computation.",
  rotationCount:
    "The total number of logical rotation operations in the quantum program. Rotations are typically decomposed into fault-tolerant operations for resource estimation.",
  rotationDepth:
    "The maximum number of sequential rotation operations in the quantum program. This affects the depth of the computation and estimated runtime.",
  cczCount:
    "The total number of logical CCZ (controlled-controlled-Z) operations required by the quantum program. CCZ operations contribute to non-Clifford resource requirements.",
  ccixCount:
    "The total number of logical CCiX (controlled-controlled-iX) operations required by the quantum program. These operations contribute to fault-tolerant resource estimates.",
  measurementCount:
    "The total number of logical measurement operations required by the quantum program. Measurements contribute to the estimated runtime and resource requirements.",
};

/**
 * Benchmark hyperparameters, keyed by the `BenchmarkParamSpec` key. `generator`
 * is shared by Shor's and Ekerå-Håstad and the source doc gives each its own
 * wording, so the Ekerå-Håstad one is keyed separately by the caller.
 */
export const HYPERPARAMETER_DEFINITIONS: Record<string, string> = {
  bitSize: "The number of bits in the integer being factored.",
  generator: "The integer base used to generate the factoring instance.",
  rsaInstance: "The RSA key size (in bits) of the integer being factored.",
  latticeN1:
    "The number of spins (sites) along the first dimension of the 2D lattice.",
  latticeN2:
    "The number of spins (sites) along the second dimension of the 2D lattice.",
  totalTime: "The total duration of the simulated quantum system evolution.",
  trotterStep:
    "The simulated time advanced by each Trotter step. The evolution runs ceil(Total Time ÷ Trotter Step) steps, so smaller values approximate the dynamics more accurately and produce a deeper circuit.",
  couplingJ:
    "The strength of the interaction between neighboring spins in the lattice.",
  fieldG:
    "The strength of the transverse magnetic field applied to the spins.",
  searchQubits:
    "The number of qubits used to represent the search space. A system with n search qubits represents 2ⁿ possible items.",
  iterations:
    "The number of Grover search iterations performed to amplify the probability of finding the target item.",
  precision:
    "The number of bits of accuracy used to represent the estimated phase. Higher precision requires additional quantum resources.",
  registerSize:
    "The number of qubits used in the phase estimation register. Larger registers provide higher precision but increase resource requirements.",
};

/** Ekerå-Håstad's Generator has its own wording in the source doc. */
export const EKERA_HASTAD_GENERATOR_DEFINITION =
  "The integer base used by the factoring algorithm to generate the problem instance.";
