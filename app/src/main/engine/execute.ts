import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { QreInvocation } from "./invocation.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WRAPPER_SCRIPT = path.join(__dirname, "python", "estimate.py");
const MATPLOTLIB_CONFIG = path.join(__dirname, "python", ".matplotlib");
const liveEngineProcesses = new Set<ChildProcess>();

// Explicit allowlist instead of spreading the full parent env, so secrets in
// the launching shell aren't handed to the subprocess. These specific keys
// are runtime needs of Python itself (temp dirs, home dir, Windows sockets).
const ALLOWED_ENV_KEYS = [
  "PATH",
  "HOME",
  "USERPROFILE",
  "SystemRoot",
  "TEMP",
  "TMP",
  "TMPDIR",
] as const;

export function buildEngineEnv(parentEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    MPLCONFIGDIR: MATPLOTLIB_CONFIG,
    PYTHONUTF8: "1",
    QDK_PYTHON_TELEMETRY: "none",
  };
  for (const key of ALLOWED_ENV_KEYS) {
    const value = parentEnv[key];
    if (value !== undefined) env[key] = value;
  }
  return env;
}

export function killLiveEngineProcesses(): void {
  for (const child of liveEngineProcesses) child.kill("SIGKILL");
  liveEngineProcesses.clear();
}

/**
 * The failure codes this layer may report. `INVALID_CONFIG` is here because the
 * wrapper re-validates every architecture parameter qdk itself does not check
 * (see `GATE_BASED_RULES` / `MAJORANA_RULES` / `NEUTRAL_ATOM_RULES` and
 * `checked_number` in estimate.py) — a run refused there never reached the
 * estimator, and reporting it as ESTIMATION_FAILED would tell the analyst the
 * model was infeasible when the fix is a field they can edit.
 */
export type EngineFailureCode =
  | "TIMEOUT"
  | "ENGINE_CRASH"
  | "COMPILE_ERROR"
  | "ESTIMATION_FAILED"
  | "INVALID_CONFIG";

export type ExecuteResult =
  | { ok: true; raw: Record<string, unknown> }
  | {
      ok: false;
      code: EngineFailureCode;
      message: string;
      raw: Record<string, unknown> | null;
    };

const FAILURE_CODES = new Set<string>([
  "TIMEOUT",
  "ENGINE_CRASH",
  "COMPILE_ERROR",
  "ESTIMATION_FAILED",
  "INVALID_CONFIG",
] satisfies EngineFailureCode[]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function processDiagnosticsRaw(
  stdout: string,
  stderr: string,
  exitCode: number | null,
): Record<string, unknown> | null {
  if (stdout.length === 0 && stderr.length === 0) return null;
  return { stdout, stderr, exitCode };
}

export function interpretProcessCompletion(
  exitCode: number | null,
  stdout: string,
  stderr: string,
): ExecuteResult {
  const diagnostics = processDiagnosticsRaw(stdout, stderr, exitCode);
  if (exitCode !== 0) {
    return {
      ok: false,
      code: "ENGINE_CRASH",
      message: `Engine process exited with code ${String(exitCode)}. stderr: ${stderr.slice(0, 2000)} Inspect raw diagnostics, verify the Python environment, and retry.`,
      raw: diagnostics,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout) as unknown;
  } catch {
    return {
      ok: false,
      code: "ENGINE_CRASH",
      message: `Engine produced non-JSON output. stderr: ${stderr.slice(0, 2000)} Inspect raw diagnostics and verify the qdk wrapper version.`,
      raw: diagnostics,
    };
  }

  if (!isRecord(parsed)) {
    return {
      ok: false,
      code: "ENGINE_CRASH",
      message:
        "Engine JSON was not an object. Inspect raw diagnostics and verify the qdk wrapper version.",
      raw: diagnostics,
    };
  }

  if (parsed["status"] === "failed") {
    const rawCode = String(parsed["code"] ?? "ESTIMATION_FAILED");
    const code = FAILURE_CODES.has(rawCode)
      ? (rawCode as EngineFailureCode)
      : "ESTIMATION_FAILED";
    return {
      ok: false,
      code,
      message: String(
        parsed["message"] ??
          "The engine reported a failure; adjust the configuration and retry.",
      ),
      raw: parsed,
    };
  }

  if (parsed["status"] !== "success") {
    return {
      ok: false,
      code: "ENGINE_CRASH",
      message:
        "Engine JSON omitted a recognized status. Inspect raw diagnostics and verify the qdk wrapper version.",
      raw: diagnostics,
    };
  }
  return { ok: true, raw: parsed };
}

export function execute(
  invocation: QreInvocation,
  pythonBin: string,
): Promise<ExecuteResult> {
  return new Promise((resolve) => {
    const child = spawn(pythonBin, [WRAPPER_SCRIPT], {
      env: buildEngineEnv(process.env),
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    liveEngineProcesses.add(child);

    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (result: ExecuteResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      liveEngineProcesses.delete(child);
      resolve(result);
    };

    const timer = setTimeout(() => {
      if (settled) return;
      child.kill("SIGKILL");
      finish({
        ok: false,
        code: "TIMEOUT",
        message: `Estimation exceeded ${invocation.timeoutMs}ms. Increase the timeout or simplify the run.`,
        raw: processDiagnosticsRaw(stdout, stderr, null),
      });
    }, invocation.timeoutMs);

    child.on("error", (error) => {
      finish({
        ok: false,
        code: "ENGINE_CRASH",
        message: `Failed to start engine process: ${error.message}. Verify the configured Python environment.`,
        raw: processDiagnosticsRaw(stdout, stderr, null),
      });
    });

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    // A spawn failure can also surface on stdin after the process error. The
    // process-level handler above owns the user-visible result.
    child.stdin.on("error", () => undefined);

    child.on("close", (exitCode) => {
      if (settled) return;
      finish(interpretProcessCompletion(exitCode, stdout, stderr));
    });

    child.stdin.end(JSON.stringify(invocation));
  });
}
