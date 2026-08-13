/**
 * Markdown table construction, shared by the exports that emit one.
 *
 * Extracted because `markdownCell` existed twice, byte for byte, in the run and
 * comparison exporters — the same duplication `download.ts` was extracted to
 * remove, one layer up. Two copies of an escaping rule is one copy that will
 * eventually be fixed alone, and a table whose cells are escaped in one export
 * and not the other fails in a way nobody notices until a run is named with a
 * pipe in it.
 */

/**
 * One table cell's text, safe to sit between pipes.
 *
 * A literal `|` would end the cell early and shift every column after it; a
 * newline would end the ROW, silently turning one run's line into two. Both are
 * reachable: run names and conversation titles are free text.
 */
export function markdownCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

/**
 * One table row from its cells, with the outer pipes it needs.
 *
 * Escaping happens here rather than at the call sites, so a caller cannot
 * assemble a row and forget it. The pipes belong here too: the comparison
 * exporter used to build rows by appending a bare `"|"` to the cell list and
 * joining, which ends `| |` and reads as a real trailing empty cell to every
 * Markdown renderer.
 */
export function markdownRow(cells: readonly string[]): string {
  return `| ${cells.map(markdownCell).join(" | ")} |`;
}
