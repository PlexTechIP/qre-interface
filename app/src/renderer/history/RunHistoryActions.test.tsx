// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { RunHistoryContainer } from "./RunHistoryContainer";
import { MOCK_RUN_RECORDS } from "../../shared/runRecordFixtures";
import { InMemoryRunStore } from "../../shared/runStore";

const SUCCESS_NAME = "Quantum Dynamics - GateBased 1e-4 - Surface - PSSPC";
const FAILED_NAME = "Ekera-Hastad - infeasible budget";

afterEach(cleanup);

/** Render the History surface with a fresh mock-seeded store, History view. */
function renderHistory() {
  return render(
    <RunHistoryContainer
      store={new InMemoryRunStore(MOCK_RUN_RECORDS)}
      view="history"
      onViewChange={() => {}}
    />,
  );
}

/** The <tr> containing a run with the given name (waits for the async load). */
async function rowByName(name: string): Promise<HTMLElement> {
  const cell = await screen.findByText(name);
  const row = cell.closest("tr");
  if (!row) throw new Error(`No history row found for "${name}"`);
  return row;
}

describe("Run History — per-run actions (Part D)", () => {
  it("View Details renders a saved SUCCESS run by reusing ResultsArea + ConfigSummary", async () => {
    renderHistory();
    const row = await rowByName(SUCCESS_NAME);

    await userEvent.click(within(row).getByRole("button", { name: "View" }));

    // Reuses Team 2's Results components — success rendering.
    expect(await screen.findByText("Configuration Summary")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Estimation Results" })).toBeInTheDocument();

    // Back returns to the list.
    await userEvent.click(screen.getByRole("button", { name: /back to history/i }));
    expect(await screen.findByText(SUCCESS_NAME)).toBeInTheDocument();
  });

  it("View Details renders a saved FAILED run through the failure view", async () => {
    renderHistory();
    const row = await rowByName(FAILED_NAME);

    await userEvent.click(within(row).getByRole("button", { name: "View" }));

    expect(await screen.findByText("Run failed")).toBeInTheDocument();
    expect(screen.getByText("ESTIMATION_FAILED")).toBeInTheDocument();
  });

  it("Delete is gated by a confirm dialog; Cancel keeps the record, Confirm removes it", async () => {
    renderHistory();
    const row = await rowByName(SUCCESS_NAME);

    // Opening the confirm does NOT delete.
    await userEvent.click(within(row).getByRole("button", { name: "Delete" }));
    const confirm = await screen.findByRole("dialog");
    expect(within(confirm).getByRole("heading", { name: /delete run\?/i })).toBeInTheDocument();
    await userEvent.click(within(confirm).getByRole("button", { name: /cancel/i }));
    expect(screen.getByText(SUCCESS_NAME)).toBeInTheDocument();

    // Confirming removes it from the list.
    await userEvent.click(within(await rowByName(SUCCESS_NAME)).getByRole("button", { name: "Delete" }));
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: /delete run/i }),
    );
    await waitFor(() => expect(screen.queryByText(SUCCESS_NAME)).not.toBeInTheDocument());
  });

  it("Export opens the Markdown stub preview (seam only, no real generator)", async () => {
    renderHistory();
    const row = await rowByName(SUCCESS_NAME);

    await userEvent.click(within(row).getByRole("button", { name: "Export" }));

    const dialog = await screen.findByRole("dialog");
    const preview = within(dialog).getByLabelText("Export preview");
    expect(preview).toHaveTextContent(/placeholder/i);
    expect(preview).toHaveTextContent(SUCCESS_NAME);
  });

  it("Rerun surfaces a reconstructed config carrying the name but a fresh id", async () => {
    renderHistory();
    const row = await rowByName(SUCCESS_NAME);

    await userEvent.click(within(row).getByRole("button", { name: "Rerun" }));

    const dialog = await screen.findByRole("dialog");
    const pre = within(dialog).getByLabelText("Reconstructed configuration");
    const reconstructed = JSON.parse(pre.textContent ?? "{}");

    const original = MOCK_RUN_RECORDS.find((r) => r.config.name === SUCCESS_NAME);
    expect(original).toBeDefined();
    expect(reconstructed.name).toBe(SUCCESS_NAME);
    expect(reconstructed.id).not.toBe(original?.config.id);
  });
});
