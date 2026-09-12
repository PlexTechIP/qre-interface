// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildRunRecord } from "../../shared/testing/builders";
import type { RunRecord, RunStore, RunStoreChangeSource } from "../../shared/types";
import { RunHistoryContainer } from "./RunHistoryContainer";

afterEach(cleanup);

/**
 * A store over a mutable array, so a test can add a record the way another
 * process would — behind the container's back.
 *
 * `failReads` flips it into the state a database momentarily held by another
 * writer puts it in: reads reject, writes are irrelevant.
 */
function mutableStore(
  records: RunRecord[],
  failReads: () => boolean = () => false,
): RunStore {
  const guard = async (): Promise<void> => {
    if (failReads()) throw new Error("database is locked");
  };
  return {
    async save(record: RunRecord) {
      records.push(record);
    },
    async list(): Promise<RunRecord[]> {
      await guard();
      return [...records];
    },
    async get(id: string): Promise<RunRecord | null> {
      return records.find((record) => record.id === id) ?? null;
    },
    async delete(id: string) {
      const index = records.findIndex((record) => record.id === id);
      if (index >= 0) records.splice(index, 1);
    },
    async query(): Promise<RunRecord[]> {
      await guard();
      return [...records];
    },
  };
}

/** A change source whose listener the test fires by hand. */
function fakeChanges(): RunStoreChangeSource & {
  fire: () => void;
  unsubscribe: ReturnType<typeof vi.fn>;
} {
  let listener: (() => void) | null = null;
  const unsubscribe = vi.fn(() => {
    listener = null;
  });
  return {
    onChanged(next: () => void) {
      listener = next;
      return unsubscribe;
    },
    fire: () => listener?.(),
    unsubscribe,
  };
}

describe("History when another process saves a run", () => {
  it("shows the new row without flashing the loading state", async () => {
    const records = [
      buildRunRecord({
        config: { id: "11111111-1111-4111-8111-111111111111", name: "analyst run" },
      }),
    ];
    const changes = fakeChanges();

    render(
      <RunHistoryContainer
        store={mutableStore(records)}
        changes={changes}
        view="history"
        onViewChange={() => {}}
      />,
    );

    expect(await screen.findByText("analyst run")).toBeInTheDocument();

    // An agent saved one through the MCP server.
    records.push(
      buildRunRecord({
        config: { id: "22222222-2222-4222-8222-222222222222", name: "agent run" },
      }),
    );
    changes.fire();

    expect(await screen.findByText("agent run")).toBeInTheDocument();
    // The analyst did not ask for this, so it must not replace what they are
    // reading with "Loading runs…".
    expect(screen.queryByText("Loading runs…")).not.toBeInTheDocument();
    expect(screen.getByText("analyst run")).toBeInTheDocument();
  });

  it("unsubscribes when the page goes away", async () => {
    const changes = fakeChanges();
    const { unmount } = render(
      <RunHistoryContainer
        store={mutableStore([])}
        changes={changes}
        view="history"
        onViewChange={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByText("Loading runs…")).not.toBeInTheDocument();
    });

    unmount();

    expect(changes.unsubscribe).toHaveBeenCalled();
  });

  it("renders normally with no change source at all", async () => {
    // Every standalone render and every test that predates this passes none.
    render(
      <RunHistoryContainer
        store={mutableStore([
          buildRunRecord({
            config: { id: "33333333-3333-4333-8333-333333333333", name: "lone run" },
          }),
        ])}
        view="history"
        onViewChange={() => {}}
      />,
    );

    expect(await screen.findByText("lone run")).toBeInTheDocument();
  });
});

describe("a background refresh that fails", () => {
  it("leaves the rows the analyst is reading exactly where they are", async () => {
    /*
     * The whole point of a silent load is not to disturb someone who did not
     * ask for it. Blanking the list and raising an error over a transient lock
     * — hit by a refresh they never requested, about a change they did not make
     * — is the loudest possible way to fail, and it destroys the last good
     * answer to put nothing in its place.
     */
    let locked = false;
    const records = [
      buildRunRecord({
        config: { id: "11111111-1111-4111-8111-111111111111", name: "analyst run" },
      }),
    ];
    const changes = fakeChanges();

    render(
      <RunHistoryContainer
        store={mutableStore(records, () => locked)}
        changes={changes}
        view="history"
        onViewChange={() => {}}
      />,
    );

    expect(await screen.findByText("analyst run")).toBeInTheDocument();

    // An agent saves a run, and the read that follows loses to the write lock.
    locked = true;
    records.push(
      buildRunRecord({
        config: { id: "22222222-2222-4222-8222-222222222222", name: "agent run" },
      }),
    );
    changes.fire();

    await waitFor(() => {
      expect(screen.getByText("analyst run")).toBeInTheDocument();
    });
    // Not blanked, and no error raised for something the analyst did not do.
    expect(screen.queryByText(/failed to load runs/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/database is locked/i)).not.toBeInTheDocument();

    // And once the lock clears, the next notification lands normally.
    locked = false;
    changes.fire();
    expect(await screen.findByText("agent run")).toBeInTheDocument();
  });
});
