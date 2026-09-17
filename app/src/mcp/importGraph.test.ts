// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cwd } from "node:process";
import { describe, expect, it } from "vitest";

import { walkImportGraph } from "./testing/importGraph.js";

describe("MCP import graph validation", () => {
  it("should not import electron in any src/mcp or src/shared file", () => {
    const appDir = cwd();
    const entryPoint = resolve(appDir, "src/mcp/server.ts");
    const visited = walkImportGraph(entryPoint);

    for (const filePath of visited) {
      const content = readFileSync(filePath, "utf8");

      // Check for bare electron imports
      expect(content).not.toMatch(/from\s+["']electron["']/);
      expect(content).not.toMatch(/from\s+["']electron\//);
      expect(content).not.toMatch(/import\s+["']electron["']/);
      expect(content).not.toMatch(/import\s+["']electron\//);
    }
  });

  it("should only import allowlisted files outside src/mcp and src/shared", () => {
    const appDir = cwd();
    const entryPoint = resolve(appDir, "src/mcp/server.ts");
    const visited = walkImportGraph(entryPoint);

    // Allowlist of specific files from outside src/mcp/ and src/shared/ that are needed for read tools
    // Everything outside src/mcp and src/shared that the server legitimately
    // reaches. Adding a line here is a deliberate act: it widens what a
    // non-Electron, non-DOM process carries, and it is meant to be argued for
    // in review rather than appended to quietly.
    const allowlist = new Set<string>([
      // Benchmark registry
      resolve(appDir, "src/main/engine/benchmarkRegistry.ts"),
      // The engine adapter, reached only by `qre_run_estimate`. These are the
      // seven modules between `QreEngine.run(config)` and a Python subprocess,
      // and none of them imports Electron or touches a DOM — which is why the
      // run tool can call the app's real estimator rather than a second copy of
      // the invocation logic that would drift from it.
      resolve(appDir, "src/main/engine/qreEngine.ts"),
      resolve(appDir, "src/main/engine/execute.ts"),
      resolve(appDir, "src/main/engine/configToInvocation.ts"),
      resolve(appDir, "src/main/engine/outputToResult.ts"),
      resolve(appDir, "src/main/engine/invocation.ts"),
      resolve(appDir, "src/main/engine/uploadValidation.ts"),
      // Which interpreter to spawn, resolved the same way the dashboard
      // resolves it so the two cannot disagree about the venv.
      resolve(appDir, "src/main/engine/pythonBin.ts"),
      // Where the dashboard published its database, and the committed
      // generation contract the draft tools validate against.
      resolve(appDir, "src/main/dataDir.ts"),
      resolve(appDir, "src/main/draftValidation.ts"),
      // The READ path of the SQLite store, and only the read path.
      resolve(appDir, "src/main/sqliteReadOnlyRunStore.ts"),
      resolve(appDir, "src/main/sqliteRunStoreReader.ts"),
      // The append path: one INSERT, and a store that refuses to open a
      // database at a schema it does not already know. The read-write
      // `sqliteRunStore.ts` is still deliberately absent — it migrates, and
      // migration is the dashboard's alone — which the test below asserts
      // directly rather than leaving to this list.
      resolve(appDir, "src/main/sqliteAppendRunStore.ts"),
      resolve(appDir, "src/main/sqliteRunStoreWriter.ts"),
      resolve(appDir, "src/shared/runRecordValidation.ts"),
      resolve(appDir, "src/shared/runStore.ts"),
      // The run form and the two directions between it and a generated draft.
      // These are the app's own rules about what a run may be, which is exactly
      // why the MCP tools use them rather than restating any of it.
      resolve(appDir, "src/renderer/state/formState.ts"),
      resolve(appDir, "src/renderer/state/generatedDraft.ts"),
      resolve(appDir, "src/renderer/state/generatedDraftToForm.ts"),
      resolve(appDir, "src/renderer/agent/draftToFormState.ts"),
      resolve(appDir, "src/renderer/state/toRunConfig.ts"),
      resolve(appDir, "src/renderer/state/validation.ts"),
      resolve(appDir, "src/renderer/state/schemaValidation.ts"),
      resolve(appDir, "src/renderer/state/runNaming.ts"),
      // Anchor ids and labels are pure data; `fieldNavigation.ts` holds the
      // `document`/`window` half, and the DOM test below is what keeps it out.
      resolve(appDir, "src/renderer/components/fieldAnchors.ts"),
      resolve(appDir, "src/renderer/constants/hyperparameters.ts"),
      resolve(appDir, "src/renderer/constants/labels.ts"),
      resolve(appDir, "src/renderer/constants/staticOptions.ts"),
    ]);

    for (const filePath of visited) {
      const relativePath = filePath.replace(appDir + "/", "");
      const isInMcpOrShared =
        relativePath.startsWith("src/mcp/") ||
        relativePath.startsWith("src/shared/");
      const isAllowlisted = allowlist.has(filePath);

      if (!isInMcpOrShared && !isAllowlisted) {
        throw new Error(
          `Unexpected import outside src/mcp/ and src/shared/: ${relativePath}`
        );
      }
    }
  });

  it("cannot reach the code that migrates or creates the database", () => {
    // An allowlist is what a developer edits to make the test above go green,
    // so "sqliteRunStore.ts must never appear there" cannot be enforced BY the
    // allowlist. `sqliteRunStore.ts` runs the migration and `databaseFile.ts`
    // creates directories; both are the dashboard's, and the server must not
    // be one import away from either.
    const appDir = cwd();
    const visited = walkImportGraph(resolve(appDir, "src/mcp/server.ts"));

    for (const forbidden of [
      "src/main/sqliteRunStore.ts",
      "src/main/databaseFile.ts",
    ]) {
      expect(
        visited.has(resolve(appDir, forbidden)),
        `${forbidden} is reachable from the MCP server`,
      ).toBe(false);
    }
  });

  it("reaches no code that needs a DOM", () => {
    // The allowlist is what a developer edits to make the test above go green,
    // so "fieldNavigation.ts must never appear there" cannot be enforced BY the
    // allowlist. Assert the property directly: this process has no document and
    // no window, and a module that touches either would throw on import.
    const appDir = cwd();
    const visited = walkImportGraph(resolve(appDir, "src/mcp/server.ts"));

    for (const filePath of visited) {
      const code = readFileSync(filePath, "utf8")
        .split("\n")
        .filter((line) => {
          const trimmed = line.trim();
          return !trimmed.startsWith("*") && !trimmed.startsWith("//");
        })
        .join("\n");

      expect(code, `${filePath} uses document`).not.toMatch(
        /(^|[^.\w])document\s*\./,
      );
      expect(code, `${filePath} uses window`).not.toMatch(
        /(^|[^.\w])window\s*\./,
      );
    }
  });

  it("should not call console.log, console.info, etc. except in stdoutGuard.ts", () => {
    const appDir = cwd();
    const entryPoint = resolve(appDir, "src/mcp/server.ts");
    const visited = walkImportGraph(entryPoint);

    // List of forbidden console methods
    // Note: process.stderr is allowed (used by logger.ts)
    const forbiddenMethods = [
      "console.log",
      "console.info",
      "console.debug",
      "console.dir",
      "console.table",
      "console.trace",
      "console.group",
      "console.groupEnd",
      "console.count",
      "console.timeEnd",
      "console.timeLog",
      "process.stdout",
    ];

    for (const filePath of visited) {
      const content = readFileSync(filePath, "utf8");
      const fileName = filePath.split("/").pop();

      // stdoutGuard.ts and bootstrap.ts are allowed to have these
      if (fileName === "stdoutGuard.ts" || fileName === "bootstrap.ts") {
        continue;
      }

      // logger.ts mentions process.stdout in a comment but doesn't call it
      const fileMethods = fileName === "logger.ts"
        ? forbiddenMethods.filter(m => m !== "process.stdout")
        : forbiddenMethods;

      for (const forbidden of fileMethods) {
        expect(content).not.toContain(forbidden);
      }
    }
  });
});
