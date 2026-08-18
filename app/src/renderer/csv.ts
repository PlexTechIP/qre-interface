import type { FieldMetric } from "../shared/types";
import { formatMetric } from "./results/formatMetric";

/**
 * CSV, to RFC 4180, for the exports that already emit a Markdown table.
 *
 * The Markdown is for reading and the CSV is for computing, which is the whole
 * reason both exist. The rule that follows from that, and the one thing this
 * module is really for: **a numeric cell carries the number, never
 * `formatMetric`'s rendering of it.** The display strings are actively wrong
 * as data — "1,000,000" is text to a spreadsheet because of the separator, and
 * "10 ms" has silently converted a value the record holds in nanoseconds.
 */

/** One field, escaped if it contains a delimiter, a quote, or a line break. */
export function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/**
 * A CSV document from its rows.
 *
 * CRLF because RFC 4180 says so, and because it is the ending every
 * spreadsheet on every platform reads without being asked.
 */
export function csvDocument(rows: readonly (readonly string[])[]): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

/**
 * A metric as data.
 *
 * Numbers pass through raw at full precision. Everything else — the factory
 * list, the string-valued appendix fields — has no numeric form to preserve, so
 * it takes `formatMetric`'s rendering, which is what the reader would see on
 * screen anyway.
 *
 * A missing metric is an empty cell rather than `formatMetric`'s em dash: a
 * dash is a value as far as a spreadsheet is concerned, and it turns an
 * otherwise numeric column into text.
 */
export function csvValue(metric: FieldMetric | null | undefined): string {
  if (metric === null || metric === undefined) return "";
  const { value } = metric;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return value;
  return formatMetric(metric);
}

/** `Runtime (ns)`, or a bare `Code Distance` when the field has no unit. */
export function csvHeader(label: string, unit: string): string {
  return unit.length > 0 ? `${label} (${unit})` : label;
}
