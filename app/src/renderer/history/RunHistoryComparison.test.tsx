// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { useState } from "react";

import { RunHistoryContainer } from "./RunHistoryContainer";
import { InMemoryRunStore } from "../../shared/runStore";
import { SAMPLE_RUN_RECORDS as MOCK_RUN_RECORDS } from "../../shared/testing";

const RUN_A = "Shor's Factoring - Litinski19";
const RUN_B = "Shor's Factoring - Majorana Three-Aux";

afterEach(cleanup);

/**
 * Renders the container in its self-managed (uncontrolled) mode so its internal
 * History/Comparison tab strip is present — this test drives the hand-off by
 * clicking that Comparison tab. The mock-seeded store persists across re-renders.
 */
function Harness() {
  const [store] = useState(() => new InMemoryRunStore(MOCK_RUN_RECORDS));
  return <RunHistoryContainer store={store} />;
}

/** The <tr> for a run in the History list (waits for the async store load). */
async function rowByName(name: string): Promise<HTMLElement> {
  const cell = await screen.findByText(name);
  const row = cell.closest("tr");
  if (!row) throw new Error(`No history row for "${name}"`);
  return row;
}

describe("History → Comparison hand-off (Part E)", () => {
  it("checking runs in History drives the Comparison tab's table", async () => {
    render(<Harness />);

    // Check two runs for comparison from the History list.
    await userEvent.click(within(await rowByName(RUN_A)).getByRole("checkbox"));
    await userEvent.click(within(await rowByName(RUN_B)).getByRole("checkbox"));

    // The Comparison tab reflects the count and, when opened, shows both runs.
    await userEvent.click(screen.getByRole("tab", { name: /comparison \(2\)/i }));

    const table = screen.getByRole("table");
    expect(within(table).getByText(RUN_A)).toBeInTheDocument();
    expect(within(table).getByText(RUN_B)).toBeInTheDocument();

    // Removing a run from the comparison chip strip drops its column.
    await userEvent.click(screen.getByRole("button", { name: new RegExp(`remove ${RUN_A}`, "i") }));
    expect(within(screen.getByRole("table")).queryByText(RUN_A)).not.toBeInTheDocument();
    expect(within(screen.getByRole("table")).getByText(RUN_B)).toBeInTheDocument();
  });
});

/**
 * Controlled (app-shell) mode: the sidebar owns the page, so the surface header's
 * "Compare Selected" button is the hand-off under test.
 */
function ControlledHarness() {
  const [store] = useState(() => new InMemoryRunStore(MOCK_RUN_RECORDS));
  const [view, setView] = useState<"history" | "comparison">("history");
  return <RunHistoryContainer store={store} view={view} onViewChange={setView} />;
}

describe("Compare / Delete Selected popups", () => {
  it("Compare Selected pops up and stays on History when nothing is selected", async () => {
    render(<ControlledHarness />);
    await rowByName(RUN_A);

    await userEvent.click(screen.getByRole("button", { name: /compare selected/i }));

    expect(screen.getByRole("alert")).toHaveTextContent("Select at least 2 runs to compare.");
    // Still on History — the list is present and no comparison table appeared.
    expect(screen.getByText(RUN_A)).toBeInTheDocument();
    expect(screen.queryByText(/one column per run/i)).not.toBeInTheDocument();
  });

  it("Compare Selected pops up with a single run ticked", async () => {
    render(<ControlledHarness />);
    await userEvent.click(within(await rowByName(RUN_A)).getByRole("checkbox"));

    await userEvent.click(screen.getByRole("button", { name: /compare selected/i }));

    expect(screen.getByRole("alert")).toHaveTextContent("Select at least 2 runs to compare.");
    expect(screen.queryByText(/one column per run/i)).not.toBeInTheDocument();
  });

  it("navigates to Comparison once two runs are selected", async () => {
    render(<ControlledHarness />);
    await userEvent.click(within(await rowByName(RUN_A)).getByRole("checkbox"));
    await userEvent.click(within(await rowByName(RUN_B)).getByRole("checkbox"));

    await userEvent.click(screen.getByRole("button", { name: /compare selected/i }));
    expect(await screen.findByText(/one column per run/i)).toBeInTheDocument();
  });

  it("keeps both action buttons enabled so their popups stay reachable", async () => {
    render(<ControlledHarness />);
    await rowByName(RUN_A);

    expect(screen.getByRole("button", { name: /compare selected/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /delete selected/i })).toBeEnabled();
  });

  it("counts what would be COMPARED, not what is ticked, when a filter hides a run", async () => {
    // Two ticked, then a name search matching only one. The comparable count —
    // not the checkbox count — is what the button badge and threshold use.
    render(<ControlledHarness />);
    await userEvent.click(within(await rowByName(RUN_A)).getByRole("checkbox"));
    await userEvent.click(within(await rowByName(RUN_B)).getByRole("checkbox"));

    await userEvent.type(screen.getByLabelText(/search run name/i), "Litinski19");
    expect(
      await screen.findByRole("button", { name: /compare selected \(1\)/i }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /compare selected/i }));

    // Only one run is comparable, so it stays on History with the popup.
    expect(screen.getByText(RUN_A)).toBeInTheDocument();
    expect(screen.queryByText(/one column per run/i)).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Select at least 2 runs to compare.");
  });

  it("Delete Selected pops up when nothing is selected", async () => {
    render(<ControlledHarness />);
    await rowByName(RUN_A);

    await userEvent.click(screen.getByRole("button", { name: /delete selected/i }));

    expect(screen.getByRole("alert")).toHaveTextContent("Select at least 1 run to delete.");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("re-announces the popup on a repeated press", async () => {
    render(<ControlledHarness />);
    await rowByName(RUN_A);
    const button = screen.getByRole("button", { name: /compare selected/i });

    await userEvent.click(button);
    const first = screen.getByRole("alert");

    await userEvent.click(button);
    // A screen reader only re-announces a live region when the node changes, so a
    // second press must produce a fresh element rather than an identical one.
    expect(screen.getByRole("alert")).not.toBe(first);
  });
});
