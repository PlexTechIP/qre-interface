// @vitest-environment jsdom
/**
 * The per-run actions stay in reach.
 *
 * The History table is wider than the space it gets in a default 1280px
 * window, and the Actions column sat at its far end — so View, Rerun, Export
 * and Delete were scrolled out of sight until the analyst found the
 * horizontal scrollbar under the last row. The column is pinned to the right
 * edge of the scroller instead, header included.
 *
 * jsdom has no layout, so the pinning is asserted where it lives: the cells
 * carry the column's class, and the stylesheet makes that class sticky.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { InMemoryRunStore } from "../../shared/runStore";
import { SAMPLE_RUN_RECORDS } from "../../shared/testing";
import { RunHistoryContainer } from "./RunHistoryContainer";

afterEach(cleanup);

const stylesheet = readFileSync(path.join(process.cwd(), "src/renderer/styles.css"), "utf8");

describe("the History table's Actions column", () => {
  it("is one column from header to last row", async () => {
    render(
      <RunHistoryContainer
        store={new InMemoryRunStore(SAMPLE_RUN_RECORDS)}
        view="history"
        onViewChange={() => {}}
      />,
    );
    await screen.findAllByRole("button", { name: "View" });

    expect(screen.getByRole("columnheader", { name: "Actions" })).toHaveClass("col-actions");
    for (const view of screen.getAllByRole("button", { name: "View" })) {
      expect(view.closest("td")).toHaveClass("col-actions");
    }
  });

  it("is pinned to the right edge of the scrolling table", () => {
    expect(stylesheet).toMatch(
      /\.history-table \.col-actions\s*\{[^}]*position:\s*sticky;[^}]*right:\s*0;/,
    );
  });
});
