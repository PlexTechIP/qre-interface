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

describe("Results page — where the way back to the agent lives", () => {
  const failedRecord = (): RunRecord => {
    const record = buildRunRecord();
    return {
      ...record,
      result: {
        ...record.result,
        status: "failed",
        frontier: null,
        error: { code: "ESTIMATION_FAILED", message: "The estimator rejected the configuration." },
      },
    };
  };

  /**
   * On a failure the error card is what the analyst is reading. The control
   * that explains the error has to be in it, and it must not also sit in the
   * toolbar — two buttons with one name is worse than the wrong one place.
   */
  it("puts it in the error card and nowhere else when the run failed", async () => {
    const record = failedRecord();
    render(
      <ResultsPage
        latestRun={latestRun(record)}
        onRunEstimation={() => {}}
        store={{ get: vi.fn().mockResolvedValue(record) }}
        onRerunRequest={() => {}}
        onAskAgent={() => {}}
      />,
    );

    const all = await screen.findAllByRole("button", { name: /ask the agent/i });
    expect(all).toHaveLength(1);
    expect(within(screen.getByRole("alert")).getByRole("button", { name: /ask the agent/i }))
      .toBeInTheDocument();
    expect(
      within(screen.getByLabelText("Run actions")).queryByRole("button", { name: /ask the agent/i }),
    ).toBeNull();
  });

  /** A run that worked has no error card, so the toolbar keeps that variant. */
  it("keeps it in the toolbar when the run succeeded", async () => {
    const record = buildRunRecord();
    render(
      <ResultsPage
        latestRun={latestRun(record)}
        onRunEstimation={() => {}}
        store={{ get: vi.fn().mockResolvedValue(record) }}
        onRerunRequest={() => {}}
        onAskAgent={() => {}}
      />,
    );

    const actions = screen.getByLabelText("Run actions");
    expect(
      within(actions).getByRole("button", { name: /ask the agent about this run/i }),
    ).toBeInTheDocument();
  });
});

describe("Results page saved-run actions", () => {
  it("resolves the saved record and reuses the run export dialog", async () => {
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
      within(dialog).getByRole("heading", { name: "Export run" }),
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
