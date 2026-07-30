import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  checkContentPlausible,
  checkExtensionMatchesFormat,
  preflightUploadedProgram,
} from "./uploadValidation.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploads = (name: string): string => path.join(__dirname, "uploads", name);

describe("checkExtensionMatchesFormat", () => {
  it("accepts the canonical extension for each format", () => {
    expect(checkExtensionMatchesFormat("prog.qs", "qsharp").ok).toBe(true);
    expect(checkExtensionMatchesFormat("prog.qasm", "openqasm").ok).toBe(true);
    expect(checkExtensionMatchesFormat("prog.ll", "qir").ok).toBe(true);
    expect(checkExtensionMatchesFormat("prog.bc", "qir").ok).toBe(true);
  });

  it("is case-insensitive on the extension", () => {
    expect(checkExtensionMatchesFormat("PROG.QASM", "openqasm").ok).toBe(true);
  });

  it("rejects a mismatched extension with an explanatory message", () => {
    const result = checkExtensionMatchesFormat("prog.qasm", "qsharp");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("INVALID_CONFIG");
      expect(result.message).toContain(".qasm");
      expect(result.message).toContain("Q#");
    }
  });

  it("rejects a file with no extension", () => {
    const result = checkExtensionMatchesFormat("prog", "openqasm");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("no extension");
  });
});

describe("checkContentPlausible", () => {
  it("rejects an empty file", () => {
    const result = checkContentPlausible("openqasm", Buffer.from(""));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("empty");
  });

  it("accepts a well-formed OpenQASM program", () => {
    const src = 'OPENQASM 3.0;\ninclude "stdgates.inc";\nqubit[2] q;\n';
    expect(checkContentPlausible("openqasm", Buffer.from(src)).ok).toBe(true);
  });

  it("rejects OpenQASM missing its version header", () => {
    const result = checkContentPlausible("openqasm", Buffer.from("qubit[2] q;"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("version header");
  });

  it("rejects an OpenQASM header with no recognizable statements", () => {
    const result = checkContentPlausible(
      "openqasm",
      Buffer.from("OPENQASM 3.0;\nthis is not valid openqasm at all !!!\n"),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("no recognizable statements");
  });

  it("accepts a Q# program with an operation declaration", () => {
    const src = "namespace Foo {\n  operation Main() : Unit {}\n}";
    expect(checkContentPlausible("qsharp", Buffer.from(src)).ok).toBe(true);
  });

  it("rejects Q# gibberish", () => {
    const result = checkContentPlausible("qsharp", Buffer.from("just words here"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("Q#");
  });

  it("accepts textual QIR (LLVM IR)", () => {
    const src = "target datalayout = \"e\"\ndefine void @main() {\n  ret void\n}";
    expect(checkContentPlausible("qir", Buffer.from(src)).ok).toBe(true);
  });

  it("accepts raw LLVM bitcode by magic number", () => {
    const bitcode = Buffer.from([0x42, 0x43, 0xc0, 0xde, 0x00, 0x01]);
    expect(checkContentPlausible("qir", bitcode).ok).toBe(true);
  });

  it("accepts wrapped LLVM bitcode by magic number", () => {
    const wrapped = Buffer.from([0xde, 0xc0, 0x17, 0x0b, 0x00, 0x01]);
    expect(checkContentPlausible("qir", wrapped).ok).toBe(true);
  });

  it("rejects QIR gibberish", () => {
    const result = checkContentPlausible("qir", Buffer.from("not ir at all"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("QIR");
  });
});

describe("preflightUploadedProgram", () => {
  it("passes for the bundled valid OpenQASM sample", async () => {
    const result = await preflightUploadedProgram(
      uploads("sample-bell.qasm"),
      "openqasm",
    );
    expect(result.ok).toBe(true);
  });

  it("fails for the bundled bad OpenQASM sample before the engine runs", async () => {
    const result = await preflightUploadedProgram(
      uploads("bad-sample.qasm"),
      "openqasm",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("INVALID_CONFIG");
      expect(result.message).toContain("no recognizable statements");
    }
  });

  it("rejects an empty file path", async () => {
    const result = await preflightUploadedProgram("   ", "openqasm");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("No file was selected");
  });

  it("rejects a file that does not exist", async () => {
    const result = await preflightUploadedProgram(
      uploads("does-not-exist.qasm"),
      "openqasm",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("File not found");
  });

  it("rejects a valid file declared as the wrong format", async () => {
    const result = await preflightUploadedProgram(
      uploads("sample-bell.qasm"),
      "qsharp",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("does not match");
  });
});
