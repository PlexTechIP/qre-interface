import path from "node:path";
import { describe, expect, it } from "vitest";
import { packagedPythonBin, resolvePythonBin } from "./pythonBin.js";

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

describe("packagedPythonBin", () => {
  // The bundled standalone interpreter is NOT a venv: on Windows the executable
  // is at the distribution root, elsewhere under bin/. It must never resolve to
  // the dev `.venv`, which does not exist in a packaged app.
  it("points at the Windows standalone runtime root", () => {
    expect(packagedPythonBin(ENGINE_DIR, "win32")).toBe(
      path.join(ENGINE_DIR, "python", "runtime", "python.exe"),
    );
  });

  it("points at the POSIX standalone runtime bin", () => {
    expect(packagedPythonBin(ENGINE_DIR, "darwin")).toBe(
      path.join(ENGINE_DIR, "python", "runtime", "bin", "python3"),
    );
  });
});
