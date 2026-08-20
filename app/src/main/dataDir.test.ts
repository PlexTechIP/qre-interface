// @vitest-environment node

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  readPublishedRunDatabasePath,
  resolveDataDirectory,
  resolveLocationPointerPath,
  resolveRunDatabasePath,
} from "./dataDir.js";

const ORIGINAL_HOME = process.env.HOME;
const ORIGINAL_OVERRIDE = process.env.QRE_DB_PATH;

let home: string;

/** Write a pointer file as the dashboard would. */
function publish(contents: string): void {
  mkdirSync(resolveDataDirectory(), { recursive: true });
  writeFileSync(resolveLocationPointerPath(), contents, "utf8");
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "qre-home-"));
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

describe("resolveDataDirectory", () => {
  it("resolves under the current home directory rather than a hardcoded path", () => {
    expect(resolveDataDirectory()).toBe(join(home, ".qre-dashboard"));
  });
});

describe("readPublishedRunDatabasePath", () => {
  it("returns the path the dashboard published", () => {
    publish(JSON.stringify({ runDatabase: "/data/run-history.sqlite" }));

    expect(readPublishedRunDatabasePath()).toBe("/data/run-history.sqlite");
  });

  it("returns null when the dashboard has never published one", () => {
    expect(readPublishedRunDatabasePath()).toBeNull();
  });

  it("returns null rather than throwing on an unreadable pointer", () => {
    publish("{ this is not json");

    expect(readPublishedRunDatabasePath()).toBeNull();
  });

  it("ignores a pointer that carries no usable path", () => {
    publish(JSON.stringify({ runDatabase: 42 }));

    expect(readPublishedRunDatabasePath()).toBeNull();
  });
});

describe("resolveRunDatabasePath", () => {
  it("prefers an explicit QRE_DB_PATH over the published pointer", () => {
    publish(JSON.stringify({ runDatabase: "/data/published.sqlite" }));
    process.env.QRE_DB_PATH = "/tmp/explicit.sqlite";

    expect(resolveRunDatabasePath()).toBe("/tmp/explicit.sqlite");
  });

  it("falls back to the published pointer when no override is set", () => {
    publish(JSON.stringify({ runDatabase: "/data/published.sqlite" }));

    expect(resolveRunDatabasePath()).toBe("/data/published.sqlite");
  });

  it("treats an empty override as absent", () => {
    publish(JSON.stringify({ runDatabase: "/data/published.sqlite" }));
    process.env.QRE_DB_PATH = "";

    expect(resolveRunDatabasePath()).toBe("/data/published.sqlite");
  });

  it("returns null when there is nothing to go on", () => {
    expect(resolveRunDatabasePath()).toBeNull();
  });
});
