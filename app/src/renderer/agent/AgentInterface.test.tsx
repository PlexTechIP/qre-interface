// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type {
  AgentDraftRequest,
  AgentProviderStatus,
  AgentService,
  GeneratedRunDraft,
} from "../../shared/agentTypes";
import { AgentInterface } from "./AgentInterface";

const status: AgentProviderStatus = {
  available: true,
  networkEnabled: true,
  provider: "Example Provider",
  model: "example-model",
  mode: "provider",
};

const draft: GeneratedRunDraft = {
  name: "Assisted estimate",
  application: { type: "benchmark", benchmarkId: "grovers-search" },
  architecture: {
    type: "gateBased",
    errorRate: 0.0001,
    gateTime: 50,
    measurementTime: 100,
    twoQubitGateTime: null,
  },
  magicStateFactories: ["round_based"],
  secondaryFactories: [],
  memoryOptimization: "none",
  parameters: { searchQubits: 24 },
  traceTransform: {
    tStatesPerRotation: 20,
    ccxMagicStates: false,
    slowDownFactor: 1,
    dynamicMemoryCompute: null,
    unmemory: false,
  },
  maxError: 1,
};

describe("AgentInterface", () => {
  it("shows the exact request and waits for a second explicit action before sending", async () => {
    const requestDraft = vi.fn(async (_request: AgentDraftRequest) => ({
      ok: true as const,
      draft,
      provider: status.provider,
      model: status.model,
    }));
    // The preview is whatever the main process says it will send — the UI
    // renders it verbatim rather than reconstructing the payload itself.
    const previewRequest = vi.fn(async (request: AgentDraftRequest) => ({
      model: "claude-opus-5",
      messages: [{ role: "user", content: request.prompt }],
      generationSchema: request.generationSchema,
    }));
    const service: AgentService = {
      getStatus: async () => status,
      previewRequest,
      requestDraft,
      configureCredential: async () => ({ ok: true as const }),
    };
    const onReviewDraft = vi.fn();
    render(
      <AgentInterface
        service={service}
        status={status}
        onReviewDraft={onReviewDraft}
        onCredentialConfigured={vi.fn()}
      />,
    );

    await userEvent.type(
      screen.getByRole("textbox", { name: "Run description" }),
      "Estimate a 24-qubit Grover search",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Review request" }),
    );

    expect(requestDraft).not.toHaveBeenCalled();
    // Reviewing reads the real body back; it does not send anything.
    expect(previewRequest).toHaveBeenCalledWith({
      prompt: "Estimate a 24-qubit Grover search",
      generationSchema: "runconfig-generation-v1.4.0",
    });

    const review = screen
      .getByRole("heading", { name: "Exact outbound request" })
      .closest<HTMLElement>(".agent-review");
    if (review === null)
      throw new Error("Expected outbound request review panel.");
    expect(
      within(review).getByText(/Estimate a 24-qubit Grover search/),
    ).toBeVisible();
    expect(
      within(review).getByText(/runconfig-generation-v1.4.0/),
    ).toBeVisible();
    // What's on screen is the payload the sender produced, so the panel's
    // claim survives a change to how the request is built.
    expect(within(review).getByText(/claude-opus-5/)).toBeVisible();

    await userEvent.click(
      screen.getByRole("button", { name: "Send and create draft" }),
    );

    expect(requestDraft).toHaveBeenCalledWith({
      prompt: "Estimate a 24-qubit Grover search",
      generationSchema: "runconfig-generation-v1.4.0",
    });
    expect(onReviewDraft).toHaveBeenCalledOnce();
  });
});
