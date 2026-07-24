// @vitest-environment node

import { homedir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { resolveDefaultDatabasePath } from "./dataDir.js";

const ORIGINAL_OVERRIDE = process.env.QRE_DB_PATH;

afterEach(() => {
  if (ORIGINAL_OVERRIDE === undefined) delete process.env.QRE_DB_PATH;
  else process.env.QRE_DB_PATH = ORIGINAL_OVERRIDE;
});

describe("resolveDefaultDatabasePath", () => {
  it("resolves relative to the current home directory rather than a hardcoded path", () => {
    delete process.env.QRE_DB_PATH;
    expect(resolveDefaultDatabasePath()).toBe(join(homedir(), ".qre-dashboard", "run-history.sqlite"));
  });

  it("honors a QRE_DB_PATH override", () => {
    process.env.QRE_DB_PATH = "/tmp/some-other-run-history.sqlite";
    expect(resolveDefaultDatabasePath()).toBe("/tmp/some-other-run-history.sqlite");
  });

  it("ignores an empty override and falls back to the default", () => {
    process.env.QRE_DB_PATH = "";
    expect(resolveDefaultDatabasePath()).toBe(join(homedir(), ".qre-dashboard", "run-history.sqlite"));
  });
});
