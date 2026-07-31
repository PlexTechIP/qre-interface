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

describe("Compare Selected below the threshold", () => {
  it("stays on History and says what is needed when nothing is selected", async () => {
    render(<ControlledHarness />);
    await rowByName(RUN_A);

    await userEvent.click(screen.getByRole("button", { name: /compare selected/i }));

    expect(screen.getByRole("alert")).toHaveTextContent(/at least 2 runs/i);
    // Still on History — the list is present and no comparison table appeared.
    expect(screen.getByText(RUN_A)).toBeInTheDocument();
    expect(screen.queryByText(/one column per run/i)).not.toBeInTheDocument();
  });

  it("says how many more are needed with a single run ticked", async () => {
    render(<ControlledHarness />);
    await userEvent.click(within(await rowByName(RUN_A)).getByRole("checkbox"));

    await userEvent.click(screen.getByRole("button", { name: /compare selected/i }));

    expect(screen.getByRole("alert")).toHaveTextContent(/1 more/i);
    expect(screen.queryByText(/one column per run/i)).not.toBeInTheDocument();
  });

  it("navigates once two runs are selected, and clears the warning", async () => {
    render(<ControlledHarness />);
    await userEvent.click(within(await rowByName(RUN_A)).getByRole("checkbox"));
    await userEvent.click(screen.getByRole("button", { name: /compare selected/i }));
    expect(screen.getByRole("alert")).toBeInTheDocument();

    // Ticking a second run resolves the warning in place, without another click.
    await userEvent.click(within(await rowByName(RUN_B)).getByRole("checkbox"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /compare selected/i }));
    expect(await screen.findByText(/one column per run/i)).toBeInTheDocument();
  });

  it("keeps the button enabled so the explanation is reachable", async () => {
    render(<ControlledHarness />);
    await rowByName(RUN_A);

    expect(screen.getByRole("button", { name: /compare selected/i })).toBeEnabled();
  });

  it("stops warning once the selection recovers, even without pressing again", async () => {
    render(<ControlledHarness />);
    await userEvent.click(within(await rowByName(RUN_A)).getByRole("checkbox"));
    await userEvent.click(screen.getByRole("button", { name: /compare selected/i }));
    expect(screen.getByRole("alert")).toBeInTheDocument();

    // Reaching the threshold retires the warning...
    await userEvent.click(within(await rowByName(RUN_B)).getByRole("checkbox"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    // ...and dropping back below it must NOT resurrect an unprompted warning.
    await userEvent.click(within(await rowByName(RUN_B)).getByRole("checkbox"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("re-announces the warning on a repeated press", async () => {
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
