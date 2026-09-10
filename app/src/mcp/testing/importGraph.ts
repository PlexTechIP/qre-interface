/**
 * Walk the module graph reachable from a file.
 *
 * This module is TEST-ONLY and must NOT be imported from production code.
 *
 * It exists to hold the MCP server's two structural promises — it imports
 * nothing from `electron`, and nothing on its import graph writes to stdout.
 * Those promises are only as good as the walk, and the first version of it
 * followed relative specifiers ending in `.js` and nothing else. The renderer
 * imports without extensions, so one hop into `formState.ts` hid everything
 * beneath it: the guard scanned 22 of the 28 files that actually ship and
 * reported a clean result.
 *
 * Being over-inclusive is safe here and being under-inclusive is not, so this
 * follows anything that looks like a relative specifier, including dynamic
 * imports, re-exports, and JSON imports.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/** `from "..."`, `import "..."`, and `import("...")`. */
const SPECIFIER = /(?:from|import)\s*\(?\s*["']([^"']+)["']/g;

/**
 * Resolve a relative specifier the way the bundler will.
 *
 * TypeScript source written for ESM output imports `./store.js` and means
 * `./store.ts`, so both spellings resolve, as do extensionless and directory
 * imports.
 */
function resolveSpecifier(fromFile: string, specifier: string): string | null {
  const base = resolve(dirname(fromFile), specifier);
  const candidates = [
    base,
    base.replace(/\.js$/, ".ts"),
    base.replace(/\.js$/, ".tsx"),
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** Every file reachable from `entryPoint` by a relative import, plus itself. */
export function walkImportGraph(entryPoint: string): Set<string> {
  const visited = new Set<string>();
  const queue = [entryPoint];

  while (queue.length > 0) {
    const filePath = queue.shift();
    if (filePath === undefined || visited.has(filePath)) continue;
    visited.add(filePath);

    let contents: string;
    try {
      contents = readFileSync(filePath, "utf8");
    } catch {
      continue;
    }

    SPECIFIER.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = SPECIFIER.exec(contents)) !== null) {
      const specifier = match[1];
      if (specifier === undefined || !specifier.startsWith(".")) continue;
      const resolved = resolveSpecifier(filePath, specifier);
      if (resolved !== null && !visited.has(resolved)) queue.push(resolved);
    }
  }

  return visited;
}
