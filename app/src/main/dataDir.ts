import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Resolve the SQLite run-store's default file location without hardcoding an
 * absolute path. `QRE_DB_PATH` overrides it (used by the harness and by
 * anyone testing against a scratch location); otherwise it resolves relative
 * to the current user's home directory at call time.
 *
 * This app has no Electron main-process entry point yet (Team 3's work, week
 * 4) — once it does, swapping this for `app.getPath("userData")` is a
 * one-line change behind the same `SqliteRunStore(databasePath)` boundary.
 */
export function resolveDefaultDatabasePath(): string {
  const override = process.env.QRE_DB_PATH;
  if (override !== undefined && override.length > 0) return override;
  return join(homedir(), ".qre-dashboard", "run-history.sqlite");
}
