/**
 * Committed mock run records — the dev data for the Run History UI (Team 1).
 *
 * These stand in for the real SQLite store this week (mock records out, real
 * store in = week 4, the same play as the engine swap). They deliberately span
 * the filter/render space:
 *   - applications: quantum-dynamics, shors-factoring (x3), grovers-search,
 *     phase-estimation, ekera-hastad-factoring
 *   - architectures: gateBased (x5) AND majorana (x2)
 *   - QEC codes: surface_code (x5) AND three_aux (x2)
 *   - factories: round_based (x6) AND litinski19 (x1)
 *   - QRE versions: qdk-qre-1.29.1 (x6) AND qdk-qre-1.28.0 (x1)
 *   - statuses: succeeded (x6, incl. a sparse/one-row + zero-value run) AND
 *     failed (x1)
 *
 * The **same-benchmark Shor's trio** — GateBased+Litinski19, GateBased+Round-Based,
 * and Majorana+Three-Aux — is the sharp story for the Comparison surface: same
 * algorithm, three configurations, clearly different physical-qubit / runtime /
 * factory profiles (Majorana << GateBased on qubits; Litinski19 < Round-Based on
 * factory qubits). Comparison reads `value` + `unit` via `formatMetric`.
 *
 * Seed an `InMemoryRunStore` with these, or use them directly. Every record is
 * validated against the committed schema by the test suite.
 */

import type { RunRecord } from "./types";
import ekeraFailed from "./contracts/fixtures/runrecord.ekera-failed.json";
import groversSparse from "./contracts/fixtures/runrecord.grovers-sparse-success.json";
import phaseMajorana from "./contracts/fixtures/runrecord.phase-majorana-success.json";
import quantumDynamics from "./contracts/fixtures/runrecord.quantum-dynamics-success.json";
import shorsLitinski19 from "./contracts/fixtures/runrecord.shors-litinski19-success.json";
import shorsRoundBased from "./contracts/fixtures/runrecord.shors-roundbased-success.json";
import shorsMajorana from "./contracts/fixtures/runrecord.shors-majorana-success.json";

/** All mock records, in file order (NOT display order — the store sorts newest-first). */
export const MOCK_RUN_RECORDS: readonly RunRecord[] = [
  quantumDynamics as unknown as RunRecord,
  shorsLitinski19 as unknown as RunRecord,
  groversSparse as unknown as RunRecord,
  phaseMajorana as unknown as RunRecord,
  ekeraFailed as unknown as RunRecord,
  shorsRoundBased as unknown as RunRecord,
  shorsMajorana as unknown as RunRecord,
];
