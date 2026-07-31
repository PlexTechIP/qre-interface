/**
 * Component tests for the two behaviors the DoD singles out: Run-button
 * validation gating (with inline reasons) and the Litinski19 auto-disable /
 * Round-Based fallback rule. These drive the real component through user
 * interactions rather than poking state, so the wiring is covered too.
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { buildFailedResult, buildSuccessResult, fakeEstimator } from "../shared/testing";
import { RunConfiguration } from "./RunConfiguration";

const runButton = () => screen.getByRole("button", { name: /run estimate/i });

// Magic State Factory is a multi-select (contract v1.2.0): one checkbox per
// factory. Availability is expressed by disabling a checkbox, and by a
// now-disallowed factory being dropped from the set.
const factoryGroup = () =>
  screen.getByRole("group", { name: /magic state factory/i });
const factoryCheckbox = (name: RegExp) =>
  within(factoryGroup()).getByRole("checkbox", { name });
const litinski19Checkbox = () => factoryCheckbox(/litinski19/i);
const roundBasedCheckbox = () => factoryCheckbox(/round-based/i);
const gsj24Checkbox = () => factoryCheckbox(/^gsj24$/i);

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

// Post-swap the run flow drives the real engine over `window.estimator`. Give
// every test a success estimator by default; the failure-path tests override it.
// The small delay keeps the "running" phase observable before it resolves.
beforeEach(() => {
  window.estimator = fakeEstimator(buildSuccessResult(), { delayMs: 50 });
});

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

describe("Magic State Factory availability and multi-select", () => {
  it("is selectable on GateBased with the default error rate (1e-4)", () => {
    render(<RunConfiguration />);
    expect(litinski19Checkbox()).toBeEnabled();
  });

  it("defaults to exactly Round-Based", () => {
    render(<RunConfiguration />);
    expect(roundBasedCheckbox()).toBeChecked();
    expect(litinski19Checkbox()).not.toBeChecked();
    expect(gsj24Checkbox()).not.toBeChecked();
  });

  it("auto-disables with a visible reason when switching to Majorana", async () => {
    const user = userEvent.setup();
    render(<RunConfiguration />);
    await user.click(majoranaRadio());

    expect(litinski19Checkbox()).toBeDisabled();
    expect(gsj24Checkbox()).toBeDisabled();
    expect(screen.getByText(/majorana supports round-based only/i)).toBeInTheDocument();
  });

  it("holds several factories at once — the point of the multi-select", async () => {
    const user = userEvent.setup();
    render(<RunConfiguration />);

    await user.click(litinski19Checkbox());
    await user.click(gsj24Checkbox());

    expect(roundBasedCheckbox()).toBeChecked();
    expect(litinski19Checkbox()).toBeChecked();
    expect(gsj24Checkbox()).toBeChecked();
  });

  it("refuses to empty the set — the last checked factory cannot be unchecked", async () => {
    const user = userEvent.setup();
    render(<RunConfiguration />);

    // Round-Based alone: unchecking it would leave the set empty, which the
    // contract forbids, so the control is disabled rather than silently repaired.
    expect(roundBasedCheckbox()).toBeChecked();
    expect(roundBasedCheckbox()).toBeDisabled();

    // Check a second one and Round-Based becomes removable again.
    await user.click(litinski19Checkbox());
    expect(roundBasedCheckbox()).toBeEnabled();
    await user.click(roundBasedCheckbox());
    expect(roundBasedCheckbox()).not.toBeChecked();
    expect(litinski19Checkbox()).toBeChecked();
  });

  it("drops a now-disallowed factory from the set instead of leaving it selected", async () => {
    const user = userEvent.setup();
    render(<RunConfiguration />);

    await user.click(litinski19Checkbox());
    expect(litinski19Checkbox()).toBeChecked();

    // Majorana admits round_based alone.
    await user.click(majoranaRadio());
    expect(litinski19Checkbox()).not.toBeChecked();
    expect(roundBasedCheckbox()).toBeChecked();
  });

  it("re-disables Litinski19 when the GateBased error rate is raised above 1e-3", async () => {
    const user = userEvent.setup();
    render(<RunConfiguration />);
    expect(litinski19Checkbox()).toBeEnabled();

    const errorRate = errorRateInput();
    await user.clear(errorRate);
    await user.type(errorRate, "0.005"); // > 1e-3, still within (0, 0.01)

    expect(litinski19Checkbox()).toBeDisabled();
  });

  it("re-enables Litinski19 after switching back to Superconducting", async () => {
    const user = userEvent.setup();
    render(<RunConfiguration />);
    await user.click(majoranaRadio());
    expect(litinski19Checkbox()).toBeDisabled();
    await user.click(superconductingRadio());
    expect(litinski19Checkbox()).toBeEnabled();
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
  it("delivers a failed result at the seam with a way forward, and Retry re-runs", async () => {
    const user = userEvent.setup();
    // Post-swap the app runs the real engine, which reports failures itself —
    // there is no "simulate failure" dev toggle anymore. Drive a failure by
    // injecting the failed-mode mock behind the same EstimatorService the swap consumes.
    window.estimator = fakeEstimator(buildFailedResult(), { delayMs: 50 });
    render(<RunConfiguration />);

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

    // Retry re-runs the same config: back to the running state (the injected
    // engine still fails, so it resolves to the failure again — the point is it re-ran).
    await user.click(retry);
    expect(screen.getByText(/running your estimate/i)).toBeInTheDocument();
    expect(
      await screen.findByText(/estimation_failed/i, {}, { timeout: 3000 }),
    ).toBeInTheDocument();
  });

  it("Edit configuration returns to the form from the failed state", async () => {
    const user = userEvent.setup();
    window.estimator = fakeEstimator(buildFailedResult(), { delayMs: 50 });
    render(<RunConfiguration />);

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
