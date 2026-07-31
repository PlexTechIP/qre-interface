import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import benchmarksData from "../../shared/contracts/benchmarks.json";
import {
  BENCHMARK_ENTRY_OPERATION,
  buildBenchmarkEntryExpr,
} from "../../shared/benchmarkParams.js";
import type { BenchmarkId } from "../../shared/types.js";
import { BENCHMARK_REGISTRY } from "./benchmarkRegistry.js";

function readSource(file: string): string {
  return readFileSync(file, "utf8");
}

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
    }
  });

  it("names an entry operation that exists in the bundled Q# project", () => {
    // Catches the rename that would otherwise surface as a COMPILE_ERROR only
    // once someone actually ran that benchmark.
    for (const entry of Object.values(BENCHMARK_REGISTRY)) {
      const operation = BENCHMARK_ENTRY_OPERATION[entry.id as BenchmarkId];
      expect(operation).toBeDefined();
      const [namespace, name] = operation.split(".");
      const source = path.join(entry.sourcePath, "src", `${namespace!}.qs`);
      expect(existsSync(source)).toBe(true);
      expect(readSource(source)).toContain(`operation ${name!}(`);
    }
  });

  it("derives a callable entry expression for every benchmark", () => {
    for (const entry of Object.values(BENCHMARK_REGISTRY)) {
      const built = buildBenchmarkEntryExpr(entry.id, undefined);
      expect(built.ok).toBe(true);
      if (built.ok) {
        expect(built.entryExpr).toMatch(/^[A-Za-z]+\.Run\(.+\)$/);
      }
    }
  });
});
