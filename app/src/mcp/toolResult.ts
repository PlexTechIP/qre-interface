/**
 * The boundary every tool result crosses.
 *
 * The rules here are not advice to handler authors, because advice is what a
 * sixth tool forgets. Sanitising happens in `toolSuccess`/`toolFailure`, below
 * every handler: whatever a handler returns, control characters are escaped and
 * filesystem paths are removed before it reaches the client. A handler cannot
 * opt out, and adding a tool cannot weaken the guarantee.
 *
 * What a handler still owns is the MESSAGE: an allowlisted code and text it
 * wrote itself. Raw exception messages, stack traces, SQL, and record JSON are
 * logged to stderr and never returned — see `runTool`, which is the only place
 * an unexpected exception is turned into a result.
 *
 * Every handler returns a real MCP CallToolResult (the `content` array is
 * mandatory per the SDK/protocol), not a bare data object — registerTool's
 * callback contract requires it, and a client reading `content` directly
 * (rather than `structuredContent`) would see nothing otherwise.
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { logError } from "./logger.js";
import { isStoreAccessError, type StoreAccessErrorCode } from "./runStoreAccess.js";

/** Allowlisted error codes for MCP tool failures. */
export type ToolErrorCode =
  | StoreAccessErrorCode
  | "STORE_READ_FAILED"
  | "RUN_NOT_FOUND"
  | "INVALID_CURSOR"
  | "DRAFT_UNSUPPORTED";

/**
 * Cap a string to a maximum number of Unicode code points.
 *
 * Counting code points rather than UTF-16 units is what keeps this from
 * slicing an astral character in half and emitting a lone surrogate, which
 * every consumer downstream renders as U+FFFD.
 */
export function capText(text: string, maxCodePoints: number): string {
  const points = [...text];
  if (points.length <= maxCodePoints) return text;
  if (maxCodePoints <= 0) return "";
  return points.slice(0, maxCodePoints - 1).join("") + "…";
}

/**
 * Escape control characters (C0 and DEL, U+0000–U+001F and U+007F) into a
 * visible `\x1b` form.
 *
 * User- and engine-authored text reaches an agent's context verbatim, and a
 * terminal escape sequence there is an injection vector. The output contains no
 * control characters, which makes this idempotent — safe to apply again at the
 * boundary over text a projection already escaped.
 */
export function escapeControlChars(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\x00-\x1F\x7F]/g, (char) => {
    const code = char.charCodeAt(0);
    return `\\x${code.toString(16).padStart(2, "0")}`;
  });
}

// Two or more path segments, so ordinary prose ("and/or", "see 1/2") does not
// match. Windows drive-letter paths are matched separately.
const POSIX_PATH = /(?:\/[\w.@%+-]+){2,}\/?/g;
const WINDOWS_PATH = /[A-Za-z]:\\(?:[\w.@%+-]+\\?)+/g;

/**
 * Replace anything that looks like a filesystem path with `<path>`.
 *
 * Stored engine failures embed up to 2000 characters of Python stderr, which
 * carries absolute paths and the analyst's home directory; store-access
 * failures name a database file. None of that is the MCP client's business, and
 * it is exactly what a public repository should never teach a tool to emit.
 */
export function redactPaths(text: string): string {
  return text.replace(POSIX_PATH, "<path>").replace(WINDOWS_PATH, "<path>");
}

/**
 * Prepare one user- or engine-authored field for output: strip paths, escape
 * control characters, THEN cap.
 *
 * The order is the point. Escaping expands each control character fourfold, so
 * capping first and escaping second overruns every documented bound — a
 * 200-character cap on a name of control characters produced 797 characters.
 */
export function boundedText(text: string, maxCodePoints: number): string {
  return capText(escapeControlChars(redactPaths(text)), maxCodePoints);
}

/** Apply the boundary rules to every string in a result, however deep. */
function sanitize<T>(value: T): T {
  if (typeof value === "string") {
    return escapeControlChars(redactPaths(value)) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item)) as unknown as T;
  }
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      result[key] = sanitize(item);
    }
    return result as unknown as T;
  }
  return value;
}

/**
 * Build an MCP error result. `message` must be handler-authored — an
 * allowlisted code plus text a person wrote, never an exception's own message.
 */
export function toolFailure(code: ToolErrorCode, message: string): CallToolResult {
  const safeMessage = sanitize(message);
  return {
    content: [{ type: "text", text: safeMessage }],
    isError: true,
    structuredContent: { code, message: safeMessage },
  };
}

/**
 * Build a successful MCP tool result. `data` becomes both the human-readable
 * text content (JSON-stringified) and the machine-readable structuredContent.
 */
export function toolSuccess<T extends object>(data: T): CallToolResult {
  const safeData = sanitize(data);
  return {
    content: [{ type: "text", text: JSON.stringify(safeData) }],
    structuredContent: safeData as Record<string, unknown>,
  };
}

/**
 * Turn a store-access failure into a tool result, or return null if this was
 * not one.
 *
 * The set of store error codes lives in one place, so a new one reaches clients
 * without an edit in every handler.
 */
export function storeAccessFailure(error: unknown): CallToolResult | null {
  if (!isStoreAccessError(error)) return null;
  return toolFailure(error.code, error.message);
}

/**
 * Run a tool handler's happy path, and answer for it when it throws.
 *
 * This is the only place an unexpected exception becomes a result, which is how
 * "no stack trace, no SQL, no exception message ever reaches a client" is kept
 * true without asking each handler to remember it. The real error goes to
 * stderr; the client gets `fallback`.
 */
export async function runTool(
  label: string,
  fallback: { code: ToolErrorCode; message: string },
  handler: () => Promise<CallToolResult>,
): Promise<CallToolResult> {
  try {
    return await handler();
  } catch (error) {
    logError(`${label} handler error`, error);
    return storeAccessFailure(error) ?? toolFailure(fallback.code, fallback.message);
  }
}
