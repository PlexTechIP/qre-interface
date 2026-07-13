import type { RunConfig } from "../../shared/types.js";
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
    program = { sourcePath: entry.sourcePath, format: entry.format, entryExpr: entry.entryExpr };
  } else {
    if (!config.application.filePath) {
      return invalid("Uploaded program is missing a file path.");
    }
    program = { sourcePath: config.application.filePath, format: config.application.format, entryExpr: "" };
  }

  // --- architecture <-> qecCode coupling ---
  const architecture = config.architecture;
  if (architecture.type === "gateBased") {
    if (config.qecCode !== "surface_code") {
      return invalid(
        `GateBased architecture requires qecCode "surface_code", got "${config.qecCode}".`,
      );
    }
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
  } else {
    if (config.qecCode !== "three_aux") {
      return invalid(`Majorana architecture requires qecCode "three_aux", got "${config.qecCode}".`);
    }
    if (![0.0001, 0.00001, 0.000001].includes(architecture.errorRate)) {
      return invalid(`Majorana errorRate must be one of 1e-4, 1e-5, 1e-6, got ${architecture.errorRate}.`);
    }
    if (!(architecture.operationTime > 0)) {
      return invalid(`Majorana operationTime must be > 0, got ${architecture.operationTime}.`);
    }
    if (config.magicStateFactory !== "round_based") {
      return invalid(`Majorana architectures only support magicStateFactory "round_based".`);
    }
  }

  // --- magic state factory eligibility ---
  if (config.magicStateFactory === "litinski19") {
    if (architecture.type !== "gateBased" || !(architecture.errorRate <= 0.001)) {
      return invalid(
        "litinski19 magic state factory requires a GateBased architecture with errorRate <= 1e-3.",
      );
    }
  }

  // --- trace transform ---
  const traceTransform = config.traceTransform;
  if (traceTransform.type === "psspc") {
    if (!(traceTransform.tStatesPerRotation >= 5 && traceTransform.tStatesPerRotation <= 20)) {
      return invalid(
        `PSSPC tStatesPerRotation must be in [5, 20], got ${traceTransform.tStatesPerRotation}.`,
      );
    }
  } else {
    if (traceTransform.slowDownFactor !== 1.0) {
      return invalid(`latticeSurgery slowDownFactor must be 1.0, got ${traceTransform.slowDownFactor}.`);
    }
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
          : { type: "majorana", errorRate: architecture.errorRate, operationTime: architecture.operationTime },
      qecCode: config.qecCode,
      magicStateFactory: config.magicStateFactory,
      traceTransform:
        traceTransform.type === "psspc"
          ? { type: "psspc", tStatesPerRotation: traceTransform.tStatesPerRotation, ccxMagicStates: traceTransform.ccxMagicStates }
          : { type: "latticeSurgery", slowDownFactor: 1.0 },
      maxError: config.maxError,
      timeoutMs,
    },
  };
}
