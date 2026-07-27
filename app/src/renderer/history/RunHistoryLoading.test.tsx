// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { RunRecord, RunStore } from "../../shared/types";
import { RunHistoryContainer } from "./RunHistoryContainer";

afterEach(cleanup);

/** A store whose reads stay pending until `resolve()` is called. */
function gatedStore(): { store: RunStore; resolve: () => void } {
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const store: RunStore = {
    async save() {},
    async list(): Promise<RunRecord[]> {
      await gate;
      return [];
    },
    async get() {
      return null;
    },
    async delete() {},
    async query(): Promise<RunRecord[]> {
      await gate;
      return [];
    },
  };
  return { store, resolve: release };
}

describe("RunHistoryContainer initial load", () => {
  it("shows only the loading state — never the empty state — until the first load settles", async () => {
    const { store, resolve } = gatedStore();
    render(
      <RunHistoryContainer store={store} view="history" onViewChange={() => {}} />,
    );

    expect(screen.getByText("Loading runs…")).toBeInTheDocument();
    // The empty state (role="status") must not render while the first load is pending.
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    resolve();

    const emptyState = await screen.findByRole("status");
    expect(emptyState).toHaveTextContent(/no runs found/i);
    expect(screen.queryByText("Loading runs…")).not.toBeInTheDocument();
  });
});
