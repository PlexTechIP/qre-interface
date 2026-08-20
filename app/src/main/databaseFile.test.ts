import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { prepareDatabasePath } from "./databaseFile.js";

let root: string | undefined;

afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = undefined;
});

describe("prepareDatabasePath", () => {
  // Windows doesn't honor POSIX mode bits the same way; this only holds on
  // the POSIX platforms CI actually runs on.
  it.skipIf(process.platform === "win32")(
    "creates the database directory locked to the owner",
    () => {
      root = mkdtempSync(join(tmpdir(), "qre-database-file-"));
      const nested = join(root, "nested", "run-history.sqlite");

      prepareDatabasePath(nested);

      const mode = statSync(join(root, "nested")).mode & 0o777;
      expect(mode).toBe(0o700);
    },
  );

  it("does nothing for :memory:", () => {
    expect(() => prepareDatabasePath(":memory:")).not.toThrow();
  });
});
