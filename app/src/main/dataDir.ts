/**
 * Where the dashboard keeps its data, for the processes that cannot ask
 * Electron.
 *
 * The dashboard resolves its own databases under `app.getPath("userData")`,
 * which is the right answer: it is the per-platform convention, and OS backup
 * and uninstall tooling knows about it. But `app.getPath` only exists inside
 * Electron, and the MCP server is deliberately a non-Electron process, so it
 * cannot call it and must not reimplement it — a hand-copied
 * `~/Library/Application Support/<name>` rule would be a second copy of
 * Electron's, keyed on an app name that changes the moment packaging sets a
 * `productName`.
 *
 * So the dashboard publishes the path it resolved instead, and this module
 * reads it back. This file is READ-ONLY on purpose: it sits in the MCP server's
 * import graph, and writing belongs to `publishDataLocation.ts`, which only the
 * dashboard imports.
 *
 * Resolution order is deliberate: an explicit `QRE_DB_PATH` beats the pointer,
 * so a developer pointing a scratch database at either process still wins.
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** The one location both processes can agree on without Electron. */
export function resolveDataDirectory(): string {
  return join(homedir(), ".qre-dashboard");
}

/** The file in which the dashboard records where its run history lives. */
export function resolveLocationPointerPath(): string {
  return join(resolveDataDirectory(), "location.json");
}

/**
 * The run-history path the dashboard last published, or null if it has never
 * run on this machine.
 *
 * Every failure resolves to null rather than throwing: a missing, truncated, or
 * hand-edited pointer means "we do not know", and the caller already has to
 * handle not knowing.
 */
export function readPublishedRunDatabasePath(): string | null {
  let contents: string;
  try {
    contents = readFileSync(resolveLocationPointerPath(), "utf8");
  } catch {
    return null;
  }

  try {
    const parsed = JSON.parse(contents) as { runDatabase?: unknown };
    const runDatabase = parsed?.runDatabase;
    return typeof runDatabase === "string" && runDatabase.length > 0
      ? runDatabase
      : null;
  } catch {
    return null;
  }
}

/**
 * Where a non-Electron process should look for the run history: an explicit
 * override if one is set, otherwise wherever the dashboard said. Null means
 * neither, which is a state the caller must report rather than guess past.
 */
export function resolveRunDatabasePath(): string | null {
  const override = process.env.QRE_DB_PATH;
  if (override !== undefined && override.length > 0) return override;
  return readPublishedRunDatabasePath();
}
