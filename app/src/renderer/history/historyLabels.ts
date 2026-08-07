import type { RunConfig } from "../../shared/types";
import { findBenchmark } from "../constants/staticOptions";

/**
 * Human display labels for the derived config fields, shared across the History
 * list, the filter bar, and the Comparison surface (previously copied into each).
 * Presentation only — not contract types; the `?? raw` fallback at each call site
 * keeps an unknown value visible rather than blank.
 */
export const ARCHITECTURE_LABELS: Record<string, string> = {
  gateBased: "Superconducting",
  majorana: "Majorana",
  neutralAtom: "Neutral Atom",
};

export const QEC_LABELS: Record<string, string> = {
  surface_code: "Surface Code",
  three_aux: "Three-Aux",
  low_move_surface_code: "Low-Move Surface Code",
};

export const FACTORY_LABELS: Record<string, string> = {
  round_based: "Round-Based",
  litinski19: "Litinski19",
  gsj24: "GSJ24",
};

/**
 * The Jul 31 POC display renames used to live here. They now sit in
 * `constants/labels.ts` with the rest of the label-only mappings, because
 * `results/` needs them too and `history/ -> results/` is the direction those
 * two layers already depend in.
 */

/**
 * A run's primary magic-state factories as one label. The field is a SET as of
 * contract v1.2.0, so every surface that used to print one id now prints the
 * joined set through here rather than each re-deriving it.
 */
export function factorySetLabel(config: RunConfig): string {
  return config.magicStateFactories
    .map((factory) => FACTORY_LABELS[factory] ?? factory)
    .join(" + ");
}

/**
 * A run's application as a label: the benchmark name/id, `Manual Logical
 * Counts`, or `Uploaded: <filename>`.
 */
export function applicationLabel(config: RunConfig): string {
  const app = config.application;
  if (app.type === "benchmark") {
    return findBenchmark(app.benchmarkId)?.name ?? app.benchmarkId;
  }
  if (app.type === "manualCounts") {
    return "Manual Logical Counts";
  }
  return `Uploaded: ${app.filePath.split(/[\\/]/).pop() ?? app.filePath}`;
}
