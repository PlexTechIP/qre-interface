// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cwd } from "node:process";
import { describe, expect, it } from "vitest";

describe("MCP import graph validation", () => {
  /**
   * Recursively walks the import graph starting from src/mcp/server.ts
   * and collects all visited files. Returns the set of absolute file paths.
   */
  function walkImportGraph(entryPoint: string): Set<string> {
    const visited = new Set<string>();
    const queue: string[] = [entryPoint];

    while (queue.length > 0) {
      const filePath = queue.shift()!;

      if (visited.has(filePath)) {
        continue;
      }
      visited.add(filePath);

      try {
        const content = readFileSync(filePath, "utf8");

        // Find all import statements with relative paths (ending in .js)
        // Match: from "./..." or import "./..."
        const importRegex =
          /(?:from|import)\s+["']([^"']*\.js)["']/g;
        let match;

        while ((match = importRegex.exec(content)) !== null) {
          const importPath = match[1];
          if (!importPath) continue;

          // Only follow relative imports
          if (importPath.startsWith(".")) {
            const importedPath = resolve(
              resolve(filePath, ".."),
              importPath
            );

            // Try .js first, then .ts
            let resolvedPath = importedPath;
            if (!visited.has(resolvedPath)) {
              // Check if .ts version exists
              const tsPath = importedPath.replace(/\.js$/, ".ts");
              try {
                readFileSync(tsPath, "utf8");
                resolvedPath = tsPath;
              } catch {
                // Use .js version if .ts doesn't exist
              }

              if (!visited.has(resolvedPath)) {
                queue.push(resolvedPath);
              }
            }
          }
        }
      } catch {
        // Silently skip files we can't read
      }
    }

    return visited;
  }

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
    const allowlist = new Set<string>([
      // Benchmark registry
      resolve(appDir, "src/main/engine/benchmarkRegistry.ts"),
      // The READ path of the SQLite store, and only the read path. The
      // read-write `sqliteRunStore.ts` is deliberately absent: the MCP server
      // may not migrate or write, so its module must not be reachable from
      // this entry point at all.
      resolve(appDir, "src/main/sqliteReadOnlyRunStore.ts"),
      resolve(appDir, "src/main/sqliteRunStoreReader.ts"),
      resolve(appDir, "src/shared/runRecordValidation.ts"),
      resolve(appDir, "src/shared/runStore.ts"),
      // FormState and its dependencies
      resolve(appDir, "src/renderer/state/formState.ts"),
      resolve(appDir, "src/renderer/constants/hyperparameters.ts"),
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
