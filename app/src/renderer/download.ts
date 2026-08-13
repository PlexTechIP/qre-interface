/**
 * Save an export to the analyst's downloads.
 *
 * There were already two byte-identical copies of this — one in
 * `ExportStubDialog`, one in `ComparisonExportStubDialog`, differing only in
 * how they picked the filename. The conversation export would have been the
 * third, so it is one function now, with the slug rule stated once: whichever
 * copy someone eventually fixes, all of them get the fix.
 *
 * A Blob and a synthetic anchor rather than a main-process save dialog: the
 * renderer holds the text already, and routing it through IPC to write a file
 * would put analyst-authored content through a filesystem surface that does
 * not otherwise exist.
 */

/** What every export download needs to know beyond its bytes. */
export interface DownloadOptions {
  /** Filename to use when the title slugs to nothing. */
  fallback?: string;
  /**
   * When the export was produced (ISO 8601). Stamped into the filename so two
   * exports do not silently become one file — see `exportFilename`.
   */
  exportedAt?: string;
}

/**
 * How long a download's Blob URL stays valid after its click.
 *
 * There is no event for "the download finished reading the blob", so this is a
 * window rather than a signal: long enough that no realistic export loses the
 * race, short enough that a session of exports does not pin their bytes in
 * memory. A minute is the same order as the file-saving libraries this app
 * deliberately does not depend on.
 */
export const OBJECT_URL_LIFETIME_MS = 60_000;

/**
 * The longest slug allowed before the stamp and extension are added.
 *
 * Run names and conversation titles are free text with no length limit of
 * their own, and a 300-character name produces a path that some filesystems
 * and most archive tools refuse.
 */
const MAX_SLUG_LENGTH = 80;

export function downloadMarkdown(
  contents: string,
  name: string,
  options: DownloadOptions = {},
): void {
  download(contents, "text/markdown;charset=utf-8", `${exportFilename(name, options.fallback, options.exportedAt)}.md`);
}

/**
 * The same download, as CSV.
 *
 * No UTF-8 BOM. Excel reads one as a hint, but every other tool an analyst
 * here is likely to reach for — pandas with the default encoding, R, awk —
 * reports it as part of the first column's name, and this app's audience is
 * already running Python.
 */
export function downloadCsv(contents: string, name: string, options: DownloadOptions = {}): void {
  download(contents, "text/csv;charset=utf-8", `${exportFilename(name, options.fallback, options.exportedAt)}.csv`);
}

function download(contents: string, type: string, filename: string): void {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  /*
   * Revoked on a timer, not on the next line and not on the next task either.
   * `click()` returns as soon as the event dispatches; the browser fetches the
   * blob afterwards, on another thread. Revoking before that fetch completes
   * cancels the download or writes a zero-byte file, and the exports most
   * likely to lose that race are the large ones — which here is the ordinary
   * case, since a run export embeds its whole raw engine output.
   *
   * This was a `setTimeout(…, 0)` carried over unchanged from the two copies
   * this function was extracted from, with a comment calling it a documented
   * race. Fixing it once here fixes every export path, which was the point of
   * extracting it.
   */
  setTimeout(() => URL.revokeObjectURL(url), OBJECT_URL_LIFETIME_MS);
}

/**
 * A filename from an analyst-chosen title.
 *
 * Everything that is not a letter or digit collapses to a hyphen — titles here
 * are free text and can contain slashes, quotes and newlines, none of which
 * belong in a filename. The fallback matters: a title of nothing but
 * punctuation would otherwise produce a file called ".md".
 *
 * The stamp is what stops two exports becoming one file. Run names are chosen
 * by the analyst and are not unique, so the slug alone collides between
 * genuinely different runs, and re-exporting anything left the browser to
 * invent "foo (1).md" — a name that says nothing about which export it is.
 * Stamping the export time instead sorts a Downloads folder into the order the
 * exports were taken.
 */
export function exportFilename(name: string, fallback = "qre-export", exportedAt?: string): string {
  const slug = name
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, MAX_SLUG_LENGTH)
    // Slicing can land on a hyphen the slug rule would never have ended on.
    .replace(/-$/, "");
  const base = slug.length > 0 ? slug : fallback;
  const stamp = filenameStamp(exportedAt);
  return stamp.length > 0 ? `${base}-${stamp}` : base;
}

/**
 * An ISO timestamp as `YYYYMMDD-HHMM`, in UTC.
 *
 * Empty for anything unparseable, so a bad timestamp degrades to the old bare
 * slug rather than writing "NaN" into a filename. UTC rather than local time
 * because the exports themselves record UTC, and a filename that disagreed
 * with the "Exported" line inside the file would be worse than no stamp.
 */
function filenameStamp(exportedAt?: string): string {
  if (exportedAt === undefined) return "";
  const date = new Date(exportedAt);
  if (Number.isNaN(date.getTime())) return "";
  const [day, time] = date.toISOString().split("T");
  if (day === undefined || time === undefined) return "";
  return `${day.replaceAll("-", "")}-${time.slice(0, 5).replace(":", "")}`;
}
