// @vitest-environment node

import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readPublishedRunDatabasePath, resolveLocationPointerPath } from "./dataDir.js";
import { publishRunDatabaseLocation } from "./publishDataLocation.js";

const ORIGINAL_HOME = process.env.HOME;
const ORIGINAL_OVERRIDE = process.env.QRE_DB_PATH;

let home: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "qre-publish-"));
  process.env.HOME = home;
  delete process.env.QRE_DB_PATH;
});

afterEach(() => {
  if (ORIGINAL_HOME === undefined) delete process.env.HOME;
  else process.env.HOME = ORIGINAL_HOME;
  if (ORIGINAL_OVERRIDE === undefined) delete process.env.QRE_DB_PATH;
  else process.env.QRE_DB_PATH = ORIGINAL_OVERRIDE;
  rmSync(home, { recursive: true, force: true });
});

describe("publishRunDatabaseLocation", () => {
  it("records where the dashboard's run history actually lives", () => {
    publishRunDatabaseLocation("/Users/someone/Library/run-history.sqlite");

    expect(readPublishedRunDatabasePath()).toBe(
      "/Users/someone/Library/run-history.sqlite",
    );
  });

  it("creates the data directory when it does not exist yet", () => {
    publishRunDatabaseLocation("/data/run-history.sqlite");

    expect(readFileSync(resolveLocationPointerPath(), "utf8")).toContain(
      "/data/run-history.sqlite",
    );
  });

  it("follows the database when the dashboard's location changes", () => {
    publishRunDatabaseLocation("/data/first.sqlite");
    publishRunDatabaseLocation("/data/second.sqlite");

    expect(readPublishedRunDatabasePath()).toBe("/data/second.sqlite");
  });

  it("leaves the file untouched when the location has not changed", () => {
    publishRunDatabaseLocation("/data/run-history.sqlite");
    const first = statSync(resolveLocationPointerPath()).mtimeMs;

    publishRunDatabaseLocation("/data/run-history.sqlite");

    expect(statSync(resolveLocationPointerPath()).mtimeMs).toBe(first);
  });

  it("does not fail app startup when the pointer cannot be written", () => {
    // Publishing is a convenience for other processes; the dashboard itself
    // works fine without it, so a read-only home must not stop it launching.
    if (typeof process.getuid === "function" && process.getuid() === 0) return;
    chmodSync(home, 0o500);

    try {
      expect(() =>
        publishRunDatabaseLocation("/data/run-history.sqlite"),
      ).not.toThrow();
    } finally {
      chmodSync(home, 0o700);
    }
  });
});
