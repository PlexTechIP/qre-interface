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

import { homedir } from "node:os";

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { logError } from "./logger.js";
import { isStoreAccessError, type StoreAccessErrorCode } from "./runStoreAccess.js";

/** Allowlisted error codes for MCP tool failures. */
export type ToolErrorCode =
  | StoreAccessErrorCode
  | "STORE_READ_FAILED"
  | "VALIDATION_FAILED"
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
 * A path inside quotes, whatever it contains.
 *
 * This is the shape a Python traceback uses — `File "/Users/Jane Doe/run.py",
 * line 42` — and the quotes are what make a path with spaces in it
 * unambiguous, which no segment-by-segment pattern can be.
 *
 * Two alternatives rather than one backreferenced pair, because only the
 * CLOSING quote may end the body. A single `[^"'\n]*` class excluded both, so a
 * double-quoted path containing an apostrophe never matched at all —
 * `File "/srv/exports/o'neill/x.py"` fell through to the segment patterns and
 * kept `'neill/x.py`.
 */
const QUOTED_PATH =
  /"(?:\/|~\/|[A-Za-z]:\\|\\\\)[^"\n]*"|'(?:\/|~\/|[A-Za-z]:\\|\\\\)[^'\n]*'/g;

/** A Windows UNC share, which the drive-letter pattern does not reach. */
const UNC_PATH = /\\\\[^\s"'<>|]+/g;

/**
 * A path under a root that only ever names user data, with segments that may
 * contain spaces.
 *
 * The anchor is what lets a segment contain a space at all: `and/or` has no
 * anchor and stays prose, while `/Users/John Smith/Documents` is a path from its
 * first component onwards. `:` and `,` end a segment because they are how a
 * traceback separates a path from the message after it — without that,
 * `<path>: No such file` would redact the message too.
 */
const ANCHORED_PATH =
  /(?:\/(?:Users|home|private|var|tmp|opt|Applications|Volumes)|[A-Za-z]:\\Users)(?:[/\\][^/\\"\n,:]+)*[/\\]?/g;

/** Collapse `<path><path>` left behind by two rules meeting on one path. */
const ADJACENT_MARKERS = /(?:<path>)+/g;

/**
 * The analyst's home directory, resolved once.
 *
 * Read lazily so that a test can set `HOME` before the first call, and cached
 * so that redacting every string in a large result is not a syscall each time.
 */
let cachedHome: string | null = null;
function homeDirectory(): string {
  if (cachedHome === null) cachedHome = homedir();
  return cachedHome;
}

/** Drop the memoised home directory between tests. */
export function resetHomeDirectoryForTests(): void {
  cachedHome = null;
}

/**
 * Replace anything that looks like a filesystem path with `<path>`.
 *
 * Stored engine failures embed up to 2000 characters of Python stderr, which
 * carries absolute paths and the analyst's home directory; store-access
 * failures name a database file. None of that is the MCP client's business, and
 * it is exactly what a public repository should never teach a tool to emit.
 *
 * The segment patterns alone were not enough, because they enumerate the
 * characters a path segment may contain and a real person's home directory
 * frequently contains a character outside that set. `/Users/John
 * Smith/Documents/prog.qasm` redacted to `<path> Smith<path>`, keeping the
 * surname; a Windows path kept everything after the first space; a UNC share
 * was not matched at all. So three stronger rules run first:
 *
 *  1. The home directory, replaced LITERALLY. It is the highest-value string in
 *     any of this text and the one a character-class pattern is least likely to
 *     match, because names contain spaces and apostrophes.
 *  2. A quoted path, taken whole. Quotes delimit what whitespace cannot.
 *  3. UNC shares, which name an internal host as well as a path.
 *
 * Idempotent: `<path>` contains no path characters, so a second pass over
 * already-redacted text changes nothing.
 */
export function redactPaths(text: string): string {
  const home = homeDirectory();
  // A home of "/" would turn every slash into a marker; ignore a degenerate one.
  const withoutHome =
    home.length > 1 ? text.split(home).join("<path>") : text;

  return withoutHome
    .replace(QUOTED_PATH, (match) => `${match[0]}<path>${match[0]}`)
    .replace(UNC_PATH, "<path>")
    .replace(ANCHORED_PATH, "<path>")
    .replace(POSIX_PATH, "<path>")
    .replace(WINDOWS_PATH, "<path>")
    .replace(ADJACENT_MARKERS, "<path>");
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
 *
 * The code and message travel in the TEXT block, and a failure carries no
 * `structuredContent` at all. That is not a style choice — it is the only shape
 * a real client can read.
 *
 * Every tool here declares an `outputSchema` describing its SUCCESS payload, and
 * the SDK's client validates `structuredContent` against that schema whenever
 * the field is present. It does not exempt `isError` results (the server half
 * does; `client/index.js` does not), and the validator is populated by the
 * `tools/list` every client issues on connect. So a failure carrying
 * `{ code, message }` was rejected before the caller ever saw it: an agent
 * asking for a run that does not exist got `-32602 Structured content does not
 * match the tool's output schema` instead of "No run found with ID: …", and
 * every DB_NOT_CONFIGURED / DB_NOT_FOUND / INVALID_CURSOR message — the ones
 * written to tell an analyst what to go and fix — was unreachable.
 *
 * `errorPaths.test.ts` drives each of those codes through a real client that
 * has listed tools, which is what makes this stay true.
 */
export function toolFailure(code: ToolErrorCode, message: string): CallToolResult {
  const safeMessage = sanitize(message);
  return {
    content: [{ type: "text", text: JSON.stringify({ code, message: safeMessage }) }],
    isError: true,
  };
}

/**
 * Read back what `toolFailure` wrote.
 *
 * Callers and tests should not re-implement the wire shape: it is one place,
 * and a change to it should not need an edit in every assertion.
 */
export function readToolFailure(
  result: CallToolResult,
): { code: string; message: string } | null {
  if (!result.isError) return null;
  const first = result.content?.[0];
  if (!first || first.type !== "text") return null;
  try {
    const parsed = JSON.parse(first.text) as { code?: unknown; message?: unknown };
    if (typeof parsed.code !== "string" || typeof parsed.message !== "string") {
      return null;
    }
    return { code: parsed.code, message: parsed.message };
  } catch {
    return null;
  }
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
