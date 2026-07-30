/**
 * Pre-flight validation for uploaded program files.
 *
 * The engine's Q#/OpenQASM/QIR compilers only discover a broken or wrong-type
 * file after they spawn (surfacing as a slow `COMPILE_ERROR`). These checks run
 * first — before the engine process starts — so a missing, unreadable,
 * wrong-extension, or obviously-not-this-format file produces a clear,
 * immediate `INVALID_CONFIG` message instead.
 *
 * The checks are deliberately shallow: they confirm the file is present,
 * readable, carries the right extension, and *looks* like the declared format.
 * They are NOT a parser — plausible-looking but semantically invalid programs
 * still (correctly) fail later in the engine.
 */

import { access, readFile, stat } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";

import type { UploadedProgramFormat } from "../../shared/types.js";

/** A pass, or a fail carrying the contract error code + an analyst-facing message. */
export type UploadValidationResult =
  | { ok: true }
  | { ok: false; code: "INVALID_CONFIG"; message: string };

const OK: UploadValidationResult = { ok: true };

function invalid(message: string): UploadValidationResult {
  return { ok: false, code: "INVALID_CONFIG", message };
}

/** Human-friendly names for messages. */
const FORMAT_LABELS: Record<UploadedProgramFormat, string> = {
  qsharp: "Q#",
  openqasm: "OpenQASM",
  qir: "QIR",
};

/** Extensions each declared format accepts (lower-case, no dot). */
const FORMAT_EXTENSIONS: Record<UploadedProgramFormat, readonly string[]> = {
  qsharp: ["qs"],
  openqasm: ["qasm"],
  qir: ["ll", "bc"],
};

/** The file's lower-cased extension without the leading dot ("" if none). */
function extensionOf(filePath: string): string {
  return path.extname(filePath).replace(/^\./, "").toLowerCase();
}

/**
 * The declared format must match the file's extension. Guards against a saved
 * program whose format drifted from its path, or a hand-built config.
 */
export function checkExtensionMatchesFormat(
  filePath: string,
  format: UploadedProgramFormat,
): UploadValidationResult {
  const ext = extensionOf(filePath);
  const allowed = FORMAT_EXTENSIONS[format];
  if (ext.length === 0) {
    return invalid(
      `The uploaded file has no extension, but ${FORMAT_LABELS[format]} expects ${allowed
        .map((e) => `.${e}`)
        .join(" or ")}. Rename the file or pick the matching format.`,
    );
  }
  if (!allowed.includes(ext)) {
    return invalid(
      `File type ".${ext}" does not match the selected format ${FORMAT_LABELS[format]} (expects ${allowed
        .map((e) => `.${e}`)
        .join(" or ")}). Pick the format that matches the file.`,
    );
  }
  return OK;
}

/** QIR bitcode magic numbers: raw LLVM ("BC\xC0\xDE") and the wrapper header. */
function looksLikeBitcode(bytes: Buffer): boolean {
  if (bytes.length >= 4 && bytes[0] === 0x42 && bytes[1] === 0x43 && bytes[2] === 0xc0 && bytes[3] === 0xde) {
    return true; // 'B' 'C' 0xC0 0xDE
  }
  // Bitcode wrapper header magic 0x0B17C0DE (little-endian on disk).
  return (
    bytes.length >= 4 && bytes[0] === 0xde && bytes[1] === 0xc0 && bytes[2] === 0x17 && bytes[3] === 0x0b
  );
}

/** Structural tokens whose presence marks a file as plausibly that format. */
const OPENQASM_TOKENS =
  /\b(include|qubit|qreg|bit|creg|gate|measure|reset|barrier|def|for|while|opaque|if)\b/;
const QSHARP_TOKENS = /\b(namespace|operation|function|newtype|struct|import|open)\b|@EntryPoint/;
const QIR_LL_TOKENS = /(^|\n)\s*(define|declare|target\s+datalayout|target\s+triple|source_filename|@)/;

/**
 * Does the file content plausibly belong to the declared format? Shallow, not a
 * parser: it confirms the format header/structure is present, so gibberish with
 * the right extension is rejected up front rather than deep in the compiler.
 */
export function checkContentPlausible(
  format: UploadedProgramFormat,
  content: Buffer,
): UploadValidationResult {
  if (content.length === 0) {
    return invalid("The uploaded file is empty.");
  }

  if (format === "qir") {
    // QIR is either textual LLVM IR (.ll) or bitcode (.bc). Bitcode is binary —
    // validate by magic number; textual IR by its recognizable structure.
    if (looksLikeBitcode(content)) return OK;
    const text = content.toString("utf8");
    if (QIR_LL_TOKENS.test(text)) return OK;
    return invalid(
      "The uploaded file does not look like QIR (expected LLVM bitcode, or textual IR with `define`/`target` directives).",
    );
  }

  const text = content.toString("utf8");

  if (format === "openqasm") {
    if (!/\bOPENQASM\b/i.test(text)) {
      return invalid(
        'The uploaded file is missing an OpenQASM version header (e.g. "OPENQASM 3.0;").',
      );
    }
    if (!OPENQASM_TOKENS.test(text)) {
      return invalid(
        "The uploaded file has an OpenQASM header but no recognizable statements (declarations, gates, or measurements).",
      );
    }
    return OK;
  }

  // qsharp
  if (!QSHARP_TOKENS.test(text)) {
    return invalid(
      "The uploaded file does not look like Q# (expected a `namespace`, `operation`, or `function` declaration).",
    );
  }
  return OK;
}

/**
 * Full pre-flight for an uploaded program: the file must exist, be readable,
 * carry an extension matching the declared format, and have plausible content.
 * Returns a clear `INVALID_CONFIG` on the first failure; call before spawning
 * the engine so bad files fail fast instead of as a late `COMPILE_ERROR`.
 */
export async function preflightUploadedProgram(
  filePath: string,
  format: UploadedProgramFormat,
): Promise<UploadValidationResult> {
  if (filePath.trim().length === 0) {
    return invalid("No file was selected for the uploaded program.");
  }

  const extResult = checkExtensionMatchesFormat(filePath, format);
  if (!extResult.ok) return extResult;

  let stats;
  try {
    stats = await stat(filePath);
  } catch {
    return invalid(`File not found: "${filePath}". Choose the file again — it may have moved or been deleted.`);
  }
  if (!stats.isFile()) {
    return invalid(`"${filePath}" is not a file. Select a program file, not a folder.`);
  }

  try {
    await access(filePath, fsConstants.R_OK);
  } catch {
    return invalid(`The file "${filePath}" exists but is not readable. Check its permissions and retry.`);
  }

  let content: Buffer;
  try {
    content = await readFile(filePath);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return invalid(`Could not read "${filePath}": ${detail}.`);
  }

  return checkContentPlausible(format, content);
}
