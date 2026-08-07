/**
 * Display labels for contract enum values. The contract keeps machine values
 * (e.g. `gateBased`); the UI shows human labels (e.g. "Superconducting"). This
 * is a label-only mapping — contract values are never renamed.
 */
 
import type {
  ArchitectureType,
  MagicStateFactoryId,
  MemoryOptimizationId,
  QecCodeId,
  SecondaryFactoryId,
} from "../../shared/types";
 
export const ARCHITECTURE_LABELS: Record<ArchitectureType, string> = {
  gateBased: "Superconducting",
  majorana: "Majorana",
  neutralAtom: "Neutral Atom",
};
 
export const QEC_LABELS: Record<QecCodeId, string> = {
  surface_code: "Surface Code",
  three_aux: "Three-Aux",
  low_move_surface_code: "Low-Move Surface Code",
};
 
export const MAGIC_STATE_FACTORY_LABELS: Record<MagicStateFactoryId, string> = {
  round_based: "Round-Based",
  litinski19: "Litinski19",
  gsj24: "GSJ24",
};
 
export const SECONDARY_FACTORY_LABELS: Record<SecondaryFactoryId, string> = {
  magic_up_to_clifford: "Magic Up-to-Clifford",
  gsj24_ccx: "GSJ24 CCX",
};
 
export const MEMORY_OPTIMIZATION_LABELS: Record<MemoryOptimizationId, string> = {
  none: "None",
  yoked_1d: "1D Yoked Surface Code",
  yoked_2d: "2D Yoked Surface Code",
};

/**
 * Jul 31 POC display renames. Contract ids (`maxError`,
 * `traceTransform.tStatesPerRotation`, qdk's `num_ts_per_rotation`) are
 * unchanged — this is a label-only mapping, like everything else in this file.
 *
 * They live HERE, and not in `history/historyLabels.ts` where they landed
 * first, because `results/` needs them too: the results recap, the comparison
 * table, and the Markdown export must call one number by one name, and that was
 * the whole point of extracting a constant. `history/` already imports from
 * `results/` (`formatMetric`, `getAdditionalFieldDefinitions`), so pointing
 * `results/` back at `history/` closed the loop the wrong way round. Every
 * layer already imports this module.
 */
export const TOTAL_FAULT_TOLERANT_EXECUTION_ERROR_LABEL =
  "Total Fault Tolerant Execution Error";
export const T_COUNT_PER_ROTATION_LABEL = "T Count Per Rotation";