import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { InMemoryRunStore } from "../shared/runStore";
import {
  SAMPLE_RUN_RECORDS,
  buildFrontierRow,
  buildRunRecord,
  buildSuccessResult,
  fakeEstimator,
} from "../shared/testing";
import { App } from "./App";

describe("App shell wiring", () => {
  beforeEach(() => {
    window.estimator = fakeEstimator(buildSuccessResult(), { delayMs: 10 });
    window.store = new InMemoryRunStore(SAMPLE_RUN_RECORDS);
  });

  it("opens on the Run Configuration surface", () => {
    render(<App />);
    expect(
      screen.getByRole("heading", { name: "Run Configuration" }),
    ).toBeVisible();
  });

  it("places Describe a Run after Comparison in the sidebar", () => {
    render(<App />);
    const labels = screen.getAllByRole("button").map((button) => button.textContent);
    expect(labels.indexOf("Describe a Run")).toBeGreaterThan(labels.indexOf("Comparison"));
  });

  it("moves an offline demo proposal into the existing editable form without running", async () => {
    const estimatorRun = vi.fn(window.estimator.run);
    window.estimator = { run: estimatorRun };
    render(<App />);

    await userEvent.click(screen.getByRole("button", { name: "Describe a Run" }));
    await userEvent.type(
      screen.getByRole("textbox", { name: "Run description" }),
      "Estimate Grover search",
    );
    await userEvent.click(screen.getByRole("button", { name: "Review request" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Send and create draft" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Run Configuration" }),
    ).toBeVisible();
    expect(screen.getByDisplayValue("Model-assisted Grover estimate")).toBeVisible();
    expect(screen.getByDisplayValue("50")).toBeVisible();
    expect(estimatorRun).not.toHaveBeenCalled();
  });

  it("the Results nav item shows the results surface, not the configuration form", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Results" }));

    // The results surface's idle empty state — proves the nav item is wired to a
    // real destination and no longer just re-renders the config form.
    expect(screen.getByText("No results yet")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Run estimate" }),
    ).not.toBeInTheDocument();
  });

  it("Rerun from history loads the reconstructed config into the form", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Run History" }));

    const rerunButtons = await screen.findAllByRole("button", { name: "Rerun" });
    await userEvent.click(rerunButtons[0]!);

    // We land back on the configuration form...
    expect(
      await screen.findByRole("heading", { name: "Run Configuration" }),
    ).toBeVisible();
    // ...and the run-name field is pre-filled (the blank default would be empty),
    // proving the reconstructed config reached the form instead of a JSON dialog.
    const nameInput = screen.getByRole("textbox", {
      name: /optional/i,
    }) as HTMLInputElement;
    expect(nameInput.value.length).toBeGreaterThan(0);
  });

  it("switches the sidebar to Results when a run completes", async () => {
    render(<App />);

    // The default config only needs gate + measurement times to become valid.
    await userEvent.type(
      screen.getByRole("textbox", { name: /single-qubit gate time/i }),
      "50",
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: /^measurement time/i }),
      "100",
    );
    await userEvent.click(screen.getByRole("button", { name: /run estimate/i }));

    // On completion the sidebar moves to Results and the result shows there.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Results" })).toHaveAttribute(
        "aria-current",
        "page",
      ),
    );
    expect(
      screen.getByRole("heading", { name: "Estimation Results" }),
    ).toBeVisible();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Export" })).toBeEnabled(),
    );
    expect(screen.getByRole("button", { name: "Rerun" })).toBeEnabled();
  });

  it("opening a run from Run History shows it on the Results page and moves the sidebar", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Run History" }));

    const viewButtons = await screen.findAllByRole("button", { name: "View" });
    await userEvent.click(viewButtons[0]!);

    expect(
      await screen.findByRole("heading", { name: "Estimation Results" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Results" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("exports and reruns the resolved record directly from Results", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Run History" }));

    const viewButtons = await screen.findAllByRole("button", { name: "View" });
    await userEvent.click(viewButtons[0]!);

    const exportButton = await screen.findByRole("button", { name: "Export" });
    await waitFor(() => expect(exportButton).toBeEnabled());
    await userEvent.click(exportButton);

    const exportDialog = screen.getByRole("dialog");
    expect(
      within(exportDialog).getByRole("heading", {
        name: "Export run as Markdown",
      }),
    ).toBeInTheDocument();
    await userEvent.click(
      within(exportDialog).getByRole("button", { name: "Close" }),
    );

    await userEvent.click(screen.getByRole("button", { name: "Rerun" }));
    expect(
      await screen.findByRole("heading", { name: "Run Configuration" }),
    ).toBeVisible();
    const nameInput = screen.getByRole("textbox", {
      name: /optional/i,
    }) as HTMLInputElement;
    expect(nameInput.value).toMatch(/rerun$/i);
  });

  it("keeps each run's selected frontier row across Results, History, and Comparison", async () => {
    const selectedRun = buildRunRecord({
      config: {
        id: "10000000-0000-4000-8000-000000000001",
        name: "Three-row session run",
      },
      result: {
        frontier: [
          buildFrontierRow({
            physicalQubits: { value: 111_111, unit: "qubits", display: "ignored" },
          }),
          buildFrontierRow({
            physicalQubits: { value: 222_222, unit: "qubits", display: "ignored" },
          }),
          buildFrontierRow({
            physicalQubits: { value: 333_333, unit: "qubits", display: "ignored" },
          }),
        ],
      },
    });
    const comparisonRun = buildRunRecord({
      config: {
        id: "10000000-0000-4000-8000-000000000002",
        name: "Default-row comparison run",
      },
    });
    window.store = new InMemoryRunStore([selectedRun, comparisonRun]);

    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Run History" }));

    const selectedRunCell = await screen.findByText(selectedRun.config.name);
    const selectedHistoryRow = selectedRunCell.closest("tr");
    if (!selectedHistoryRow) throw new Error("Expected selected run history row.");
    await userEvent.click(
      within(selectedHistoryRow).getByRole("button", { name: "View" }),
    );

    const thirdFrontierRow = await screen.findByRole("row", {
      name: /3 333,333/i,
    });
    await userEvent.click(thirdFrontierRow);

    await userEvent.click(screen.getByRole("button", { name: "Run History" }));
    const refreshedSelectedCell = await screen.findByText(selectedRun.config.name);
    const refreshedSelectedRow = refreshedSelectedCell.closest("tr");
    if (!refreshedSelectedRow) throw new Error("Expected refreshed history row.");
    expect(within(refreshedSelectedRow).getByText("333,333")).toBeInTheDocument();

    const defaultRunCell = screen.getByText(comparisonRun.config.name);
    const defaultHistoryRow = defaultRunCell.closest("tr");
    if (!defaultHistoryRow) throw new Error("Expected default comparison row.");
    await userEvent.click(within(refreshedSelectedRow).getByRole("checkbox"));
    await userEvent.click(within(defaultHistoryRow).getByRole("checkbox"));
    await userEvent.click(
      screen.getByRole("button", { name: /compare selected \(2\)/i }),
    );

    const comparisonTable = screen.getByRole("table");
    expect(within(comparisonTable).getByText("Row 3 of 3")).toBeInTheDocument();
    const qubitsRow = within(comparisonTable)
      .getByText("Physical Qubits")
      .closest("tr");
    if (!qubitsRow) throw new Error("Expected physical-qubits comparison row.");
    expect(within(qubitsRow).getByText("333,333")).toBeInTheDocument();
  });
});
