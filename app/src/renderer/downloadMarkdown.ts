/**
 * Save a Markdown string to the analyst's downloads.
 *
 * There were already two byte-identical copies of this — one in
 * `ExportStubDialog`, one in `ComparisonExportStubDialog`, differing only in
 * how they picked the filename. The conversation export would have been the
 * third, so it is one function now, with the slug rule stated once: whichever
 * copy someone eventually fixes, all three exports get the fix.
 *
 * A Blob and a synthetic anchor rather than a main-process save dialog,
 * unchanged from what those two did: the renderer holds the text already, and
 * routing it through IPC to write a file would put analyst-authored content
 * through a filesystem surface that does not otherwise exist.
 */
export function downloadMarkdown(contents: string, name: string, fallback?: string): void {
  const blob = new Blob([contents], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${markdownFilename(name, fallback)}.md`;
  anchor.click();
  /*
   * Revoked on the next task, not on the next line. `click()` returns as soon
   * as the event dispatches; the browser fetches the blob afterwards, so
   * revoking synchronously is a documented race that can produce a failed or
   * zero-byte download for a large export. Carried over unchanged from the two
   * copies this was extracted from — which is exactly why fixing it once here
   * fixes it for all three export paths.
   */
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * A filename from an analyst-chosen title.
 *
 * Everything that is not a letter or digit collapses to a hyphen — titles here
 * are free text and can contain slashes, quotes and newlines, none of which
 * belong in a filename. The fallback matters: a title of nothing but
 * punctuation would otherwise produce a file called ".md".
 */
export function markdownFilename(name: string, fallback = "qre-export"): string {
  const slug = name
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return slug.length > 0 ? slug : fallback;
}
