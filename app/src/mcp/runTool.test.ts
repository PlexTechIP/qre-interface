// @vitest-environment node

import { describe, expect, it } from "vitest";

import { readToolFailure, runTool } from "./toolResult.js";

/**
 * The boundary's promise is that a client never sees a code outside the
 * documented set or an exception's own message. `runTool` forwards a
 * store-access error verbatim because its code and message were authored by
 * this server — so the test for "is this a store-access error" is the whole of
 * that promise, and "any Error with a string code" was not it: `node:sqlite`
 * and `node:fs` both throw those.
 */
describe("runTool with an exception that carries a foreign code", () => {
  const fallback = { code: "STORE_READ_FAILED" as const, message: "Failed to list runs." };

  it("does not forward a SQLite error's code or message", async () => {
    const sqliteError = Object.assign(
      new Error("database disk image is malformed at /Users/jane/Library/x.sqlite"),
      { code: "ERR_SQLITE_ERROR", errcode: 11 },
    );

    const failure = readToolFailure(
      await runTool("probe", fallback, async () => {
        throw sqliteError;
      }),
    );

    expect(failure).toEqual(fallback);
  });

  it("does not forward a filesystem error's code or message", async () => {
    const fsError = Object.assign(
      new Error("ENOENT: no such file or directory, open '/Users/jane/secret.txt'"),
      { code: "ENOENT", errno: -2, syscall: "open" },
    );

    const failure = readToolFailure(
      await runTool("probe", fallback, async () => {
        throw fsError;
      }),
    );

    expect(failure).toEqual(fallback);
  });

  it("does not forward a hand-made error that borrows an allowlisted code", async () => {
    // The code alone is not the credential; the error has to have been raised
    // by the store-access module.
    const impostor = Object.assign(new Error("raw sql: SELECT * FROM run_records"), {
      code: "DB_UNAVAILABLE",
    });

    const failure = readToolFailure(
      await runTool("probe", fallback, async () => {
        throw impostor;
      }),
    );

    expect(failure).toEqual(fallback);
  });
});
