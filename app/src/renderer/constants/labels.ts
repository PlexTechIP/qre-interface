/**
 * Display labels for contract enum values. The contract keeps machine values
 * (e.g. `gateBased`); the UI shows human labels (e.g. "Superconducting"). This
 * is a label-only mapping — contract values are never renamed.
 */

import type {
  ArchitectureType,
  MagicStateFactoryId,
  QecCodeId,
  TraceTransformType,
} from "../../shared/types";

export const ARCHITECTURE_LABELS: Record<ArchitectureType, string> = {
  gateBased: "Superconducting",
  majorana: "Majorana",
};

export const QEC_LABELS: Record<QecCodeId, string> = {
  surface_code: "Surface Code",
  three_aux: "Three-Aux",
};

export const TRANSFORM_LABELS: Record<TraceTransformType, string> = {
  psspc: "PSSPC",
  latticeSurgery: "Lattice Surgery",
};

export const MAGIC_STATE_FACTORY_LABELS: Record<MagicStateFactoryId, string> = {
  round_based: "Round-Based",
  litinski19: "Litinski19",
};
