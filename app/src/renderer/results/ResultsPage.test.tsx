// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildRunRecord } from "../../shared/testing";
import type { RunRecord } from "../../shared/types";
import { ResultsPage } from "./ResultsPage";

afterEach(cleanup);

function latestRun(record: RunRecord) {
  return { config: record.config, result: record.result };
}

describe("Results page saved-run actions", () => {
  it("resolves the saved record and reuses the complete Markdown export dialog", async () => {
    const record = buildRunRecord();
    const get = vi.fn().mockResolvedValue(record);

    render(
      <ResultsPage
        latestRun={latestRun(record)}
        onRunEstimation={() => {}}
        store={{ get }}
        onRerunRequest={() => {}}
      />,
    );

    const exportButton = screen.getByRole("button", { name: "Export" });
    await waitFor(() => expect(exportButton).toBeEnabled());
    expect(get).toHaveBeenCalledWith(record.id);

    await userEvent.click(exportButton);

    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: "Export run as Markdown" }),
    ).toBeInTheDocument();
    const preview = within(dialog).getByLabelText("Export preview");
    expect(preview).toHaveTextContent(record.config.name);
    expect(preview).toHaveTextContent("Pareto frontier");
    expect(preview).not.toHaveTextContent("placeholder");
  });

  it("reuses the shared reconstruction path and shell rerun handoff", async () => {
    const record = buildRunRecord();
    const onRerunRequest = vi.fn();

    render(
      <ResultsPage
        latestRun={latestRun(record)}
        onRunEstimation={() => {}}
        store={{ get: vi.fn().mockResolvedValue(record) }}
        onRerunRequest={onRerunRequest}
      />,
    );

    const rerunButton = screen.getByRole("button", { name: "Rerun" });
    await waitFor(() => expect(rerunButton).toBeEnabled());
    await userEvent.click(rerunButton);

    expect(onRerunRequest).toHaveBeenCalledTimes(1);
    const request = onRerunRequest.mock.calls[0]?.[0];
    expect(request.sourceRecord.id).toBe(record.id);
    // Rerun appends an incrementing "(n)" suffix to the source name.
    expect(request.config.name).toBe(`${record.config.name}(1)`);
    expect(request.config.id).not.toBe(record.config.id);
    expect(request.config.createdAt).not.toBe(record.config.createdAt);
  });

  it("keeps actions disabled and explains when the saved record is unavailable", async () => {
    const record = buildRunRecord();
    const get = vi.fn().mockResolvedValue(null);

    render(
      <ResultsPage
        latestRun={latestRun(record)}
        onRunEstimation={() => {}}
        store={{ get }}
        onRerunRequest={() => {}}
      />,
    );

    expect(
      await screen.findByText(/has not appeared in saved history yet/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Rerun" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Retry lookup" }));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  });
});
