// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { RunHistoryContainer } from "./RunHistoryContainer";

const RUN_A = "Shor's Factoring - Litinski19";
const RUN_B = "Shor's Factoring - Majorana Three-Aux";

afterEach(cleanup);

/** The <tr> for a run in the History list (waits for the async store load). */
async function rowByName(name: string): Promise<HTMLElement> {
  const cell = await screen.findByText(name);
  const row = cell.closest("tr");
  if (!row) throw new Error(`No history row for "${name}"`);
  return row;
}

describe("History → Comparison hand-off (Part E)", () => {
  it("checking runs in History drives the Comparison tab's table", async () => {
    render(<RunHistoryContainer />);

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
