// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { ResultsArea } from "./ResultsArea";
import { FIXTURE_SCENARIOS } from "./fixtures";

const successScenario = FIXTURE_SCENARIOS.find((scenario) => scenario.id === "success");
const sparseScenario = FIXTURE_SCENARIOS.find((scenario) => scenario.id === "sparse");

afterEach(() => {
  cleanup();
});

describe("ResultsArea frontier display", () => {
  it("renders a selectable frontier table from fixture rows", async () => {
    if (!successScenario) {
      throw new Error("Success fixture scenario was not found.");
    }

    render(
      <ResultsArea
        phase={successScenario.phase}
        result={successScenario.result}
        config={successScenario.config}
      />,
    );

    expect(screen.getByRole("table", { name: /pareto frontier estimates/i })).toBeInTheDocument();
    expect(screen.getByText("Quantum Dynamics - GateBased 1e-4 - Surface - PSSPC")).toBeInTheDocument();
    expect(screen.getByText("Configuration Summary")).toBeInTheDocument();
    expect(screen.getByText("Selected row represents this run in History & Comparison.")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /pareto frontier scatter plot/i })).toBeInTheDocument();
    expect(screen.getByText("Row 1 full reported field set.")).toBeInTheDocument();

    const secondRow = screen.getByRole("row", { name: /2 1,048,200 14.3 ms 6.1e-4 288 x T 17 4.8 µs/i });
    await userEvent.click(secondRow);

    expect(secondRow).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Row 2 full reported field set.")).toBeInTheDocument();

    const thirdGraphPoint = screen.getByRole("button", {
      name: /select row 3: 31.8 ms runtime, 652,440 physical qubits/i,
    });
    await userEvent.click(thirdGraphPoint);

    expect(thirdGraphPoint).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("row", { name: /3 652,440 31.8 ms 3.1e-4 144 x T 21 6.8 µs/i }),
    ).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Row 3 full reported field set.")).toBeInTheDocument();

    await userEvent.hover(thirdGraphPoint);
    expect(screen.getByText("Row 3 details")).toBeInTheDocument();
    const tooltip = screen.getByRole("status");
    expect(within(tooltip).getByText("31.8 ms")).toBeInTheDocument();
    expect(within(tooltip).getByText("3.1e-4")).toBeInTheDocument();

    await userEvent.unhover(thirdGraphPoint);
    expect(screen.queryByText("Row 3 details")).not.toBeInTheDocument();

    fireEvent.focus(thirdGraphPoint);
    expect(screen.getByText("Row 3 details")).toBeInTheDocument();
  });

  it("renders sparse one-row frontiers without dropping zero values", () => {
    if (!sparseScenario) {
      throw new Error("Sparse fixture scenario was not found.");
    }

    render(
      <ResultsArea
        phase={sparseScenario.phase}
        result={sparseScenario.result}
        config={sparseScenario.config}
      />,
    );

    expect(screen.getByText("1 Pareto-optimal solutions")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /select row 1: 880 µs runtime, 126,400 physical qubits/i }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("row", { name: /1 126,400 880 µs 1.2e-4 none 9 1 µs/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("Phys. Factory Qubits")).toBeInTheDocument();
    expect(screen.getAllByText("0").length).toBeGreaterThan(0);
  });
});
