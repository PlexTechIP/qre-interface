/**
 * Noticing that somebody else wrote a run.
 *
 * Until the MCP server could append, the dashboard was the only writer of its
 * own database, so History was correct by construction: it changed when the
 * analyst changed it. It is not any more — an agent can save a run while the
 * app sits open on the History tab, and a list that quietly disagrees with the
 * database is worse than no list at all, because nothing about it looks stale.
 *
 * The signal is `PRAGMA data_version`, which SQLite changes when ANOTHER
 * connection commits and never when this one does. That asymmetry is the whole
 * reason it is the right pragma here: the dashboard's own saves already update
 * the UI through the path that made them, and a watcher that fired on those too
 * would reload History underneath an analyst who had just saved a run.
 *
 * Not `fs.watch` on the database file: under WAL a commit lands in the `-wal`
 * file and the main file's mtime may not move at all, and the events that do
 * arrive are platform-specific and coalesced. Not a row count either — that
 * cannot tell a delete-then-insert from nothing happening.
 *
 * Two seconds is chosen against the thing being waited for: an estimate takes
 * seconds to minutes, so a two-second poll is never the reason a row feels
 * late, and one pragma on an open connection is far below the noise floor of an
 * idle Electron app.
 */

export interface StoreWatcherOptions {
  /** `PRAGMA data_version` on the dashboard's own connection. */
  readVersion: () => number;
  /** Tell every window the history changed. */
  broadcast: () => void;
  intervalMs?: number;
  /** Where a failed read or broadcast goes. Nothing here throws at the caller. */
  onError?: (error: unknown) => void;
}

export interface StoreWatcher {
  /** Stop polling. Safe to call more than once. */
  stop(): void;
}

const DEFAULT_INTERVAL_MS = 2000;

export function startStoreWatcher(options: StoreWatcherOptions): StoreWatcher {
  const { readVersion, broadcast, onError } = options;
  let lastVersion: number | null = null;
  let stopped = false;

  const tick = (): void => {
    if (stopped) return;

    let version: number;
    try {
      version = readVersion();
    } catch (error) {
      // A read that fails says nothing about whether the history changed — the
      // database may be momentarily locked, or closing. Reporting and
      // continuing means a transient failure costs one tick rather than the
      // rest of the session's live updates.
      onError?.(error);
      return;
    }

    // The first tick establishes the baseline. Broadcasting here would make
    // every launch reload a History tab that is already correct.
    if (lastVersion === null) {
      lastVersion = version;
      return;
    }
    if (version === lastVersion) return;

    lastVersion = version;
    try {
      broadcast();
    } catch (error) {
      // A window destroyed between the check and the send, most likely. The
      // baseline is already advanced, so the next change still notifies.
      onError?.(error);
    }
  };

  const timer = setInterval(tick, options.intervalMs ?? DEFAULT_INTERVAL_MS);
  // Unref'd so this cannot be the reason the process stays alive: a poll on a
  // database nobody is looking at should not keep an app from quitting.
  if (typeof timer.unref === "function") timer.unref();

  return {
    stop(): void {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
    },
  };
}
