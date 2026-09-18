// @vitest-environment node

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildRunRecord } from "../shared/testing/builders.js";
import { SqliteRunStore } from "./sqliteRunStore.js";
import { startStoreWatcher } from "./storeWatcher.js";

describe("startStoreWatcher", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("says nothing on the first tick, which is only the baseline", () => {
    // Otherwise every launch reloads a History tab that is already correct.
    const broadcast = vi.fn();
    const watcher = startStoreWatcher({ readVersion: () => 7, broadcast });

    vi.advanceTimersByTime(2000);

    expect(broadcast).not.toHaveBeenCalled();
    watcher.stop();
  });

  it("broadcasts once per change, not once per tick", () => {
    const versions = [1, 1, 2, 2, 2];
    let index = 0;
    const broadcast = vi.fn();
    const watcher = startStoreWatcher({
      readVersion: () => versions[index++] ?? 2,
      broadcast,
    });

    vi.advanceTimersByTime(2000 * versions.length);

    expect(broadcast).toHaveBeenCalledTimes(1);
    watcher.stop();
  });

  it("survives a failed read and notices the next real change", () => {
    // A momentarily locked database says nothing about whether the history
    // changed; losing the rest of the session's live updates over it would.
    const readings: (number | Error)[] = [1, new Error("locked"), 2];
    let index = 0;
    const broadcast = vi.fn();
    const onError = vi.fn();

    const watcher = startStoreWatcher({
      readVersion: () => {
        const reading = readings[index++] ?? 2;
        if (reading instanceof Error) throw reading;
        return reading;
      },
      broadcast,
      onError,
    });

    vi.advanceTimersByTime(2000 * 3);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(broadcast).toHaveBeenCalledTimes(1);
    watcher.stop();
  });

  it("reports a throwing broadcast and keeps the baseline it advanced to", () => {
    // A window destroyed between the check and the send. The next change must
    // still notify, so the version this tick saw has to stick.
    let version = 1;
    const broadcast = vi.fn(() => {
      throw new Error("window destroyed");
    });
    const onError = vi.fn();
    const watcher = startStoreWatcher({
      readVersion: () => version,
      broadcast,
      onError,
    });

    vi.advanceTimersByTime(2000);
    version = 2;
    vi.advanceTimersByTime(2000);
    vi.advanceTimersByTime(2000);

    expect(onError).toHaveBeenCalledTimes(1);
    // Once for the change, and NOT again for the two ticks at the same version.
    expect(broadcast).toHaveBeenCalledTimes(1);
    watcher.stop();
  });

  it("stops reading after stop(), and tolerates being stopped twice", () => {
    const readVersion = vi.fn(() => 1);
    const watcher = startStoreWatcher({ readVersion, broadcast: () => {} });

    vi.advanceTimersByTime(2000);
    const readsBefore = readVersion.mock.calls.length;

    watcher.stop();
    watcher.stop();
    vi.advanceTimersByTime(2000 * 5);

    expect(readVersion).toHaveBeenCalledTimes(readsBefore);
  });
});

describe("the signal the watcher reads", () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "qre-store-watcher-"));
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it("moves for another connection's save and not for this one's own", async () => {
    // The whole reason `data_version` is the right pragma: the dashboard's own
    // saves already update the UI through the path that made them, and a
    // watcher that fired on those would reload History under an analyst who
    // had just clicked Run.
    const path = join(directory, "run-history.sqlite");
    const dashboard = new SqliteRunStore(path);
    const agent = new SqliteRunStore(path);

    try {
      const baseline = dashboard.dataVersion();

      await dashboard.save(
        buildRunRecord({ config: { id: "11111111-1111-4111-8111-111111111111" } }),
      );
      expect(dashboard.dataVersion()).toBe(baseline);

      await agent.save(
        buildRunRecord({ config: { id: "22222222-2222-4222-8222-222222222222" } }),
      );
      expect(dashboard.dataVersion()).not.toBe(baseline);
    } finally {
      agent.close();
      dashboard.close();
    }
  });
});
