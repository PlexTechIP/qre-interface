/**
 * Component tests for the two behaviors the DoD singles out: Run-button
 * validation gating (with inline reasons) and the Litinski19 auto-disable /
 * Round-Based fallback rule. These drive the real component through user
 * interactions rather than poking state, so the wiring is covered too.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { buildFailedResult, buildSuccessResult, fakeEstimator } from "../shared/testing";
import type { RunConfig } from "../shared/types";
import { RunConfiguration } from "./RunConfiguration";
import { createInitialFormState, type FormState } from "./state/formState";

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
    // Queried as buttons, because that is what each summary entry is: the
    // reason and the jump to the field it names are one control. The field
    // name inside it is its own element, so a text query would miss the row.
    expect(screen.getByRole("button", { name: /gate time is required/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /measurement time is required/i }),
    ).toBeInTheDocument();
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
      screen.getByRole("button", { name: /error rate must be between 0 and 0\.01/i }),
    ).toBeInTheDocument();
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

  it("lets the set be emptied, blocking Run with a message until one is re-selected", async () => {
    const user = userEvent.setup();
    render(<RunConfiguration />);
    await fillRequiredTimes(user); // clear the unrelated required-time errors

    // Round-Based alone is now removable — unchecking it empties the set.
    expect(roundBasedCheckbox()).toBeChecked();
    expect(roundBasedCheckbox()).toBeEnabled();
    expect(runButton()).toBeEnabled();

    await user.click(roundBasedCheckbox());
    expect(roundBasedCheckbox()).not.toBeChecked();
    expect(
      screen.getAllByText(
        /at least one of round-based, litinski19 or gsj24 must stay selected/i,
      ).length,
    ).toBeGreaterThan(0);
    expect(runButton()).toBeDisabled();

    // Re-selecting any primary clears the error and re-enables Run.
    await user.click(litinski19Checkbox());
    expect(litinski19Checkbox()).toBeChecked();
    expect(runButton()).toBeEnabled();
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

describe("Model-assisted provenance", () => {
  /** A structurally complete draft — the two required GateBased times are set. */
  function filledDraft(): FormState {
    const base = createInitialFormState();
    return {
      ...base,
      architecture: {
        ...base.architecture,
        gateBased: {
          errorRate: 0.0001,
          gateTime: 50,
          measurementTime: 100,
          twoQubitGateTime: null,
        },
      },
    };
  }

  const MODEL_PROVENANCE = {
    authoredBy: "model_assisted",
    model: "provider/model",
  } as const;

  /**
   * The shell drops its draft handoff the moment the FIRST run completes, but
   * this component stays mounted through the run panel and "Edit configuration"
   * returns to the very same form state. Reading the `provenance` PROP at
   * Run-click therefore stamped run #1 `model_assisted` and run #2 — the same
   * model-authored configuration with one number changed — with nothing at all,
   * silently losing the audit trail on the most common iterate-then-rerun path.
   *
   * The rerender below is the shell's clearing step, reproduced exactly.
   */
  it("survives Edit configuration after the shell has dropped its draft handoff", async () => {
    const user = userEvent.setup();
    const completed: RunConfig[] = [];
    const onRunComplete = (config: RunConfig): void => {
      completed.push(config);
    };

    const { rerender } = render(
      <RunConfiguration
        onRunComplete={onRunComplete}
        initialDraft={filledDraft()}
        provenance={MODEL_PROVENANCE}
      />,
    );

    await user.click(runButton());
    // The Edit button is rendered (disabled) while the run is still going, so
    // the completion callback is the signal to wait on, not the button.
    await waitFor(() => expect(completed).toHaveLength(1), { timeout: 3000 });
    expect(completed[0]?.provenance).toEqual(MODEL_PROVENANCE);

    // App.handleRunComplete clears draftHandoff, so both props go away while
    // this component is still mounted showing the result.
    rerender(<RunConfiguration onRunComplete={onRunComplete} />);

    await user.click(screen.getByRole("button", { name: /edit configuration/i }));
    await user.click(runButton());
    await waitFor(() => expect(completed).toHaveLength(2), { timeout: 3000 });

    expect(completed[1]?.provenance).toEqual(MODEL_PROVENANCE);
  });

  const PROPOSED = [
    { anchors: ["architecture-label"], label: "Architecture", value: "Superconducting" },
    { anchors: ["gb-gate-time"], label: "Gate time", value: "50" },
  ];

  it("shows what the model chose alongside the form it filled in", () => {
    render(
      <RunConfiguration
        initialDraft={filledDraft()}
        provenance={MODEL_PROVENANCE}
        proposed={PROPOSED}
      />,
    );

    const panel = screen
      .getByRole("heading", { name: /drafted by provider\/model/i })
      .closest("section");
    if (!panel) throw new Error("Expected the model-proposal panel.");
    expect(within(panel).getByText("Gate time")).toBeVisible();
    expect(within(panel).getByText("Superconducting")).toBeVisible();
  });

  /**
   * A Rerun replaces the model's draft with a saved configuration, so the list
   * of what a model chose no longer describes what is on screen. It goes away
   * for the same reason `draftProvenance` does.
   */
  it("drops the proposal panel when a saved config is loaded over the draft", async () => {
    const user = userEvent.setup();
    const completed: RunConfig[] = [];
    const onRunComplete = (config: RunConfig): void => {
      completed.push(config);
    };

    const { rerender } = render(
      <RunConfiguration
        onRunComplete={onRunComplete}
        initialDraft={filledDraft()}
        provenance={MODEL_PROVENANCE}
        proposed={PROPOSED}
      />,
    );
    expect(screen.getByRole("heading", { name: /drafted by/i })).toBeVisible();

    await user.click(runButton());
    await waitFor(() => expect(completed).toHaveLength(1), { timeout: 3000 });
    const firstConfig = completed[0];
    if (!firstConfig) throw new Error("expected a completed run");

    rerender(
      <RunConfiguration onRunComplete={onRunComplete} initialConfig={firstConfig} />,
    );
    await user.click(screen.getByRole("button", { name: /edit configuration/i }));

    expect(screen.queryByRole("heading", { name: /drafted by/i })).toBeNull();
  });

  /**
   * The Run gate is the only thing between a draft and the engine, so it has to
   * inspect the WHOLE object that will execute. Provenance used to be attached
   * after serialization — `useRunFlow` mutating the config `toRunConfig` had
   * just returned — which put it outside the gate entirely: the button enabled
   * on one object and the engine received another.
   */
  it("gates a model-assisted draft on its provenance too", () => {
    render(
      <RunConfiguration
        initialDraft={filledDraft()}
        // `provenance.model` is minLength: 1 in runconfig.schema.json, so this
        // config cannot legally run. Nothing on the Run path used to notice.
        provenance={{ authoredBy: "model_assisted", model: "" }}
      />,
    );

    expect(runButton()).toBeDisabled();
  });

  it("still enables Run for a model-assisted draft whose provenance validates", () => {
    render(
      <RunConfiguration initialDraft={filledDraft()} provenance={MODEL_PROVENANCE} />,
    );

    expect(runButton()).toBeEnabled();
  });

  it("does not attribute a hand-authored configuration to a model", async () => {
    const user = userEvent.setup();
    const completed: RunConfig[] = [];
    render(<RunConfiguration onRunComplete={(config) => completed.push(config)} />);

    await fillRequiredTimes(user);
    await user.click(runButton());
    await waitFor(() => expect(completed).toHaveLength(1), { timeout: 3000 });

    expect(completed[0]).not.toHaveProperty("provenance");
  });

  /** A Rerun replaces the draft, so the model no longer authored what is shown. */
  it("drops model provenance when a saved config is loaded over the draft", async () => {
    const user = userEvent.setup();
    const completed: RunConfig[] = [];
    const onRunComplete = (config: RunConfig): void => {
      completed.push(config);
    };

    const { rerender } = render(
      <RunConfiguration
        onRunComplete={onRunComplete}
        initialDraft={filledDraft()}
        provenance={MODEL_PROVENANCE}
      />,
    );

    await user.click(runButton());
    await waitFor(() => expect(completed).toHaveLength(1), { timeout: 3000 });
    const firstConfig = completed[0];
    if (!firstConfig) throw new Error("expected a completed run");

    // A Rerun hands down a saved config and no draft.
    rerender(
      <RunConfiguration onRunComplete={onRunComplete} initialConfig={firstConfig} />,
    );
    await user.click(screen.getByRole("button", { name: /edit configuration/i }));
    await user.click(runButton());
    await waitFor(() => expect(completed).toHaveLength(2), { timeout: 3000 });

    expect(completed[1]).not.toHaveProperty("provenance");
  });
});

describe("Configuration summary reflects the draft", () => {
  it("shows the derived QEC code, and updates it when architecture changes", async () => {
    const user = userEvent.setup();
    render(<RunConfiguration />);

    const summary = screen
      .getByRole("heading", { name: /configuration summary/i })
      .closest("section")!;

    // Scope to the QEC cell in the summary grid (each label/value pair is its
    // own <div> inside the .config-grid).
    const qecValue = () =>
      within(summary).getByText("QEC Code").closest("div") as HTMLElement;
    expect(within(qecValue()).getByText("Surface Code")).toBeInTheDocument();

    await user.click(majoranaRadio());
    expect(within(qecValue()).getByText("Three-Aux")).toBeInTheDocument();
  });
});
