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
    // 0700: same defence-in-depth reasoning as credentialStore.ts's 0600.
    mkdirSync(dirname(databasePath), { recursive: true, mode: 0o700 });
  }
}
