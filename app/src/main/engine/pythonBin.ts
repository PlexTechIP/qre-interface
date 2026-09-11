import path from "node:path";
import { fileURLToPath } from "node:url";

const ENGINE_DIR = path.dirname(fileURLToPath(import.meta.url));

/** Resolve the pinned QRE virtual-environment interpreter on every supported OS. */
export function resolvePythonBin(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  engineDir: string = ENGINE_DIR,
): string {
  const override = env["QRE_PYTHON_BIN"]?.trim();
  if (override) return override;

  return path.join(
    engineDir,
    "python",
    ".venv",
    platform === "win32" ? "Scripts" : "bin",
    platform === "win32" ? "python.exe" : "python3",
  );
}

/**
 * Resolve the interpreter inside the packaged, self-contained engine bundle.
 *
 * The release build ships a relocatable standalone CPython (from
 * python-build-standalone) with `qdk[qre]` installed into it, laid out under
 * `<engineDir>/python/runtime`. That is not a venv — a venv records an absolute
 * path to its base interpreter and does not survive being moved onto a user's
 * machine — so its layout differs from the dev `.venv` above: the interpreter
 * sits at the distribution root on Windows and under `bin/` elsewhere.
 */
export function packagedPythonBin(
  engineDir: string,
  platform: NodeJS.Platform = process.platform,
): string {
  const runtime = path.join(engineDir, "python", "runtime");
  return platform === "win32"
    ? path.join(runtime, "python.exe")
    : path.join(runtime, "bin", "python3");
}
