// @vitest-environment node
import { describe, expect, it } from "vitest";
import { handleListBenchmarks } from "./listBenchmarks.js";
import { BENCHMARK_REGISTRY } from "../../main/engine/benchmarkRegistry.js";
import type { ListBenchmarksOutput } from "./listBenchmarks.js";

describe("qre_list_benchmarks tool", () => {
  it("returns all benchmarks from the registry", async () => {
    const result = await handleListBenchmarks();

    expect(result.isError).toBeFalsy();
    const data = result.structuredContent as unknown as ListBenchmarksOutput;
    expect(Array.isArray(data.benchmarks)).toBe(true);

    const registryIds = Object.keys(BENCHMARK_REGISTRY);
    expect(data.benchmarks.length).toBe(registryIds.length);

    // Check that all registry IDs are present in the result
    const resultIds = data.benchmarks.map((b) => b.id);
    for (const id of registryIds) {
      expect(resultIds).toContain(id);
    }
  });

  it("includes only safe fields (no sourcePath)", async () => {
    const result = await handleListBenchmarks();

    expect(result.isError).toBeFalsy();
    const data = result.structuredContent as unknown as ListBenchmarksOutput;

    for (const benchmark of data.benchmarks) {
      expect(benchmark).toHaveProperty("id");
      expect(benchmark).toHaveProperty("name");
      expect(benchmark).toHaveProperty("description");
      expect(benchmark).toHaveProperty("format");

      // Ensure no sourcePath is leaked
      expect(benchmark).not.toHaveProperty("sourcePath");

      // Ensure the format is one of the expected values
      expect(["qsharp", "openqasm", "qir"]).toContain(benchmark.format);
    }
  });

  it("benchmark fields have correct types", async () => {
    const result = await handleListBenchmarks();

    expect(result.isError).toBeFalsy();
    const data = result.structuredContent as unknown as ListBenchmarksOutput;

    for (const benchmark of data.benchmarks) {
      expect(typeof benchmark.id).toBe("string");
      expect(typeof benchmark.name).toBe("string");
      expect(typeof benchmark.description).toBe("string");
      expect(typeof benchmark.format).toBe("string");
    }
  });

  it("returns text content mirroring structuredContent (protocol-shape check)", async () => {
    const result = await handleListBenchmarks();

    expect(result.content).toBeDefined();
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content?.[0]).toMatchObject({ type: "text" });
  });
});
