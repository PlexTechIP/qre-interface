// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveUploadPath } from "./uploadPath";

function fakeFile(name: string): File {
  return new File(["// program"], name, { type: "text/plain" });
}

afterEach(() => {
  delete window.files;
});

describe("resolveUploadPath", () => {
  it("returns the real filesystem path the Electron bridge reports", () => {
    // The browser File only carries a basename; the engine needs the path it
    // can stat() and readFile(). webUtils.getPathForFile is the only way to get
    // it, and the preload exposes it as window.files.getPathForFile.
    window.files = { getPathForFile: () => "/Users/analyst/programs/shor.qs" };

    expect(resolveUploadPath(fakeFile("shor.qs"))).toEqual({
      ok: true,
      filePath: "/Users/analyst/programs/shor.qs",
    });
  });

  it("passes the File through to the bridge unchanged", () => {
    const getPathForFile = vi.fn(() => "/tmp/a.qs");
    window.files = { getPathForFile };
    const file = fakeFile("a.qs");

    resolveUploadPath(file);

    expect(getPathForFile).toHaveBeenCalledWith(file);
  });

  it("fails when the preload bridge is unavailable", () => {
    const result = resolveUploadPath(fakeFile("shor.qs"));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/desktop app/i);
  });

  it("fails when the bridge cannot resolve a path", () => {
    // Electron returns "" for a File that has no filesystem backing.
    window.files = { getPathForFile: () => "" };

    const result = resolveUploadPath(fakeFile("shor.qs"));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/could not be resolved/i);
  });

  it("fails rather than throwing when the bridge itself throws", () => {
    window.files = {
      getPathForFile: () => {
        throw new Error("not a real file");
      },
    };

    const result = resolveUploadPath(fakeFile("shor.qs"));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("not a real file");
  });

  it("never falls back to the bare filename, which the engine cannot open", () => {
    window.files = { getPathForFile: () => "" };

    const result = resolveUploadPath(fakeFile("shor.qs"));

    expect(JSON.stringify(result)).not.toContain("shor.qs");
  });
});
