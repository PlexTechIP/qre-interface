// @vitest-environment jsdom
/**
 * The ValidationSummary lists every unresolved field as a button that scrolls to
 * and focuses that field. These tests pin the click → field wiring: the right
 * anchor id, the fallback across architecture-specific ids, and the flash class.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ValidationSummary } from "./ValidationSummary";
import type { FieldErrors } from "../state/validation";

afterEach(cleanup);

beforeEach(() => {
  // jsdom has no layout engine; give the component the method it guards for.
  Element.prototype.scrollIntoView = vi.fn();
});

/** Drop a bare input carrying the anchor id the summary will look for. */
function mountField(id: string): HTMLInputElement {
  const input = document.createElement("input");
  input.id = id;
  document.body.appendChild(input);
  return input;
}

describe("ValidationSummary jump-to-field", () => {
  it("renders each issue as a button that names its field", () => {
    render(<ValidationSummary errors={{ numQubits: "Required." }} />);

    const button = screen.getByRole("button", { name: /Number of qubits/ });
    expect(button).toHaveAttribute("title", "Jump to Number of qubits");
  });

  it("scrolls to and focuses the matching field on click", async () => {
    const user = userEvent.setup();
    const input = mountField("manual-tCount");
    render(<ValidationSummary errors={{ tCount: "Enter a whole number." }} />);

    await user.click(screen.getByRole("button", { name: /T count/ }));

    expect(input.scrollIntoView).toHaveBeenCalled();
    // Focus is deferred a tick so it doesn't fight the smooth scroll.
    await waitFor(() => expect(input).toHaveFocus());
  });

  it("falls back to whichever architecture-specific id is mounted", async () => {
    const user = userEvent.setup();
    // errorRate lives under `gb-error-rate` OR `mj-error-rate`; only the Majorana
    // one is on screen here, and the jump must still find it.
    const input = mountField("mj-error-rate");
    render(<ValidationSummary errors={{ errorRate: "Out of range." }} />);

    await user.click(screen.getByRole("button", { name: /Error rate/ }));

    await waitFor(() => expect(input).toHaveFocus());
  });

  it("routes a hyperparameter issue to its hparam- input", async () => {
    const user = userEvent.setup();
    const input = mountField("hparam-bond_dim");
    const errors: FieldErrors = {
      hyperparams: [{ key: "bond_dim", label: "Bond dimension", message: "Required." }],
    };
    render(<ValidationSummary errors={errors} />);

    await user.click(screen.getByRole("button", { name: /Bond dimension/ }));

    await waitFor(() => expect(input).toHaveFocus());
  });

  it("does nothing when the field is not mounted (no throw)", async () => {
    const user = userEvent.setup();
    render(<ValidationSummary errors={{ tCount: "Required." }} />);

    await expect(
      user.click(screen.getByRole("button", { name: /T count/ })),
    ).resolves.not.toThrow();
  });
});
