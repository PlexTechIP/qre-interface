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