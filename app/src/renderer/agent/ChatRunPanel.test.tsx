import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { buildRunConfig } from "../../shared/testing";
import { ChatRunPanel } from "./ChatRunPanel";

describe("ChatRunPanel", () => {
  it("lets the analyst cancel a proposal run in flight", async () => {
    const onCancel = vi.fn();
    render(
      <ChatRunPanel
        runState={{ phase: "running", config: buildRunConfig() }}
        onDismiss={vi.fn()}
        onCancel={onCancel}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Cancel run" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
