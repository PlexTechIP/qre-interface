import type { RunConfig } from "../../shared/types.js";
import {
  expectedQecCode,
  isGsj24Allowed,
  isLitinski19Allowed,
} from "../../shared/types.js";
import { buildBenchmarkEntryExpr } from "../../shared/benchmarkParams.js";
import { parseTraceTransform } from "../../shared/traceTransform.js";
import type { QreInvocation } from "./invocation.js";
import { resolveBenchmark } from "./benchmarkRegistry.js";
 
export type ConfigToInvocationResult =
  | { ok: true; invocation: QreInvocation }
  | { ok: false; error: { code: "INVALID_CONFIG"; message: string } };
 
function invalid(message: string): ConfigToInvocationResult {
  return { ok: false, error: { code: "INVALID_CONFIG", message } };
}
 
export function configToInvocation(config: RunConfig, timeoutMs: number): ConfigToInvocationResult {
  // --- application ---
  let program: QreInvocation["program"];
  if (config.application.type === "benchmark") {
    const entry = resolveBenchmark(config.application.benchmarkId);
    if (!entry) {
      return invalid(
        `Unknown benchmark id "${config.application.benchmarkId}". Choose one of the starter benchmarks or upload a program.`,
      );
    }
    // The recorded hyperparameters become the entry operation's arguments, so
    // they size the circuit the estimator actually traces. Anything outside its
    // spec is refused here rather than emitted into Q# source.
    const built = buildBenchmarkEntryExpr(entry.id, config.parameters);
    if (!built.ok) {
      return invalid(
        `${built.message} Correct the benchmark hyperparameter and retry.`,
      );
    }
    program = {
      sourcePath: entry.sourcePath,
      format: entry.format,
      entryExpr: built.entryExpr,
    };
  } else if (config.application.type === "manualCounts") {
    const c = config.application;
    const counts: Record<string, number> = {
      numQubits: c.numQubits,
      tCount: c.tCount,
      rotationCount: c.rotationCount,
      rotationDepth: c.rotationDepth,
      cczCount: c.cczCount,
      ccixCount: c.ccixCount,
      measurementCount: c.measurementCount,
    };
    for (const [key, value] of Object.entries(counts)) {
      const min = key === "numQubits" ? 1 : 0;
      if (!Number.isInteger(value) || value < min) {
        return invalid(`Manual logical count "${key}" must be an integer >= ${min}, got ${value}.`);
      }
    }
    if (c.rotationDepth > c.rotationCount) {
      return invalid(
        `Manual logical count "rotationDepth" (${c.rotationDepth}) cannot exceed "rotationCount" (${c.rotationCount}).`,
      );
    }
    program = {
      format: "logicalCounts",
      logicalCounts: {
        numQubits: c.numQubits,
        tCount: c.tCount,
        rotationCount: c.rotationCount,
        rotationDepth: c.rotationDepth,
        cczCount: c.cczCount,
        ccixCount: c.ccixCount,
        measurementCount: c.measurementCount,
      },
    };
  } else {
    if (!config.application.filePath) {
      return invalid("Uploaded program is missing a file path.");
    }
    program = { sourcePath: config.application.filePath, format: config.application.format, entryExpr: "" };
  }
 
  // --- architecture <-> qecCode coupling ---
  const architecture = config.architecture;
  const expectedQec = expectedQecCode(architecture);
  if (config.qecCode !== expectedQec) {
    return invalid(
      `${architecture.type} architecture requires qecCode "${expectedQec}", got "${config.qecCode}".`,
    );
  }
  if (architecture.type === "gateBased") {
    if (!(architecture.errorRate > 0 && architecture.errorRate < 0.01)) {
      return invalid(`GateBased errorRate must be in (0, 0.01), got ${architecture.errorRate}.`);
    }
    if (!(architecture.gateTime > 0)) {
      return invalid(`GateBased gateTime must be > 0, got ${architecture.gateTime}.`);
    }
    if (!(architecture.measurementTime > 0)) {
      return invalid(`GateBased measurementTime must be > 0, got ${architecture.measurementTime}.`);
    }
    if (architecture.twoQubitGateTime != null && !(architecture.twoQubitGateTime > 0)) {
      return invalid(`GateBased twoQubitGateTime must be null or > 0, got ${architecture.twoQubitGateTime}.`);
    }
  } else if (architecture.type === "majorana") {
    if (![0.0001, 0.00001, 0.000001].includes(architecture.errorRate)) {
      return invalid(`Majorana errorRate must be one of 1e-4, 1e-5, 1e-6, got ${architecture.errorRate}.`);
    }
    if (!(architecture.operationTime > 0)) {
      return invalid(`Majorana operationTime must be > 0, got ${architecture.operationTime}.`);
    }
    if (config.magicStateFactory !== "round_based") {
      return invalid(`Majorana architectures only support magicStateFactory "round_based".`);
    }
  } else {
    // Neutral Atom: integer times > 0 (handoff >= 0), the three error rates in
    // [0, 0.01), spacing/velocity/acceleration > 0, factors integers >= 1.
    const na = architecture;
    const posInt = (v: number, name: string): ConfigToInvocationResult | null =>
      Number.isInteger(v) && v > 0 ? null : invalid(`NeutralAtom ${name} must be an integer > 0, got ${v}.`);
    const errRate = (v: number, name: string): ConfigToInvocationResult | null =>
      v >= 0 && v < 0.01 ? null : invalid(`NeutralAtom ${name} must be in [0, 0.01), got ${v}.`);
    const positive = (v: number, name: string): ConfigToInvocationResult | null =>
      v > 0 ? null : invalid(`NeutralAtom ${name} must be > 0, got ${v}.`);
    const factor = (v: number, name: string): ConfigToInvocationResult | null =>
      Number.isInteger(v) && v >= 1 ? null : invalid(`NeutralAtom ${name} must be an integer >= 1, got ${v}.`);
    const checks = [
      posInt(na.rydbergTime, "rydbergTime"),
      errRate(na.rydbergError, "rydbergError"),
      posInt(na.singleQubitTime, "singleQubitTime"),
      errRate(na.singleQubitError, "singleQubitError"),
      posInt(na.measurementTime, "measurementTime"),
      errRate(na.measurementError, "measurementError"),
      Number.isInteger(na.handoffTime) && na.handoffTime >= 0
        ? null
        : invalid(`NeutralAtom handoffTime must be an integer >= 0, got ${na.handoffTime}.`),
      positive(na.atomSpacing, "atomSpacing"),
      positive(na.maxVelocity, "maxVelocity"),
      positive(na.maxAcceleration, "maxAcceleration"),
      factor(na.surfaceCodeOneQubitTimeFactor, "surfaceCodeOneQubitTimeFactor"),
      factor(na.surfaceCodeTwoQubitTimeFactor, "surfaceCodeTwoQubitTimeFactor"),
    ];
    for (const failure of checks) {
      if (failure) return failure;
    }
  }
 
  // --- magic state factory eligibility (delegates to the contract rules) ---
  if (config.magicStateFactory === "litinski19" && !isLitinski19Allowed(architecture)) {
    return invalid(
      "litinski19 magic state factory requires Superconducting (errorRate <= 1e-3) or Neutral Atom (all errors <= 1e-3).",
    );
  }
  if (config.magicStateFactory === "gsj24" && !isGsj24Allowed(architecture)) {
    return invalid(
      "gsj24 magic state factory requires Superconducting (errorRate <= 1e-3) or Neutral Atom (rydberg <= 1e-3, single-qubit and measurement < 1e-2).",
    );
  }
  // magic_up_to_clifford is incompatible with Majorana.
  if (
    architecture.type === "majorana" &&
    (config.secondaryFactories ?? []).includes("magic_up_to_clifford")
  ) {
    return invalid("magic_up_to_clifford secondary factory is not compatible with Majorana architectures.");
  }
 
  // --- trace transform (one pipeline; both stages always run) ---
  // Parsed strictly, NOT normalized: normalization repairs a malformed record
  // so the UI can still render it, and repairing on the way into the engine
  // would run a configuration the saved record does not describe.
  const parsedTransform = parseTraceTransform(config.traceTransform);
  if (!parsedTransform.ok) {
    return invalid(parsedTransform.message);
  }
  const traceTransform = parsedTransform.transform;
  if (!(traceTransform.tStatesPerRotation >= 5 && traceTransform.tStatesPerRotation <= 20)) {
    return invalid(
      `PSSPC tStatesPerRotation must be in [5, 20], got ${traceTransform.tStatesPerRotation}.`,
    );
  }
 
  // --- maxError: range-checked only; unsatisfiability is NOT validated here ---
  if (!(config.maxError > 0 && config.maxError <= 1)) {
    return invalid(`maxError must be in (0, 1], got ${config.maxError}.`);
  }
 
  return {
    ok: true,
    invocation: {
      program,
      architecture:
        architecture.type === "gateBased"
          ? {
              type: "gateBased",
              errorRate: architecture.errorRate,
              gateTime: architecture.gateTime,
              measurementTime: architecture.measurementTime,
              twoQubitGateTime: architecture.twoQubitGateTime ?? null,
            }
          : architecture.type === "majorana"
            ? { type: "majorana", errorRate: architecture.errorRate, operationTime: architecture.operationTime }
            : {
                type: "neutralAtom",
                rydbergTime: architecture.rydbergTime,
                rydbergError: architecture.rydbergError,
                singleQubitTime: architecture.singleQubitTime,
                singleQubitError: architecture.singleQubitError,
                measurementTime: architecture.measurementTime,
                measurementError: architecture.measurementError,
                handoffTime: architecture.handoffTime,
                atomSpacing: architecture.atomSpacing,
                maxVelocity: architecture.maxVelocity,
                maxAcceleration: architecture.maxAcceleration,
                surfaceCodeOneQubitTimeFactor: architecture.surfaceCodeOneQubitTimeFactor,
                surfaceCodeTwoQubitTimeFactor: architecture.surfaceCodeTwoQubitTimeFactor,
              },
      qecCode: config.qecCode,
      magicStateFactory: config.magicStateFactory,
      secondaryFactories: config.secondaryFactories ?? [],
      traceTransform,
      maxError: config.maxError,
      timeoutMs,
    },
  };
}