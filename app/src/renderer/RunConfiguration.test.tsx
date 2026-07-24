/**
 * Component tests for the two behaviors the DoD singles out: Run-button
 * validation gating (with inline reasons) and the Litinski19 auto-disable /
 * Round-Based fallback rule. These drive the real component through user
 * interactions rather than poking state, so the wiring is covered too.
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { RunConfiguration } from "./RunConfiguration";

const runButton = () => screen.getByRole("button", { name: /run estimate/i });

// The Magic State Factory is a dropdown; Litinski19 availability is expressed by
// enabling/disabling its <option> and by the selected value falling back.
const factorySelect = () =>
  screen.getByRole("combobox", { name: /magic state factory/i });
const litinski19Option = () =>
  within(factorySelect()).getByRole("option", { name: /litinski19/i });

// Architecture is a segmented control whose buttons expose role="radio".
const superconductingRadio = () =>
  screen.getByRole("radio", { name: /^superconducting/i });
const majoranaRadio = () => screen.getByRole("radio", { name: /^majorana/i });

const gateTimeInput = () =>
  screen.getByRole("textbox", { name: /single-qubit gate time/i });
const measurementTimeInput = () =>
  screen.getByRole("textbox", { name: /^measurement time/i });
const errorRateInput = () =>
  screen.getByRole("textbox", { name: /^error rate$/i });

/** Fill the two required GateBased times — the only fields without defaults. */
async function fillRequiredTimes(user: ReturnType<typeof userEvent.setup>) {
  await user.type(gateTimeInput(), "50");
  await user.type(measurementTimeInput(), "100");
}

describe("Run-button validation gating", () => {
  it("starts disabled because gate/measurement times have no defaults", () => {
    render(<RunConfiguration />);
    expect(runButton()).toBeDisabled();
  });

  it("shows an inline reason for each missing required time", () => {
    render(<RunConfiguration />);
    // Each reason surfaces twice — at the field and in the validation summary.
    expect(
      screen.getAllByText(/gate time is required/i).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/measurement time is required/i).length,
    ).toBeGreaterThan(0);
  });

  it("enables Run once the required times are filled", async () => {
    const user = userEvent.setup();
    render(<RunConfiguration />);
    await fillRequiredTimes(user);
    expect(runButton()).toBeEnabled();
  });

  it("re-disables Run and explains why when a field goes out of range", async () => {
    const user = userEvent.setup();
    render(<RunConfiguration />);
    await fillRequiredTimes(user);
    expect(runButton()).toBeEnabled();

    const errorRate = errorRateInput();
    await user.clear(errorRate);
    await user.type(errorRate, "0.5"); // outside (0, 0.01)

    expect(runButton()).toBeDisabled();
    expect(
      screen.getAllByText(/error rate must be between 0 and 0\.01/i).length,
    ).toBeGreaterThan(0);
  });

  it("rejects non-numeric input with an inline message", async () => {
    const user = userEvent.setup();
    render(<RunConfiguration />);
    await user.type(gateTimeInput(), "abc");
    expect(screen.getByText(/enter a valid number/i)).toBeInTheDocument();
    expect(runButton()).toBeDisabled();
  });
});

describe("Litinski19 availability rule", () => {
  it("is selectable on GateBased with the default error rate (1e-4)", () => {
    render(<RunConfiguration />);
    expect(litinski19Option()).toBeEnabled();
  });

  it("auto-disables with a visible reason when switching to Majorana", async () => {
    const user = userEvent.setup();
    render(<RunConfiguration />);
    await user.click(majoranaRadio());

    expect(litinski19Option()).toBeDisabled();
    expect(
      screen.getByText(/needs superconducting hardware with error rate/i),
    ).toBeInTheDocument();
  });

  it("falls back to Round-Based when Litinski19 becomes disallowed", async () => {
    const user = userEvent.setup();
    render(<RunConfiguration />);

    // Select Litinski19 while it's allowed…
    await user.selectOptions(factorySelect(), "litinski19");
    expect(factorySelect()).toHaveValue("litinski19");

    // …then break the condition; selection must revert to Round-Based.
    await user.click(majoranaRadio());
    expect(factorySelect()).toHaveValue("round_based");
  });

  it("re-disables Litinski19 when the GateBased error rate is raised above 1e-3", async () => {
    const user = userEvent.setup();
    render(<RunConfiguration />);
    expect(litinski19Option()).toBeEnabled();

    const errorRate = errorRateInput();
    await user.clear(errorRate);
    await user.type(errorRate, "0.005"); // > 1e-3, still within (0, 0.01)

    expect(litinski19Option()).toBeDisabled();
  });

  it("re-enables Litinski19 after switching back to Superconducting", async () => {
    const user = userEvent.setup();
    render(<RunConfiguration />);
    await user.click(majoranaRadio());
    expect(litinski19Option()).toBeDisabled();
    await user.click(superconductingRadio());
    expect(litinski19Option()).toBeEnabled();
  });
});

describe("Run flow", () => {
  it("shows the running state, then delivers the success result at the seam", async () => {
    const user = userEvent.setup();
    render(<RunConfiguration />);
    await fillRequiredTimes(user);
    await user.click(runButton());

    // Running state is visible immediately (before the mock's ~2s resolves).
    expect(screen.getByText(/running your estimate/i)).toBeInTheDocument();

    // On resolve, the success result renders in Team 2's Results surface and Edit
    // is offered. Match the frontier pill ("N Pareto-optimal solutions"), which
    // only appears on a successful result.
    expect(
      await screen.findByText(/pareto-optimal solutions/i, {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /edit configuration/i }),
    ).toBeEnabled();
  });
});

describe("Failure path (Retry / Edit configuration)", () => {
  const simulateFailureRadio = () =>
    screen.getByRole("radio", { name: /simulate failure/i });

  it("delivers a failed result at the seam with a way forward, and Retry re-runs", async () => {
    const user = userEvent.setup();
    render(<RunConfiguration />);

    // Point the dev engine at the committed failure fixture, then run a valid config.
    await user.click(simulateFailureRadio());
    await fillRequiredTimes(user);
    await user.click(runButton());

    // Running state first, then the failed result renders through Team 2's Results
    // surface (the "Run failed" chrome + the fixture's error code).
    expect(screen.getByText(/running your estimate/i)).toBeInTheDocument();
    expect(
      await screen.findByText(/estimation_failed/i, {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(screen.getByText(/run failed/i)).toBeInTheDocument();

    // The failure is never a dead end: both recovery affordances are offered.
    const retry = screen.getByRole("button", { name: /^retry$/i });
    expect(retry).toBeEnabled();
    expect(
      screen.getByRole("button", { name: /edit configuration/i }),
    ).toBeEnabled();

    // Retry re-runs the same config: back to the running state (engine mode is
    // still "failed", so it resolves to the failure again — the point is it re-ran).
    await user.click(retry);
    expect(screen.getByText(/running your estimate/i)).toBeInTheDocument();
    expect(
      await screen.findByText(/estimation_failed/i, {}, { timeout: 3000 }),
    ).toBeInTheDocument();
  });

  it("Edit configuration returns to the form from the failed state", async () => {
    const user = userEvent.setup();
    render(<RunConfiguration />);

    await user.click(simulateFailureRadio());
    await fillRequiredTimes(user);
    await user.click(runButton());
    await screen.findByText(/estimation_failed/i, {}, { timeout: 3000 });

    await user.click(screen.getByRole("button", { name: /edit configuration/i }));

    // Back on the form: the Run button (absent in the flow panel) is present again.
    expect(runButton()).toBeInTheDocument();
  });
});

describe("Configuration summary reflects the draft", () => {
  it("shows the derived QEC code, and updates it when architecture changes", async () => {
    const user = userEvent.setup();
    render(<RunConfiguration />);

    const summary = screen
      .getByRole("heading", { name: /configuration summary/i })
      .closest("section")!;

    // Scope to the QEC cell in the summary grid.
    const qecValue = () =>
      within(summary)
        .getByText("QEC Code")
        .closest(".summary-grid__cell") as HTMLElement;
    expect(within(qecValue()).getByText("Surface Code")).toBeInTheDocument();

    await user.click(majoranaRadio());
    expect(within(qecValue()).getByText("Three-Aux")).toBeInTheDocument();
  });
});
