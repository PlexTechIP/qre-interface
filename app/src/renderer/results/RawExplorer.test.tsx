// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RawExplorer } from "./RawExplorer";
import { FIXTURE_SCENARIOS } from "./fixtures";

const successScenario = FIXTURE_SCENARIOS.find((scenario) => scenario.id === "success");
const failedScenario = FIXTURE_SCENARIOS.find((scenario) => scenario.id === "failed");

afterEach(() => {
  cleanup();
});

describe("RawExplorer", () => {
  it("renders every nested key, value, and array entry from a raw success payload", () => {
    if (!successScenario?.result) {
      throw new Error("Success fixture scenario was not found.");
    }

    render(<RawExplorer raw={successScenario.result.raw} />);

    expect(screen.getByText("Full Engine Output")).toBeInTheDocument();
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Frontier")).toBeInTheDocument();
    expect(screen.getByText('"qdk-qre-estimation-table"')).toBeInTheDocument();
    expect(screen.getAllByText("[0]").length).toBeGreaterThan(0);
    expect(screen.getAllByText("stateType").length).toBeGreaterThan(0);
    expect(screen.getAllByText('"T"').length).toBeGreaterThan(0);
    expect(screen.getByText("829766")).toBeInTheDocument();
  });

  it("renders the engine's verbatim diagnostics for a failed run", () => {
    if (!failedScenario?.result) {
      throw new Error("Failed fixture scenario was not found.");
    }

    render(<RawExplorer raw={failedScenario.result.raw} />);

    expect(screen.getByText('"Qre.Estimation.NoFeasibleFrontierPoint"')).toBeInTheDocument();
  });

  it("explains that no raw output exists when the engine produced nothing (TIMEOUT / ENGINE_CRASH)", () => {
    render(<RawExplorer raw={null} />);

    expect(screen.getByText(/no raw output was produced/i)).toBeInTheDocument();
  });

  it("does not crash on an empty raw output object", () => {
    render(<RawExplorer raw={{}} />);

    expect(screen.getByText(/engine returned an empty output object/i)).toBeInTheDocument();
  });
});
