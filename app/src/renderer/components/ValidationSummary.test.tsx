// @vitest-environment jsdom
/**
 * The ValidationSummary lists every unresolved field as a button that scrolls to
 * and focuses that field. These tests pin the click → field wiring: the right
 * anchor id, the fallback across architecture-specific ids, and the flash class.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ValidationSummary } from "./ValidationSummary";
import type { FieldErrors } from "../state/validation";

afterEach(() => {
  cleanup();
  // `cleanup` unmounts React trees; the anchor fixtures below are appended to
  // the body by hand and would otherwise survive into the next test, where
  // `getElementById` would find the stale one instead of the fresh fixture.
  document.body.innerHTML = "";
});

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

/**
 * The real shape of a hyperparameter field: an input inside a `.hparam` group,
 * inside the collapsed `<details class="hparams">` that HyperparametersPanel
 * renders. Mounting a bare input on `document.body` — as the tests above do —
 * cannot reproduce this, which is why the jump shipped broken for every
 * hyperparameter issue.
 */
function mountCollapsedHyperparam(key: string): {
  input: HTMLInputElement;
  group: HTMLElement;
  details: HTMLDetailsElement;
} {
  const details = document.createElement("details");
  details.className = "hparams";
  const group = document.createElement("div");
  group.className = "hparam";
  const input = document.createElement("input");
  input.id = `hparam-${key}`;
  group.appendChild(input);
  details.appendChild(group);
  document.body.appendChild(details);
  return { input, group, details };
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

  /**
   * The reported bug. "Trotter Step" is a hyperparameter, and the panel holding
   * it is collapsed by default. A closed `<details>` keeps its children in the
   * document — so `getElementById` finds the input and the old code reported
   * success — but the element has no box to scroll to and cannot take focus,
   * so clicking the issue did nothing at all.
   */
  it("opens the collapsed panel a hyperparameter lives in", async () => {
    const user = userEvent.setup();
    const { input, details } = mountCollapsedHyperparam("trotter_step");
    const errors: FieldErrors = {
      hyperparams: [
        { key: "trotter_step", label: "Trotter Step", message: "Trotter Step must be at most Total Time." },
      ],
    };
    render(<ValidationSummary errors={errors} />);
    expect(details.open).toBe(false);

    await user.click(screen.getByRole("button", { name: /Trotter Step/ }));

    expect(details.open).toBe(true);
    await waitFor(() => expect(input).toHaveFocus());
  });

  it("opens every collapsed ancestor, not just the nearest", async () => {
    const user = userEvent.setup();
    const outer = document.createElement("details");
    const { details: inner } = mountCollapsedHyperparam("trotter_step");
    outer.appendChild(inner);
    document.body.appendChild(outer);
    const errors: FieldErrors = {
      hyperparams: [{ key: "trotter_step", label: "Trotter Step", message: "Too large." }],
    };
    render(<ValidationSummary errors={errors} />);

    await user.click(screen.getByRole("button", { name: /Trotter Step/ }));

    expect(inner.open).toBe(true);
    expect(outer.open).toBe(true);
  });

  it("flashes the whole hyperparameter group, not the bare input", async () => {
    const user = userEvent.setup();
    const { input, group } = mountCollapsedHyperparam("trotter_step");
    const errors: FieldErrors = {
      hyperparams: [{ key: "trotter_step", label: "Trotter Step", message: "Too large." }],
    };
    render(<ValidationSummary errors={errors} />);

    await user.click(screen.getByRole("button", { name: /Trotter Step/ }));

    // The label and the control together are what the eye needs to land on.
    expect(group).toHaveClass("field--flash");
    expect(input).not.toHaveClass("field--flash");
  });

  /**
   * Hyperparameter messages carry their own field name, because they are also
   * shown under the input where no prefix is present. The summary adds the
   * label too, which read as "Trotter Step: Trotter Step must be at most Total
   * Time." — the field named twice in eight words.
   */
  it("does not name the field twice when the message already opens with it", () => {
    const errors: FieldErrors = {
      hyperparams: [
        { key: "trotter_step", label: "Trotter Step", message: "Trotter Step must be at most Total Time." },
      ],
    };
    render(<ValidationSummary errors={errors} />);

    const button = screen.getByRole("button", { name: /Trotter Step/ });
    expect(button.textContent).toBe("Trotter Step must be at most Total Time.");
  });

  it("leaves a message that does not repeat the label alone", () => {
    render(<ValidationSummary errors={{ tCount: "Enter a whole number." }} />);

    const button = screen.getByRole("button", { name: /T count/ });
    expect(button.textContent).toBe("T count: Enter a whole number.");
  });

  it("marks each issue as interactive in the stylesheet, not only on hover", () => {
    // The affordance has to exist in the resting state: an entry that looks
    // like list text until the pointer lands on it is a feature nobody finds.
    const stylesheet = readFileSync(path.join(process.cwd(), "src/renderer/styles.css"), "utf8");
    const resting = /(^|[,}])\s*\.validation-box__field\s*\{([^}]*)\}/m.exec(stylesheet)?.[2] ?? "";
    expect(resting).toMatch(/text-decoration/);
  });

  it("does nothing when the field is not mounted (no throw)", async () => {
    const user = userEvent.setup();
    render(<ValidationSummary errors={{ tCount: "Required." }} />);

    await expect(
      user.click(screen.getByRole("button", { name: /T count/ })),
    ).resolves.not.toThrow();
  });
});
