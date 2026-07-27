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
};

export const QEC_LABELS: Record<string, string> = {
  surface_code: "Surface Code",
  three_aux: "Three-Aux",
};

export const FACTORY_LABELS: Record<string, string> = {
  round_based: "Round-Based",
  litinski19: "Litinski19",
};

/** A run's application as a label: the benchmark id, or `Uploaded: <filename>`. */
export function applicationLabel(config: RunConfig): string {
  if (config.application.type === "benchmark") {
    return (
      findBenchmark(config.application.benchmarkId)?.name ??
      config.application.benchmarkId
    );
  }
  return `Uploaded: ${
    config.application.filePath.split(/[\\/]/).pop() ??
    config.application.filePath
  }`;
}
