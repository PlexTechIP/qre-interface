/**
 * MCP tool: qre_list_benchmarks
 *
 * Lists all available quantum benchmarks from the registry.
 * No parameters required. Returns an array of benchmarks with basic metadata.
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { BENCHMARK_REGISTRY } from "../../main/engine/benchmarkRegistry.js";
import { logError } from "../logger.js";
import { toolFailure, toolSuccess } from "../toolResult.js";

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
export function handleListBenchmarks(): CallToolResult {
  try {
    const benchmarks = Object.values(BENCHMARK_REGISTRY).map((entry) => ({
      id: entry.id,
      name: entry.name,
      description: entry.description,
      format: entry.format,
    }));

    return toolSuccess({ benchmarks });
  } catch (error) {
    logError("listBenchmarks handler error", error);
    return toolFailure("STORE_READ_FAILED", "Failed to list benchmarks.");
  }
}
