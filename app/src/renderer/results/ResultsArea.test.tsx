// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { ResultsArea } from "./ResultsArea";
import {
  RESULT_SCENARIOS as FIXTURE_SCENARIOS,
  buildRunConfig,
  buildRunResult,
} from "../../shared/testing";

const successScenario = FIXTURE_SCENARIOS.find((scenario) => scenario.id === "success");
const sparseScenario = FIXTURE_SCENARIOS.find((scenario) => scenario.id === "sparse");
const largeScenario = FIXTURE_SCENARIOS.find((scenario) => scenario.id === "large");
const failedScenario = FIXTURE_SCENARIOS.find((scenario) => scenario.id === "failed");

afterEach(() => {
  cleanup();
});

describe("ResultsArea lifecycle states", () => {
  it("shows progress—not the empty state—while a null result is still running", () => {
    render(<ResultsArea phase="running" result={null} />);

    expect(
      screen.getByRole("heading", { name: "Running estimation" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/complex benchmarks can take up to a minute/i),
    ).toBeInTheDocument();
    expect(screen.queryByText("No results yet")).not.toBeInTheDocument();
  });
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
    expect(
      screen.getByText("Total Fault Tolerant Execution Error"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/history and comparison use your selected pareto point/i),
    ).toBeInTheDocument();
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

    expect(screen.getByText("1 Pareto-optimal solution")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /select row 1: 880 µs runtime, 126,400 physical qubits/i }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("row", { name: /1 126,400 880 µs 1.2e-4 none 9 1 µs/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getAllByText("Phys. Factory Qubits").length).toBeGreaterThan(0);
    expect(screen.getAllByText("0").length).toBeGreaterThan(0);
  });
});

describe("ResultsArea field filtering", () => {
  it("hides and re-shows an additional field across both the table and the selected-row detail", async () => {
    if (!successScenario) {
      throw new Error("Success fixture scenario was not found.");
    }

    render(
      <ResultsArea phase={successScenario.phase} result={successScenario.result} config={successScenario.config} />,
    );

    // Row 1 reports "source" as an additional field, and nothing is hidden by default,
    // so it starts visible in both the table header and the selected-row detail.
    expect(screen.getByRole("columnheader", { name: /source/i })).toBeInTheDocument();
    expect(screen.getByText("Row 1 full reported field set.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /filter fields/i }));
    await userEvent.click(screen.getByRole("checkbox", { name: /source/i }));

    expect(screen.queryByRole("columnheader", { name: /source/i })).not.toBeInTheDocument();
    expect(
      screen.getByText(/row 1: \d+ of \d+ additional fields shown \(adjust with the column filter\)\./i),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("checkbox", { name: /source/i }));

    expect(screen.getByRole("columnheader", { name: /source/i })).toBeInTheDocument();
    expect(screen.getByText("Row 1 full reported field set.")).toBeInTheDocument();
  });

  it("'Defaults only' hides every additional field and 'Show all' restores them", async () => {
    if (!successScenario) {
      throw new Error("Success fixture scenario was not found.");
    }

    render(
      <ResultsArea phase={successScenario.phase} result={successScenario.result} config={successScenario.config} />,
    );

    await userEvent.click(screen.getByRole("button", { name: /filter fields/i }));
    await userEvent.click(screen.getByRole("button", { name: /defaults only/i }));

    expect(screen.getByRole("button", { name: /filter fields \(0\/6 extra shown\)/i })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: /source/i })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /show all/i }));

    expect(screen.getByRole("columnheader", { name: /source/i })).toBeInTheDocument();
  });

  it("persists filter selections in memory across switching to a different result", async () => {
    if (!successScenario || !sparseScenario) {
      throw new Error("Fixture scenarios were not found.");
    }

    const { rerender } = render(
      <ResultsArea phase={successScenario.phase} result={successScenario.result} config={successScenario.config} />,
    );

    await userEvent.click(screen.getByRole("button", { name: /filter fields/i }));
    await userEvent.click(screen.getByRole("button", { name: /defaults only/i }));

    rerender(
      <ResultsArea phase={sparseScenario.phase} result={sparseScenario.result} config={sparseScenario.config} />,
    );

    // "Phys. Factory Qubits" is an additional field the sparse fixture also reports; the
    // "defaults only" choice made while viewing a different result should still apply, so it
    // should no longer appear as a table column (the filter's own checkbox list still lists
    // it, unchecked, which is why this checks the table specifically rather than the whole page).
    expect(screen.queryByRole("columnheader", { name: /phys\. factory qubits/i })).not.toBeInTheDocument();
  });
});

describe("ResultsArea across every committed fixture", () => {
  it("renders every fixture scenario without throwing", () => {
    for (const scenario of FIXTURE_SCENARIOS) {
      const { unmount } = render(
        <ResultsArea phase={scenario.phase} result={scenario.result} config={scenario.config} />,
      );
      unmount();
    }
  });

  it("renders formatting-stress magnitudes legibly with no NaN or undefined leaking through", () => {
    if (!largeScenario) {
      throw new Error("Large fixture scenario was not found.");
    }

    render(<ResultsArea phase={largeScenario.phase} result={largeScenario.result} config={largeScenario.config} />);

    expect(screen.getAllByText(/^\d+(\.\d+)? yr$/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^\d(\.\d+)?e-19$/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("55,797,618").length).toBeGreaterThan(0);
    expect(screen.queryByText(/nan/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/undefined/i)).not.toBeInTheDocument();
  });

  it("renders the failed state usefully whether or not raw diagnostics are present", () => {
    if (!failedScenario?.result) {
      throw new Error("Failed fixture scenario was not found.");
    }

    render(<ResultsArea phase={failedScenario.phase} result={failedScenario.result} config={failedScenario.config} />);

    expect(screen.getByText(failedScenario.result.error?.code ?? "")).toBeInTheDocument();
    expect(screen.getByText("Full Engine Output")).toBeInTheDocument();

    const { unmount } = render(
      <ResultsArea
        phase={failedScenario.phase}
        result={{ ...failedScenario.result, raw: null }}
        config={failedScenario.config}
      />,
    );

    expect(screen.getAllByText(/no raw output was produced/i).length).toBeGreaterThan(0);
    unmount();
  });
});

describe("week-2 carry-over: forward compatibility", () => {
  it("renders an error.code the canonical list doesn't know about, instead of hiding or crashing on it", () => {
    if (!failedScenario?.result) {
      throw new Error("Failed fixture scenario was not found.");
    }

    render(
      <ResultsArea
        phase={failedScenario.phase}
        result={{
          ...failedScenario.result,
          error: { ...failedScenario.result.error!, code: "FUTURE_ENGINE_TIMEOUT" },
        }}
        config={failedScenario.config}
      />,
    );

    expect(screen.getByText("FUTURE_ENGINE_TIMEOUT")).toBeInTheDocument();
    expect(screen.queryByText(/undefined/i)).not.toBeInTheDocument();
  });

  it("renders a result field the 37-field appendix doesn't know about, instead of dropping it", () => {
    if (!successScenario?.result) {
      throw new Error("Success fixture scenario was not found.");
    }

    const resultWithUnknownField = structuredClone(successScenario.result);
    const firstRow = resultWithUnknownField.frontier?.[0];
    if (!firstRow) {
      throw new Error("Success fixture scenario has no frontier rows.");
    }
    firstRow.additional = {
      ...firstRow.additional,
      futureQreMetric: { value: 42, unit: "count", display: "42" },
    };

    render(
      <ResultsArea phase={successScenario.phase} result={resultWithUnknownField} config={successScenario.config} />,
    );

    expect(screen.getByRole("columnheader", { name: /future qre metric/i })).toBeInTheDocument();
    expect(screen.getAllByText("42").length).toBeGreaterThan(0);
  });
});

describe("week-2 carry-over: reverse selection sync (graph point -> table row)", () => {
  it("selecting a graph point selects its matching table row", async () => {
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

    const secondGraphPoint = screen.getByRole("button", {
      name: /select row 2: 14\.3 ms runtime, 1,048,200 physical qubits/i,
    });
    await userEvent.click(secondGraphPoint);

    expect(secondGraphPoint).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("row", { name: /2 1,048,200 14.3 ms 6.1e-4 288 x T 17 4.8 µs/i }),
    ).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Row 2 full reported field set.")).toBeInTheDocument();
  });
});

describe("ResultsArea empty-frontier state", () => {
  it("shows an explicit message for a succeeded run that reported no frontier points", () => {
    const noRows = buildRunResult({ frontier: [] });

    render(<ResultsArea phase="done" result={noRows} config={buildRunConfig()} />);

    expect(
      screen.getByText(/succeeded but produced no pareto-frontier points/i),
    ).toBeInTheDocument();
    // No empty frontier table or metric grid is rendered in this state.
    expect(
      screen.queryByRole("table", { name: /pareto frontier/i }),
    ).not.toBeInTheDocument();
  });
});
