import { render, screen } from "@testing-library/react";
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
});
