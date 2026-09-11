import { useState } from "react";

/**
 * The line every export carries saying when it was produced.
 *
 * An export leaves the app and is read later, beside other exports of the same
 * runs. Without a date on the document itself, "which of these two is current"
 * is answerable only from a file mtime — which copying, syncing, or mailing the
 * file destroys. The same ISO string is stamped into the filename, so the two
 * agree; see `exportFilename`.
 *
 * Returns null when the caller did not supply a time, so a generator called
 * without one emits nothing rather than a line dated `undefined`. Every
 * in-app call site supplies it; the tests that do not are asserting the
 * generators' own output and have no business inventing a clock.
 */
export function exportedOnLine(exportedAt?: string): string | null {
  return exportedAt === undefined ? null : `> Exported from the QRE Interface on ${exportedAt}.`;
}

/**
 * The moment an export was produced, fixed for as long as the dialog is open.
 *
 * A `useState` initialiser rather than a bare `new Date()`: the preview and the
 * downloaded file have to be the same document, and reading the clock during
 * render would date them differently as soon as any re-render lands between
 * opening the dialog and pressing Download.
 */
export function useExportedAt(): string {
  const [exportedAt] = useState(() => new Date().toISOString());
  return exportedAt;
}
