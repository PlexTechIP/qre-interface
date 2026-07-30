import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import benchmarksData from "../../shared/contracts/benchmarks.json";
import { BENCHMARK_REGISTRY } from "./benchmarkRegistry.js";

interface ContractBenchmark {
  id: string;
  name: string;
  description: string;
}

describe("benchmark registry", () => {
  it("mirrors every frozen benchmark id, name, and description", () => {
    const contract = benchmarksData as { benchmarks: ContractBenchmark[] };
    const expected = contract.benchmarks.map(({ id, name, description }) => ({
      id,
      name,
      description,
    }));
    const actual = Object.values(BENCHMARK_REGISTRY).map(
      ({ id, name, description }) => ({ id, name, description }),
    );

    expect(actual).toEqual(expected);
    for (const entry of Object.values(BENCHMARK_REGISTRY)) {
      expect(existsSync(entry.sourcePath)).toBe(true);
      expect(entry.entryExpr.length).toBeGreaterThan(0);
    }
  });
});
