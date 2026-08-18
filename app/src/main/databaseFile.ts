import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Make sure a SQLite file's directory exists before opening it.
 *
 * Shared by the two main-process stores. It was four lines inside
 * `sqliteRunStore.ts` until the chat store needed the same four; a second copy
 * of "and remember `:memory:` has no directory" is the kind that stays correct
 * right up until one of them is fixed.
 */
export function prepareDatabasePath(databasePath: string): void {
  if (databasePath !== ":memory:") {
    mkdirSync(dirname(databasePath), { recursive: true });
  }
}
