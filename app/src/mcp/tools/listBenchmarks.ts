/**
 * MCP tool: qre_list_benchmarks
 *
 * Lists all available quantum benchmarks from the registry.
 * No parameters required. Returns an array of benchmarks with basic metadata.
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { BENCHMARK_REGISTRY } from "../../main/engine/benchmarkRegistry.js";
import { runTool, toolSuccess } from "../toolResult.js";

export interface ListBenchmarksOutput {
  benchmarks: Array<{
    id: string;
    name: string;
    description: string;
    format: "qsharp" | "openqasm" | "qir";
  }>;
}

/**
 * Tool handler for qre_list_benchmarks.
 * Always succeeds (no external state queried).
 */
export async function handleListBenchmarks(): Promise<CallToolResult> {
  return runTool(
    "listBenchmarks",
    { code: "STORE_READ_FAILED", message: "Failed to list benchmarks." },
    async () => {
    const benchmarks = Object.values(BENCHMARK_REGISTRY).map((entry) => ({
      id: entry.id,
      name: entry.name,
      description: entry.description,
      format: entry.format,
    }));

    return toolSuccess({ benchmarks } satisfies ListBenchmarksOutput);
    },
  );
}
