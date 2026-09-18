/**
 * The dashboard telling other processes where it keeps its run history.
 *
 * Only the dashboard can answer this — it is the process Electron configures —
 * so it writes the answer down on startup and the MCP server reads it back
 * through `dataDir.ts`. The write side lives in its own module so that the read
 * side, which the MCP server imports, contains nothing that can modify a file.
 */

import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";

import { resolveDataDirectory, resolveLocationPointerPath } from "./dataDir.js";

/**
 * Record where the dashboard's run history actually is.
 *
 * Publishing is a convenience for other processes, never a precondition for the
 * dashboard itself, so a failure here is logged and swallowed: a read-only home
 * directory must not stop the app launching. The file is left alone when the
 * location has not changed, so a normal launch does not touch the disk.
 */
export function publishRunDatabaseLocation(runDatabasePath: string): void {
  const pointerPath = resolveLocationPointerPath();
  const contents = `${JSON.stringify({ runDatabase: runDatabasePath }, null, 2)}\n`;

  try {
    if (readFileSync(pointerPath, "utf8") === contents) return;
  } catch {
    // No pointer yet, or it is unreadable. Either way, write a fresh one.
  }

  try {
    mkdirSync(resolveDataDirectory(), { recursive: true });
    /*
     * Written to a sibling and renamed into place, because a reader is
     * watching.
     *
     * `writeFileSync` truncates and then writes, so a process reading the
     * pointer in that window gets an empty or half-written file. The MCP
     * server resolves this path on every tool call and reads "" as "no
     * history is configured", which tells the analyst to launch the dashboard
     * that is, at that moment, launching. `rename` within a directory is
     * atomic, so a reader sees either the old pointer or the new one.
     */
    const temporaryPath = `${pointerPath}.${process.pid}.tmp`;
    try {
      writeFileSync(temporaryPath, contents, "utf8");
      renameSync(temporaryPath, pointerPath);
    } catch (error) {
      try {
        unlinkSync(temporaryPath);
      } catch {
        // Nothing to clean up, or nothing we can do about it.
      }
      throw error;
    }
  } catch (error) {
    console.warn(
      `Could not record the run-history location at ${pointerPath}. ` +
        `The MCP server will need QRE_DB_PATH set explicitly.`,
      error,
    );
  }
}
