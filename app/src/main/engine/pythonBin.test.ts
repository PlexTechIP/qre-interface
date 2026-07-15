import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolvePythonBin } from "./pythonBin.js";

const ENGINE_DIR = path.join("workspace", "app", "src", "main", "engine");

describe("resolvePythonBin", () => {
  it("honors an explicit QRE_PYTHON_BIN override", () => {
    expect(
      resolvePythonBin(
        { QRE_PYTHON_BIN: "  custom-python  " },
        "win32",
        ENGINE_DIR,
      ),
    ).toBe("custom-python");
  });

  it("uses the Windows virtual-environment layout", () => {
    expect(resolvePythonBin({}, "win32", ENGINE_DIR)).toBe(
      path.join(ENGINE_DIR, "python", ".venv", "Scripts", "python.exe"),
    );
  });

  it("uses the POSIX virtual-environment layout", () => {
    expect(resolvePythonBin({}, "linux", ENGINE_DIR)).toBe(
      path.join(ENGINE_DIR, "python", ".venv", "bin", "python3"),
    );
  });
});
