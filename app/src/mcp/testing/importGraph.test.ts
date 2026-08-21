// @vitest-environment node

/**
 * The import guard is only worth what its walker is worth.
 *
 * The first version followed relative specifiers ending in `.js` and nothing
 * else, so a renderer module imported without an extension — the renderer's own
 * convention — was never opened. It scanned 22 of the 28 files that actually
 * ship, while reporting a clean result. These tests hold the walker to what it
 * claims: everything reachable, however the import was written.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { walkImportGraph } from "./importGraph.js";

let root: string;

function write(relativePath: string, contents: string): string {
  const full = join(root, relativePath);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, contents, "utf8");
  return full;
}

/** Paths, relative to the fixture root, that the walker reached. */
function reached(entry: string): string[] {
  return [...walkImportGraph(entry)]
    .map((file) => file.slice(root.length + 1))
    .sort();
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "qre-walker-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("walkImportGraph", () => {
  it("follows an import written without a file extension", () => {
    const entry = write("entry.ts", 'import { thing } from "./renderer";\n');
    write("renderer.ts", "export const thing = 1;\n");

    expect(reached(entry)).toEqual(["entry.ts", "renderer.ts"]);
  });

  it("follows a .js specifier to the .ts file it is written from", () => {
    const entry = write("entry.ts", 'import { thing } from "./store.js";\n');
    write("store.ts", "export const thing = 1;\n");

    expect(reached(entry)).toEqual(["entry.ts", "store.ts"]);
  });

  it("follows a directory import to its index file", () => {
    const entry = write("entry.ts", 'import { thing } from "./state";\n');
    write("state/index.ts", "export const thing = 1;\n");

    expect(reached(entry)).toEqual(["entry.ts", "state/index.ts"]);
  });

  it("keeps walking through a file it reached by an extensionless import", () => {
    // The defect that mattered: one extensionless hop hid everything beneath it.
    const entry = write("entry.ts", 'import { a } from "./first";\n');
    write("first.ts", 'export { b as a } from "./second.js";\n');
    write("second.ts", "export const b = 1;\n");

    expect(reached(entry)).toEqual(["entry.ts", "first.ts", "second.ts"]);
  });

  it("follows a dynamic import", () => {
    const entry = write("entry.ts", 'const load = () => import("./lazy");\n');
    write("lazy.ts", "export const thing = 1;\n");

    expect(reached(entry)).toEqual(["entry.ts", "lazy.ts"]);
  });

  it("does not follow a bare package specifier", () => {
    const entry = write("entry.ts", 'import { z } from "zod";\n');

    expect(reached(entry)).toEqual(["entry.ts"]);
  });

  it("reaches a JSON import, which can carry data into the bundle", () => {
    const entry = write(
      "entry.ts",
      'import schema from "./contract.json" with { type: "json" };\n',
    );
    write("contract.json", "{}\n");

    expect(reached(entry)).toEqual(["contract.json", "entry.ts"]);
  });
});
