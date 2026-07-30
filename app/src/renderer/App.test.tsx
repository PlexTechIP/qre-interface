import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { InMemoryRunStore } from "../shared/runStore";
import {
  SAMPLE_RUN_RECORDS,
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
});
