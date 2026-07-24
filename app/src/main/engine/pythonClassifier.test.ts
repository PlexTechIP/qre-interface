import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { resolvePythonBin } from "./pythonBin.js";

const engineDir = path.dirname(fileURLToPath(import.meta.url));

describe("Python failure classifier", () => {
  it("does not classify compiler-like message substrings as COMPILE_ERROR", () => {
    const process = spawnSync(
      resolvePythonBin(),
      [
        "-c",
        "from estimate import failure_code_for; assert failure_code_for(RuntimeError('compiler resolve openqasm qsharp')) == 'ESTIMATION_FAILED'",
      ],
      { cwd: path.join(engineDir, "python"), encoding: "utf8" },
    );

    expect(process.status, process.stderr).toBe(0);
  }, 15_000);
});
