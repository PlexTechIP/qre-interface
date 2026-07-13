import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const QSHARP_PROJECT_ROOT = path.join(
  __dirname,
  "benchmarks",
  "qsharp-project",
);

export interface BenchmarkEntry {
  id: string;
  name: string;
  description: string;
  sourcePath: string;
  format: "qsharp" | "openqasm" | "qir";
  entryExpr: string;
}

export const BENCHMARK_REGISTRY: Record<string, BenchmarkEntry> = {
  "shors-factoring": {
    id: "shors-factoring",
    name: "Shor's Factoring",
    description:
      "Factoring-oriented benchmark for estimating resources of Shor-style modular arithmetic workloads.",
    sourcePath: QSHARP_PROJECT_ROOT,
    format: "qsharp",
    entryExpr: "ShorsFactoring.Run()",
  },
  "ekera-hastad-factoring": {
    id: "ekera-hastad-factoring",
    name: "Ekerå-Håstad Factoring",
    description:
      "Factoring benchmark based on the Ekerå-Håstad variant, for contrasting factoring resource estimates against Shor's algorithm.",
    sourcePath: QSHARP_PROJECT_ROOT,
    format: "qsharp",
    entryExpr: "EkeraHastadFactoring.Run()",
  },
  "quantum-dynamics": {
    id: "quantum-dynamics",
    name: "Quantum Dynamics",
    description:
      "Simulation-style benchmark for quantum dynamics workloads and the default baseline for week-2 contract fixtures.",
    sourcePath: QSHARP_PROJECT_ROOT,
    format: "qsharp",
    entryExpr: "QuantumDynamics.Run()",
  },
  "grovers-search": {
    id: "grovers-search",
    name: "Grover's Search",
    description:
      "Search benchmark for Grover-style amplitude amplification workloads.",
    sourcePath: QSHARP_PROJECT_ROOT,
    format: "qsharp",
    entryExpr: "GroversSearch.Run()",
  },
  "phase-estimation": {
    id: "phase-estimation",
    name: "Phase Estimation",
    description:
      "Phase-estimation benchmark for algorithms dominated by controlled unitary applications and precision trade-offs.",
    sourcePath: QSHARP_PROJECT_ROOT,
    format: "qsharp",
    entryExpr: "PhaseEstimation.Run()",
  },
};

export function resolveBenchmark(
  benchmarkId: string,
): BenchmarkEntry | undefined {
  return BENCHMARK_REGISTRY[benchmarkId];
}
