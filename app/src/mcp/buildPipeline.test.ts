// @vitest-environment node

/**
 * Every pipeline that populates `dist-electron` must leave the MCP bundle in it.
 *
 * Four builds write to that one directory, and exactly one of them —
 * `vite.main.config.ts` — empties it first. That is fine as long as it runs
 * before the other three, and it is a silent disaster when one of them does not
 * run at all: `npm run dev` built main and preload only, so launching the
 * dashboard DELETED `dist-electron/mcp-server.mjs` and never replaced it.
 *
 * The consequence was not local. An MCP client stores an absolute path to that
 * file, so every already-configured agent broke the moment the analyst launched
 * the app, with `MODULE_NOT_FOUND` on the server's side and nothing but
 * `CONNECTION_CLOSED` on the client's — and the two actions look completely
 * unrelated to whoever has to work it out.
 *
 * Nothing else catches this. The unit tests import from `src/`, so they pass
 * with no bundle at all; `npm run build` happens to order its four steps
 * correctly, so it hides the hazard rather than proving it. This reads the
 * pipelines themselves.
 */

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const APP_ROOT = resolve(import.meta.dirname, "..", "..");

function read(relativePath: string): string {
  return readFileSync(join(APP_ROOT, relativePath), "utf8");
}

/** The vite configs that write into `dist-electron`. */
function distElectronConfigs(): string[] {
  return readdirSync(APP_ROOT)
    .filter((name) => /^vite\..*config\.ts$/.test(name))
    .filter((name) => read(name).includes(`outDir: "dist-electron"`));
}

/**
 * The config that wipes the shared directory. Found rather than named, so
 * moving `emptyOutDir` to a different config does not quietly disable this.
 */
function emptyingConfig(): string {
  const emptying = distElectronConfigs().filter((name) =>
    /emptyOutDir:\s*true/.test(read(name)),
  );
  expect(
    emptying,
    "exactly one dist-electron config may empty the directory",
  ).toHaveLength(1);
  return emptying[0] as string;
}

/** `npm run build`, with its `npm run <script>` references expanded. */
function buildPipeline(): string {
  const manifest = JSON.parse(read("package.json")) as {
    scripts: Record<string, string>;
  };
  const build = manifest.scripts.build;
  expect(build, "package.json has no build script").toBeDefined();
  return (build as string).replace(
    /npm run ([\w:]+)/g,
    (whole, name: string) => manifest.scripts[name] ?? whole,
  );
}

const PIPELINES: ReadonlyArray<{ what: string; source: () => string }> = [
  { what: "npm run build", source: buildPipeline },
  { what: "npm run dev", source: () => read("scripts/dev.mjs") },
];

describe.each(PIPELINES)("$what", ({ source }) => {
  it("builds the MCP server bundle", () => {
    // Without this, launching the app removes a file an external client holds
    // an absolute path to.
    expect(source()).toContain("vite.mcp.config.ts");
  });

  it("builds it after the step that empties dist-electron", () => {
    const text = source();
    const emptying = emptyingConfig();

    const emptiesAt = text.indexOf(emptying);
    const mcpAt = text.indexOf("vite.mcp.config.ts");

    expect(emptiesAt, `${emptying} is not in this pipeline`).toBeGreaterThan(-1);
    expect(
      mcpAt,
      `the MCP bundle is built before ${emptying}, which then deletes it`,
    ).toBeGreaterThan(emptiesAt);
  });
});
