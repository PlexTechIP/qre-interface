// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { RunHistoryContainer } from "./RunHistoryContainer";
import { buildRunRecord } from "../../shared/testing";
import { InMemoryRunStore } from "../../shared/runStore";

afterEach(cleanup);

const AI_RUN = buildRunRecord({
  config: {
    id: "run-ai",
    name: "AI authored run",
    provenance: { authoredBy: "model_assisted", model: "claude" },
  },
});
const HUMAN_RUN = buildRunRecord({
  config: { id: "run-human", name: "Human authored run" },
});

function renderHistory() {
  return render(
    <RunHistoryContainer
      store={new InMemoryRunStore([AI_RUN, HUMAN_RUN])}
      view="history"
      onViewChange={() => {}}
    />,
  );
}

describe("Run History — Authored by filter", () => {
  it("shows only model-authored runs when AI-generated is selected", async () => {
    renderHistory();
    await screen.findByText("AI authored run");
    expect(screen.getByText("Human authored run")).toBeInTheDocument();

    await userEvent.selectOptions(
      screen.getByLabelText("Authored by"),
      "AI-generated",
    );

    await waitFor(() =>
      expect(screen.queryByText("Human authored run")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("AI authored run")).toBeInTheDocument();
  });
});
