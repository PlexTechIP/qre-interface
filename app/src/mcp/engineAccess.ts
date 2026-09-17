/**
 * Whether this server may run an estimate, and what it runs it with.
 *
 * The gate is an environment variable the analyst's MCP client carries, and it
 * is checked at REGISTRATION rather than inside the handler: with runs off,
 * `qre_run_estimate` is not in `tools/list` at all, so a model never sees a
 * tool it would be refused. That is why there is no `RUNS_DISABLED` code — the
 * state it would name is not reachable.
 *
 * An environment variable is a deliberate choice about who decides. It is set
 * where the client is configured, which is a file on the analyst's machine that
 * the model cannot reach and the server cannot change; nothing an agent sends
 * over stdio can turn running on. The dashboard's Settings toggle is a way of
 * producing that configuration, not a second gate.
 *
 * The interpreter is resolved once and cached, because `QreEngine` is stateless
 * and a stat per run buys nothing. It is resolved through the SAME
 * `resolvePythonBin` the dashboard uses, so an analyst who has run an estimate
 * in the app has already proved the path this will use — with one caveat the
 * emitted config handles: the default resolves relative to the module's own
 * directory, which is right under tsx-from-source and wrong for the packaged
 * bundle, so `QRE_PYTHON_BIN` is always written into the client config.
 */

import { accessSync, constants, statSync } from "node:fs";

import { killLiveEngineProcesses } from "../main/engine/execute.js";
import { resolvePythonBin } from "../main/engine/pythonBin.js";
import { QreEngine } from "../main/engine/qreEngine.js";
import type { EstimatorService } from "../shared/types.js";
import { logInfo } from "./logger.js";
import { RunGate } from "./runBudget.js";

/** The variable that decides whether the run tool exists at all. */
export const RUN_TOOL_ENV = "QRE_MCP_ALLOW_RUNS";

/**
 * Exactly `"1"`, and nothing else.
 *
 * Not "any truthy string": `QRE_MCP_ALLOW_RUNS=0` and `=false` are things
 * people write meaning off, and a gate that reads them as on is a gate that
 * fails open. The one accepted spelling is the one the dashboard emits.
 */
export function isRunToolEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env[RUN_TOOL_ENV] === "1";
}

export type EngineResolution =
  | { ok: true; engine: Pick<EstimatorService, "run"> }
  | { ok: false; code: "ENGINE_NOT_CONFIGURED"; message: string };

let cachedEngine: Pick<EstimatorService, "run"> | null = null;
let testEstimator: Pick<EstimatorService, "run"> | null = null;
let gate = new RunGate();
let shuttingDown = false;

/**
 * The engine, or why there isn't one.
 *
 * The message names the variable and the place in the app that sets it, never
 * the path it tried. A path is the analyst's filesystem layout, and this
 * message goes to an external MCP client — the same rule every store-access
 * message here follows.
 */
export function getEngine(): EngineResolution {
  if (testEstimator !== null) return { ok: true, engine: testEstimator };
  if (cachedEngine !== null) return { ok: true, engine: cachedEngine };

  const pythonBin = resolvePythonBin(process.env);

  try {
    if (!statSync(pythonBin).isFile()) throw new Error("not a file");
    // Readable is not enough: the thing that fails at spawn time is the
    // execute bit, and failing here says which variable to fix instead of
    // reporting an EACCES from a subprocess two minutes into a call.
    accessSync(pythonBin, constants.X_OK);
  } catch {
    return {
      ok: false,
      code: "ENGINE_NOT_CONFIGURED",
      message:
        "No Python interpreter is available to run estimates on this machine. " +
        "Set QRE_PYTHON_BIN in this server's environment to the QRE virtual " +
        "environment's interpreter — the dashboard writes it into the block under " +
        "Settings > MCP Server — and restart the client.",
    };
  }

  cachedEngine = new QreEngine(pythonBin);
  return { ok: true, engine: cachedEngine };
}

/**
 * Swap in an estimator for tests. Wins over the real one, so a test never
 * depends on whether the machine running it has a venv.
 */
export function setEstimatorForTests(
  estimator: Pick<EstimatorService, "run"> | null,
): void {
  testEstimator = estimator;
}

export function getRunGate(): RunGate {
  return gate;
}

/**
 * Kill anything the engine spawned, and refuse to persist what it was doing.
 *
 * Called first in the shutdown sequence. A SIGKILLed child makes the in-flight
 * run report `ENGINE_CRASH`, and saving that would write a failure the analyst
 * caused by quitting — indistinguishable in History from one the model's
 * configuration caused. `isShuttingDown()` is how the handler tells them apart.
 */
export function stopEngineForShutdown(): void {
  shuttingDown = true;
  killLiveEngineProcesses();
  logInfo("stopped engine subprocesses");
}

export function isShuttingDown(): boolean {
  return shuttingDown;
}

/** Reset the module between tests; pass a gate to test a budget without waiting. */
export function resetEngineAccessForTests(
  overrides: { gate?: RunGate } = {},
): void {
  cachedEngine = null;
  testEstimator = null;
  shuttingDown = false;
  gate = overrides.gate ?? new RunGate();
}
