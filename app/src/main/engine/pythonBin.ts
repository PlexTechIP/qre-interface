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
