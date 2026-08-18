// @vitest-environment jsdom
/**
 * The panel that makes the review step honest: it names the fields the model
 * chose, so the analyst approving a fully-populated form can tell a decision
 * from a default.
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { ProposedField } from "../agent/draftToFormState";
import { ModelProposalSummary } from "./ModelProposalSummary";

const proposed: ProposedField[] = [
  { anchors: ["architecture-label"], label: "Architecture", value: "Superconducting" },
  { anchors: ["gb-gate-time"], label: "Gate time", value: "50" },
];

describe("ModelProposalSummary", () => {
  it("names the model that authored the draft", () => {
    render(
      <ModelProposalSummary proposed={proposed} model="Anthropic/claude-sonnet-5" />,
    );

    expect(screen.getByText(/Anthropic\/claude-sonnet-5/)).toBeVisible();
  });

  it("lists every field the model chose, with the value it chose", () => {
    render(<ModelProposalSummary proposed={proposed} model="provider/model" />);

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByText("Architecture")).toBeVisible();
    expect(within(items[0]!).getByText("Superconducting")).toBeVisible();
    expect(within(items[1]!).getByText("Gate time")).toBeVisible();
    expect(within(items[1]!).getByText("50")).toBeVisible();
  });

  /**
   * The sentence the whole panel exists for. A proposal arrives as ~40 filled
   * fields; without this the analyst cannot tell which ones the model picked.
   */
  it("says plainly that everything unlisted is a form default", () => {
    render(<ModelProposalSummary proposed={proposed} model="provider/model" />);

    expect(screen.getByText(/2 fields/)).toBeVisible();
    expect(screen.getByText(/default/i)).toBeVisible();
  });

  /**
   * The label and the value sit at opposite ends of a flex row with no text
   * node between them, so the browser-computed name ran them together —
   * "Gate time50". Each entry names itself instead.
   */
  it("announces each entry as a readable label-and-value pair", () => {
    render(<ModelProposalSummary proposed={proposed} model="provider/model" />);

    expect(
      screen.getByRole("button", { name: "Gate time: 50. Jump to this field." }),
    ).toBeVisible();
  });

  it("jumps to a field's control, and each entry is reachable by keyboard", async () => {
    const user = userEvent.setup();
    render(
      <>
        <ModelProposalSummary proposed={proposed} model="provider/model" />
        <div className="field">
          <input id="gb-gate-time" aria-label="Single-qubit gate time" />
        </div>
      </>,
    );

    await user.tab();
    await user.tab();
    expect(screen.getByRole("button", { name: /Gate time/ })).toHaveFocus();

    await user.keyboard("{Enter}");
    // jumpToField flashes the enclosing field group, then focuses the control.
    expect(document.querySelector(".field--flash")).not.toBeNull();
  });

  it("renders nothing when the model chose nothing", () => {
    const { container } = render(
      <ModelProposalSummary proposed={[]} model="provider/model" />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
