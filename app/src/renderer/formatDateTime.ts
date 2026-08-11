/**
 * A timestamp for a table column: compact numeric date plus time.
 *
 * Lifted out of `RunHistoryList` when the conversation list needed the same
 * thing and grew its own version without a year — so a conversation from last
 * August rendered identically to one from this August, in a list sorted by
 * recency. Two ways of saying when something happened is one too many, and the
 * one that omitted the year was the wrong one.
 *
 * Absolute, never "3 hours ago": these columns sit beside each other in an app
 * where the analyst is comparing runs and transcripts against dated notes.
 */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  // Compact numeric date (xx/xx/xx) + time keeps the column narrow.
  const datePart = date.toLocaleDateString(undefined, {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  });
  const timePart = date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${datePart} ${timePart}`;
}
