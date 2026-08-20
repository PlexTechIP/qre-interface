/**
 * MCP tool error codes and result helpers.
 *
 * All tool handlers catch exceptions and convert them to tool error results
 * via toolFailure(). Raw exception messages, stack traces, SQL text, database
 * file paths, and raw record JSON never cross into the tool's returned content.
 *
 * Every handler returns a real MCP CallToolResult (the `content` array is
 * mandatory per the SDK/protocol), not a bare data object — registerTool's
 * callback contract requires it, and a client reading `content` directly
 * (rather than `structuredContent`) would see nothing otherwise.
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { isStoreAccessError, type StoreAccessErrorCode } from "./runStoreAccess.js";

/** Allowlisted error codes for MCP tool failures. */
export type ToolErrorCode =
  | StoreAccessErrorCode
  | "STORE_READ_FAILED"
  | "RUN_NOT_FOUND"
  | "INVALID_CURSOR"
  | "DRAFT_UNSUPPORTED";

/**
 * Build an MCP error result for a tool. Takes an allowlisted error code and
 * a handler-authored message (no file paths, no stack traces, no raw SQL).
 * Logs the real detail to stderr for debugging.
 */
export function toolFailure(code: ToolErrorCode, message: string): CallToolResult {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
    structuredContent: { code, message },
  };
}

/**
 * Turn a store-access failure into a tool result, or return null if this was
 * not one.
 *
 * Every handler that touches the store ends its catch with this, so the set of
 * store error codes lives in one place and a new one reaches clients without
 * three separate edits.
 *
 * Forwarding `error.message` is safe here and only here: `runStoreAccess`
 * authors all six of these messages itself and none of them names a path. Keep
 * it that way — a message built from a resolved path would leak the analyst's
 * filesystem layout to an external client.
 */
export function storeAccessFailure(error: unknown): CallToolResult | null {
  if (!isStoreAccessError(error)) return null;
  return toolFailure(error.code, error.message);
}

/**
 * Build a successful MCP tool result. `data` becomes both the human-readable
 * text content (JSON-stringified) and the machine-readable structuredContent.
 */
export function toolSuccess<T extends object>(data: T): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data) }],
    structuredContent: data as Record<string, unknown>,
  };
}

/**
 * Cap a string to a maximum number of Unicode code points, preserving word
 * boundaries when possible.
 *
 * If text exceeds maxCodePoints, truncate and append "…".
 */
export function capText(text: string, maxCodePoints: number): string {
  if (text.length <= maxCodePoints) {
    return text;
  }
  return text.substring(0, maxCodePoints - 1) + "…";
}

/**
 * Escape control characters in a string (C0 and DEL, U+0000–U+001F and U+007F).
 * Replaces them with a visible escape sequence like \x00, \x1F, etc.
 *
 * This is a defense against injection via user-authored text (run names, error
 * messages) that might contain escape sequences.
 */
export function escapeControlChars(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\x00-\x1F\x7F]/g, (char) => {
    const code = char.charCodeAt(0);
    return `\\x${code.toString(16).padStart(2, "0")}`;
  });
}
