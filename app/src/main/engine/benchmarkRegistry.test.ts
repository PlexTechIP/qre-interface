import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BENCHMARK_REGISTRY } from "./benchmarkRegistry.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../../..");

interface ContractBenchmark {
  id: string;
  name: string;
  description: string;
}

describe("benchmark registry", () => {
  it("mirrors every frozen benchmark id, name, and description", () => {
    const contract = JSON.parse(
      readFileSync(
        path.join(REPO_ROOT, "contracts", "benchmarks.json"),
        "utf8",
      ),
    ) as { benchmarks: ContractBenchmark[] };
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
