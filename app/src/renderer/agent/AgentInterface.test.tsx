// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { AgentDraftRequest, AgentProviderStatus, AgentService, GeneratedRunDraft } from "../../shared/agentTypes";
import { AgentInterface } from "./AgentInterface";

const status: AgentProviderStatus = {
  available: true, networkEnabled: true, mode: "provider",
  providers: [
    { provider: "anthropic", displayName: "Anthropic", configured: true, models: ["claude-sonnet-5", "claude-opus-5"], defaultModel: "claude-sonnet-5" },
    { provider: "openai", displayName: "OpenAI", configured: false, models: ["gpt-5.6-terra"], defaultModel: "gpt-5.6-terra" },
  ],
};
const draft = { name: "Assisted estimate", application: { type: "benchmark", benchmarkId: "grovers-search" }, architecture: { type: "gateBased", errorRate: 0.0001, gateTime: 50, measurementTime: 100, twoQubitGateTime: null }, magicStateFactories: ["round_based"], secondaryFactories: [], memoryOptimization: "none", parameters: { searchQubits: 24 }, traceTransform: { tStatesPerRotation: 20, ccxMagicStates: false, slowDownFactor: 1, dynamicMemoryCompute: null, unmemory: false }, maxError: 1 } satisfies GeneratedRunDraft;

describe("AgentInterface", () => {
  it("previews and sends the same selected provider/model request", async () => {
    const requestDraft = vi.fn(async (_request: AgentDraftRequest) => ({ ok: true as const, draft, provider: "Anthropic", model: "claude-sonnet-5" }));
    const previewRequest = vi.fn(async (request: AgentDraftRequest) => ({ model: request.model, messages: [{ role: "user", content: request.prompt }] }));
    const service: AgentService = { getStatus: async () => status, previewRequest, requestDraft, configureCredential: async () => ({ ok: true as const }) };
    render(<AgentInterface service={service} status={status} provider="anthropic" model="claude-sonnet-5" onSelectionChange={vi.fn()} onReviewDraft={vi.fn()} onCredentialConfigured={vi.fn()} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Run description" }), "Estimate a 24-qubit Grover search");
    await userEvent.click(screen.getByRole("button", { name: "Review request" }));
    const expected = { prompt: "Estimate a 24-qubit Grover search", generationSchema: "runconfig-generation-v1.4.0", provider: "anthropic" as const, model: "claude-sonnet-5" };
    expect(previewRequest).toHaveBeenCalledWith(expected);
    expect(within(screen.getByRole("heading", { name: "Exact outbound request" }).closest(".agent-review")!).getByText(/claude-sonnet-5/)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Send and create draft" }));
    expect(requestDraft).toHaveBeenCalledWith(expected);
  });

  /**
   * The regression that matters most on this surface: the review panel claims
   * to show exactly what will be sent. Changing the provider after reviewing
   * used to leave the OLD provider's body on screen while Send transmitted the
   * NEW one — the analyst approving payload A and payload B going out.
   */
  it("invalidates the review when the provider changes, so no unreviewed request is sent", async () => {
    const requestDraft = vi.fn(async () => ({ ok: true as const, draft, provider: "OpenAI", model: "gpt-5.6-terra" }));
    const previewRequest = vi.fn(async (request: AgentDraftRequest) => ({ model: request.model, provider: request.provider }));
    const service: AgentService = { getStatus: async () => status, previewRequest, requestDraft, configureCredential: async () => ({ ok: true as const }) };

    const props = { service, status, onSelectionChange: vi.fn(), onReviewDraft: vi.fn(), onCredentialConfigured: vi.fn() };
    const { rerender } = render(
      <AgentInterface {...props} provider="anthropic" model="claude-sonnet-5" />,
    );

    await userEvent.type(screen.getByRole("textbox", { name: "Run description" }), "Estimate Grover");
    await userEvent.click(screen.getByRole("button", { name: "Review request" }));
    expect(screen.getByRole("button", { name: "Send and create draft" })).toBeVisible();

    // The selection changes underneath the open review — exactly what the
    // provider dropdown in the panel above does.
    rerender(<AgentInterface {...props} provider="openai" model="gpt-5.6-terra" />);

    // The stale payload is gone and there is nothing left to send: the analyst
    // is returned to the review step for the provider now selected.
    expect(screen.queryByRole("button", { name: "Send and create draft" })).toBeNull();
    expect(screen.getByRole("button", { name: "Review request" })).toBeVisible();
    expect(requestDraft).not.toHaveBeenCalled();
  });

  it("invalidates the review when the model changes within one provider", async () => {
    const requestDraft = vi.fn(async () => ({ ok: true as const, draft, provider: "Anthropic", model: "claude-opus-5" }));
    const previewRequest = vi.fn(async (request: AgentDraftRequest) => ({ model: request.model }));
    const service: AgentService = { getStatus: async () => status, previewRequest, requestDraft, configureCredential: async () => ({ ok: true as const }) };

    const props = { service, status, onSelectionChange: vi.fn(), onReviewDraft: vi.fn(), onCredentialConfigured: vi.fn() };
    const { rerender } = render(
      <AgentInterface {...props} provider="anthropic" model="claude-sonnet-5" />,
    );

    await userEvent.type(screen.getByRole("textbox", { name: "Run description" }), "Estimate Grover");
    await userEvent.click(screen.getByRole("button", { name: "Review request" }));

    rerender(<AgentInterface {...props} provider="anthropic" model="claude-opus-5" />);

    expect(screen.queryByRole("button", { name: "Send and create draft" })).toBeNull();
    expect(requestDraft).not.toHaveBeenCalled();
  });

  it("disables Review when the selected provider has no key, even though another does", () => {
    const service: AgentService = { getStatus: async () => status, previewRequest: vi.fn(), requestDraft: vi.fn(), configureCredential: async () => ({ ok: true as const }) };
    render(<AgentInterface service={service} status={status} provider="openai" model="gpt-5.6-terra" onSelectionChange={vi.fn()} onReviewDraft={vi.fn()} onCredentialConfigured={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Review request" })).toBeDisabled();
  });
});
