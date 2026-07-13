import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { QreInvocation } from "./invocation.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WRAPPER_SCRIPT = path.join(__dirname, "python", "estimate.py");
const MATPLOTLIB_CONFIG = path.join(__dirname, "python", ".matplotlib");

export type ExecuteResult =
  | { ok: true; raw: Record<string, unknown> }
  | {
      ok: false;
      code: "TIMEOUT" | "ENGINE_CRASH" | "COMPILE_ERROR" | "ESTIMATION_FAILED";
      message: string;
      raw: Record<string, unknown> | null;
    };

const FAILURE_CODES = new Set([
  "TIMEOUT",
  "ENGINE_CRASH",
  "COMPILE_ERROR",
  "ESTIMATION_FAILED",
]);

export function execute(
  invocation: QreInvocation,
  pythonBin: string,
): Promise<ExecuteResult> {
  return new Promise((resolve) => {
    const child = spawn(pythonBin, [WRAPPER_SCRIPT], {
      env: {
        ...process.env,
        MPLCONFIGDIR: MATPLOTLIB_CONFIG,
        PYTHONUTF8: "1",
        QDK_PYTHON_TELEMETRY: "none",
      },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (result: ExecuteResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const timer = setTimeout(() => {
      if (settled) return;
      child.kill("SIGKILL");
      finish({
        ok: false,
        code: "TIMEOUT",
        message: `Estimation exceeded ${invocation.timeoutMs}ms. Increase the timeout or simplify the run.`,
        raw: null,
      });
    }, invocation.timeoutMs);

    child.on("error", (error) => {
      finish({
        ok: false,
        code: "ENGINE_CRASH",
        message: `Failed to start engine process: ${error.message}. Verify the configured Python environment.`,
        raw: null,
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
      if (exitCode !== 0) {
        finish({
          ok: false,
          code: "ENGINE_CRASH",
          message: `Engine process exited with code ${String(exitCode)}. stderr: ${stderr.slice(0, 2000)}`,
          raw: null,
        });
        return;
      }

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(stdout) as Record<string, unknown>;
      } catch {
        finish({
          ok: false,
          code: "ENGINE_CRASH",
          message: `Engine produced non-JSON output. stderr: ${stderr.slice(0, 2000)}`,
          raw: null,
        });
        return;
      }

      if (parsed["status"] === "failed") {
        const rawCode = String(parsed["code"] ?? "ESTIMATION_FAILED");
        const code = FAILURE_CODES.has(rawCode)
          ? (rawCode as
              | "TIMEOUT"
              | "ENGINE_CRASH"
              | "COMPILE_ERROR"
              | "ESTIMATION_FAILED")
          : "ESTIMATION_FAILED";
        finish({
          ok: false,
          code,
          message: String(
            parsed["message"] ??
              "The engine reported a failure; adjust the configuration and retry.",
          ),
          raw: parsed,
        });
        return;
      }

      if (parsed["status"] !== "success") {
        finish({
          ok: false,
          code: "ENGINE_CRASH",
          message:
            "Engine JSON omitted a recognized status. Verify the qdk wrapper version.",
          raw: null,
        });
        return;
      }
      finish({ ok: true, raw: parsed });
    });

    child.stdin.end(JSON.stringify(invocation));
  });
}
