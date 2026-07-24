/**
 * Static option sources for week 2.
 *
 * TEMPORARY: these values are hardcoded/read from the frozen contract this
 * week. Week 3+ the engine reports its benchmark registry and version at
 * runtime, and this module is replaced by that call. Keep all fixed choice
 * sets here so that replacement is a single-file change.
 */

import benchmarksData from "../../shared/contracts/benchmarks.json";
import {
  BENCHMARK_IDS,
  type BenchmarkId,
  type MajoranaArchitecture,
  type UploadedProgramFormat,
} from "../../shared/types";

// ---------------------------------------------------------------------------
// Benchmarks — read from contracts/benchmarks.json (PM-owned, frozen)
// ---------------------------------------------------------------------------

/**
 * Shape of one entry in contracts/benchmarks.json. This is NOT a contract type
 * (types.ts defines only the id union) — it describes the JSON file's own
 * shape. Fields the UI doesn't use (source, entryExpr, category) are omitted.
 */
export interface Benchmark {
  id: BenchmarkId;
  name: string;
  description: string;
  keywords: readonly string[];
}

const KNOWN_BENCHMARK_IDS: ReadonlySet<string> = new Set(BENCHMARK_IDS);

function isBenchmarkId(value: string): value is BenchmarkId {
  return KNOWN_BENCHMARK_IDS.has(value);
}

/**
 * Drift guard: the JSON is PM-owned and versioned separately from types.ts, so
 * verify at module load that every id in the file is one the contract knows.
 * A mismatch is a contract bug (report it in the channel), not a user error.
 */
function toBenchmarks(raw: typeof benchmarksData.benchmarks): readonly Benchmark[] {
  return raw.map((entry) => {
    if (!isBenchmarkId(entry.id)) {
      throw new Error(
        `benchmarks.json contains id "${entry.id}", which is not in BENCHMARK_IDS ` +
          `(contracts/types.ts). The JSON and the type union have drifted.`,
      );
    }
    return {
      id: entry.id,
      name: entry.name,
      description: entry.description,
      keywords: entry.keywords,
    };
  });
}

/** The five canonical starter benchmarks, in contract order. */
export const BENCHMARKS: readonly Benchmark[] = toBenchmarks(benchmarksData.benchmarks);

/** Lookup by id. Returns undefined for ids not in the starter list. */
export function findBenchmark(id: string): Benchmark | undefined {
  return BENCHMARKS.find((benchmark) => benchmark.id === id);
}

// ---------------------------------------------------------------------------
// Fixed choice sets not covered by the JSON
// ---------------------------------------------------------------------------

/** Majorana error rate select options. The contract types the field as a
 *  literal union but provides no iterable list; this is that list. */
export const MAJORANA_ERROR_RATES: readonly {
  value: MajoranaArchitecture["errorRate"];
  label: string;
}[] = [
  { value: 0.0001, label: "1e-4" },
  { value: 0.00001, label: "1e-5" },
  { value: 0.000001, label: "1e-6" },
];

/** Display labels for the uploaded program formats. Typed as a total record so
 *  a new format in the contract fails the build until a label is added. */
export const FORMAT_LABELS: Record<UploadedProgramFormat, string> = {
  qsharp: "Q#",
  openqasm: "OpenQASM",
  qir: "QIR",
};

// ---------------------------------------------------------------------------
// QRE version
// ---------------------------------------------------------------------------

/**
 * Shown read-only at configuration time and stamped into RunConfig.qreVersion
 * (informational — RunResult.qreVersion, self-reported by the engine at runtime,
 * is authoritative). Pinned to the bundled qdk[qre] version (requirements.txt).
 */
export const QRE_VERSION = "1.29.1";