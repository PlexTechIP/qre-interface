/**
 * A line per attempt to run an estimate, beside the database it writes to.
 *
 * The run tool acts on the analyst's machine while the analyst is not watching,
 * and the History row it produces only exists when the run finished AND saved.
 * That leaves the interesting cases invisible: a draft that was refused, a
 * budget that was hit, a run that finished into a locked database. This is the
 * record of those — who asked, for what, and what happened.
 *
 * What it deliberately does not hold is the draft. A draft is analyst content,
 * this file is plaintext on a local disk, and "what did the agent ask for" is
 * answered well enough for an audit by a digest that matches identical asks
 * without disclosing any of them. Same reasoning as `RunProvenance` never
 * carrying the prompt.
 *
 * Best effort by construction: an unwritable directory, a full disk, a
 * read-only home — none of those are a reason to fail a run that succeeded. The
 * whole module swallows its own failures, which is why nothing here returns a
 * result for a caller to check.
 */

import { appendFileSync, existsSync, renameSync, statSync, unlinkSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";

import { resolveDataDirectory, resolveRunDatabasePath } from "../main/dataDir.js";
import { logError } from "./logger.js";
import type { ToolErrorCode } from "./toolResult.js";

/**
 * The codes a line may carry.
 *
 * Wider than `ToolErrorCode` by exactly one member. A refusal is recorded under
 * the code the client saw, but a run that finished and failed to SAVE is
 * recorded under its warning's code — and `SAVE_FAILED` is a warning code only,
 * because it never reaches a client as a tool failure. Writing it into a field
 * typed `ToolErrorCode` needed a cast, and the cast was the only thing making
 * that field's type look true.
 */
export type InvocationCode = ToolErrorCode | "SAVE_FAILED";

export interface InvocationRecord {
  /** ISO 8601 UTC. */
  ts: string;
  tool: "qre_run_estimate";
  /** What the client called itself at `initialize`; null if it said nothing. */
  client: { name: string; version: string } | null;
  /** How this call was allowed: the environment opt-in, and only that. */
  gate: "env_opt_in";
  /**
   * Whether a human was asked at call time. Always `"not_elicited"` today, and
   * written out rather than implied so that a log from a build that DOES elicit
   * is distinguishable from this one without knowing which build wrote it.
   */
  consent: "not_elicited";
  argsDigest: string;
  runId: string | null;
  status: "succeeded" | "failed" | "refused";
  code?: InvocationCode;
  saved: boolean;
  durationMs: number;
}

const LOG_FILE_NAME = "mcp-invocations.jsonl";
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_KEEP = 3;

/**
 * JSON with object keys in sorted order, so the digest of a draft does not
 * depend on the order a client happened to serialise it in. `undefined` is
 * dropped exactly as `JSON.stringify` drops it, so an explicit `undefined` and
 * an absent key digest the same — which is what they mean.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`);
  return `{${entries.join(",")}}`;
}

/**
 * A stable fingerprint of what was asked for.
 *
 * Never throws: a draft nested deeply enough to overflow the canonicaliser is
 * exactly the kind of input this log most wants a line about, so an
 * unserialisable one gets a sentinel rather than taking the log entry with it.
 */
export function digestArguments(draft: unknown): string {
  try {
    return `sha256:${createHash("sha256").update(canonicalJson(draft)).digest("hex")}`;
  } catch {
    return "sha256:unserialisable";
  }
}

/**
 * Beside the database, because that is the directory the analyst already knows
 * as "where my QRE data lives" — Settings shows it, and a support question
 * ("what did the agent do?") is answered by one `ls` there.
 */
export function resolveInvocationLogPath(): string | null {
  const databasePath = resolveRunDatabasePath();
  const directory = databasePath ? dirname(databasePath) : resolveDataDirectory();
  if (!directory) return null;
  return join(directory, LOG_FILE_NAME);
}

/**
 * `x -> x.1 -> x.2 -> x.3`, dropping what falls off the end.
 *
 * Renaming from the oldest backwards is what keeps a generation from
 * overwriting the one before it.
 */
function rotate(path: string, keep: number): void {
  const oldest = `${path}.${keep}`;
  if (existsSync(oldest)) unlinkSync(oldest);
  for (let index = keep - 1; index >= 1; index -= 1) {
    const from = `${path}.${index}`;
    if (existsSync(from)) renameSync(from, `${path}.${index + 1}`);
  }
  renameSync(path, `${path}.1`);
}

/**
 * Append one line. Never throws, and never fails a run.
 *
 * The rotation check is a stat per call, which is nothing against an estimate,
 * and it is what keeps a long-lived agent session from growing an unbounded
 * file in the analyst's data directory.
 */
export function appendInvocation(
  record: InvocationRecord,
  options: { path?: string; maxBytes?: number; keep?: number } = {},
): void {
  const path = options.path ?? resolveInvocationLogPath();
  if (path === null) return;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const keep = options.keep ?? DEFAULT_KEEP;

  try {
    if (existsSync(path) && statSync(path).size >= maxBytes) {
      rotate(path, keep);
    }
    appendFileSync(path, `${JSON.stringify(record)}\n`, "utf8");
  } catch (error) {
    // Logged to stderr, where it is a diagnostic, and then dropped. A run that
    // finished must not be reported as failed because a log line could not be
    // written.
    logError("Could not append to the MCP invocation log", error);
  }
}
