/**
 * Committed mock run records — the dev data for the Run History UI (Team 1).
 *
 * These stand in for the real SQLite store this week (mock records out, real
 * store in = week 4, the same play as the engine swap). They deliberately span
 * the filter/render space:
 *   - applications: quantum-dynamics, shors-factoring, grovers-search,
 *     phase-estimation, ekera-hastad-factoring (5 distinct)
 *   - architectures: gateBased (x4) AND majorana (x1)
 *   - QEC codes: surface_code (x4) AND three_aux (x1)
 *   - factories: round_based (x4) AND litinski19 (x1)
 *   - QRE versions: qdk-qre-1.29.1 (x4) AND qdk-qre-1.28.0 (x1)
 *   - statuses: succeeded (x4, incl. a sparse/one-row + zero-value run) AND
 *     failed (x1)
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

/** All mock records, in file order (NOT display order — the store sorts newest-first). */
export const MOCK_RUN_RECORDS: readonly RunRecord[] = [
  quantumDynamics as unknown as RunRecord,
  shorsLitinski19 as unknown as RunRecord,
  groversSparse as unknown as RunRecord,
  phaseMajorana as unknown as RunRecord,
  ekeraFailed as unknown as RunRecord,
];
