/**
 * Make "the dashboard has never run on this machine" actually true.
 *
 * This module is TEST-ONLY and must NOT be imported from production code.
 *
 * Several tests want the `DB_NOT_CONFIGURED` path, and used to arrange it by
 * deleting `QRE_DB_PATH` alone. That is only half of the resolution:
 * `resolveRunDatabasePath` falls back to the pointer the dashboard publishes at
 * `~/.qre-dashboard/location.json`, so on a machine where anyone had ever
 * launched the app the tests silently stopped testing the thing they named and
 * started reading the developer's real run history instead — passing or failing
 * on its contents.
 *
 * `os.homedir()` is the whole of that other half, and it does not read one
 * variable: `USERPROFILE` on Windows, `HOME` elsewhere. Both are set, because
 * setting only `HOME` left this helper a no-op on the one platform where it
 * would have been hardest to notice.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resetHomeDirectoryForTests } from "../toolResult.js";

/** Every variable `os.homedir()` consults, across platforms. */
const HOME_VARIABLES = ["HOME", "USERPROFILE"] as const;

/**
 * Enter the unconfigured state. Returns the function that restores whatever was
 * there before — call it from `afterEach`, including on failure.
 */
export function withNoPublishedDatabase(): () => void {
  const savedDbPath = process.env.QRE_DB_PATH;
  const savedHomes = HOME_VARIABLES.map(
    (name) => [name, process.env[name]] as const,
  );
  const emptyHome = mkdtempSync(join(tmpdir(), "qre-no-datadir-"));

  delete process.env.QRE_DB_PATH;
  for (const name of HOME_VARIABLES) process.env[name] = emptyHome;
  // `redactPaths` memoises the home directory, so a cache filled before this
  // point answers for the wrong one — and, worse, a cache filled DURING this
  // window survives the restore below and silently disables home redaction for
  // every later test in the same worker.
  resetHomeDirectoryForTests();

  return () => {
    if (savedDbPath === undefined) delete process.env.QRE_DB_PATH;
    else process.env.QRE_DB_PATH = savedDbPath;
    for (const [name, value] of savedHomes) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    resetHomeDirectoryForTests();
    rmSync(emptyHome, { recursive: true, force: true });
  };
}
