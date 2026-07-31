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
 * The app-shell arrangement: the shell owns the History/Comparison view, so the
 * surface header shows the "Compare Selected" cross-nav button. This is the path
 * the warning guards — it is the only way to reach Comparison from History.
 */
function Harness() {
  const [store] = useState(() => new InMemoryRunStore(MOCK_RUN_RECORDS));
  const [view, setView] = useState<"history" | "comparison">("history");
  return <RunHistoryContainer store={store} view={view} onViewChange={setView} />;
}

async function rowByName(name: string): Promise<HTMLElement> {
  const cell = await screen.findByText(name);
  const row = cell.closest("tr");
  if (!row) throw new Error(`No history row for "${name}"`);
  return row;
}

async function check(name: string): Promise<void> {
  await userEvent.click(within(await rowByName(name)).getByRole("checkbox"));
}

function compareButton(): HTMLElement {
  return screen.getByRole("button", { name: /compare selected/i });
}

/** True while the History list (not the Comparison surface) is on screen. */
function isOnHistory(): boolean {
  return screen.queryByRole("columnheader", { name: /run name/i }) !== null;
}

describe("Compare Selected below the two-run threshold", () => {
  it("warns and stays on History with nothing selected", async () => {
    render(<Harness />);
    await rowByName(RUN_A); // wait for the store load

    await userEvent.click(compareButton());

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/select at least 2 runs to compare/i);
    expect(isOnHistory()).toBe(true);
    expect(screen.queryByRole("table", { name: /result fields per selected run/i })).not.toBeInTheDocument();
  });

  it("warns and stays on History with one run selected", async () => {
    render(<Harness />);
    await check(RUN_A);

    await userEvent.click(compareButton());

    expect(screen.getByRole("alert")).toHaveTextContent(/only 1 run is selected/i);
    expect(screen.getByRole("alert")).toHaveTextContent(/1 more run/i);
    expect(isOnHistory()).toBe(true);
  });

  it("stays enabled so the warning is what explains the refusal", async () => {
    render(<Harness />);
    await rowByName(RUN_A);

    // A disabled button would leave the user guessing why nothing happened.
    expect(compareButton()).toBeEnabled();
  });

  it("clears the warning as soon as a second run is checked", async () => {
    render(<Harness />);
    await check(RUN_A);
    await userEvent.click(compareButton());
    expect(screen.getByRole("alert")).toBeInTheDocument();

    await check(RUN_B);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("navigates once two runs are selected", async () => {
    render(<Harness />);
    await check(RUN_A);
    await check(RUN_B);

    await userEvent.click(compareButton());

    const table = screen.getByRole("table", { name: /result fields per selected run/i });
    expect(within(table).getByText(RUN_A)).toBeInTheDocument();
    expect(within(table).getByText(RUN_B)).toBeInTheDocument();
    expect(isOnHistory()).toBe(false);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("counts what would be COMPARED, not what is checked, when a filter hides a run", async () => {
    // Two checked, then a name search that matches only one. The old guard
    // counted checkboxes and navigated to a one-column "comparison".
    render(<Harness />);
    await check(RUN_A);
    await check(RUN_B);

    await userEvent.type(screen.getByLabelText(/search run name/i), "Litinski19");
    // The button's count follows the same number the guard uses.
    expect(await screen.findByRole("button", { name: /compare selected \(1\)/i })).toBeInTheDocument();

    await userEvent.click(compareButton());

    expect(isOnHistory()).toBe(true);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/only 1 run is selected/i);
    // …and says why, so "(1)" after ticking two boxes doesn't just look broken.
    expect(alert).toHaveTextContent(/1 checked run is hidden by the current filter/i);
  });

  it("warns from the detail panel too, where the button is equally reachable", async () => {
    render(<Harness />);
    await check(RUN_A);
    // Open a run's detail panel — it takes over the branch the list rendered in.
    await userEvent.click(within(await rowByName(RUN_B)).getByRole("button", { name: /^view$/i }));
    expect(isOnHistory()).toBe(false);

    await userEvent.click(compareButton());

    // A press that produced no visible response would be the silent no-op the
    // enabled button was chosen to avoid.
    expect(screen.getByRole("alert")).toHaveTextContent(/only 1 run is selected/i);
  });

  it("clears the warning when the selection SHRINKS, not only when it grows", async () => {
    render(<Harness />);
    await check(RUN_A);
    await userEvent.click(compareButton());
    expect(screen.getByRole("alert")).toHaveTextContent(/only 1 run is selected/i);

    await check(RUN_A); // uncheck it — now zero are selected

    // Stale text would still claim one run is selected and one more is needed.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("says a one-run Comparison is below the threshold when reached another way", async () => {
    // The sidebar switches the shell's page directly, bypassing the button —
    // so the Comparison surface has to carry the message itself. Without this a
    // one-run selection reads as a finished comparison of one.
    function SidebarHarness() {
      const [store] = useState(() => new InMemoryRunStore(MOCK_RUN_RECORDS));
      const [view, setView] = useState<"history" | "comparison">("history");
      return (
        <>
          <button type="button" onClick={() => setView("comparison")}>
            Sidebar: Comparison
          </button>
          <RunHistoryContainer store={store} view={view} onViewChange={setView} />
        </>
      );
    }
    render(<SidebarHarness />);
    await check(RUN_A);

    await userEvent.click(screen.getByRole("button", { name: /sidebar: comparison/i }));

    expect(screen.getByRole("alert")).toHaveTextContent(/only 1 run is selected/i);
    // It still renders the single column rather than blanking the page.
    expect(
      within(screen.getByRole("table", { name: /result fields per selected run/i })).getByText(RUN_A),
    ).toBeInTheDocument();
  });
});
