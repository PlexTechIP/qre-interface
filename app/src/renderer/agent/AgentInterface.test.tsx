// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import type { AgentDraftRequest, AgentDraftResult, AgentProviderStatus, AgentService, GeneratedRunDraft } from "../../shared/agentTypes";
import { AgentInterface } from "./AgentInterface";

const status: AgentProviderStatus = {
  available: true, networkEnabled: true, mode: "provider",
  providers: [
    { provider: "anthropic", displayName: "Anthropic", configured: true, models: ["claude-sonnet-5", "claude-opus-5"], defaultModel: "claude-sonnet-5" },
    { provider: "openai", displayName: "OpenAI", configured: false, models: ["gpt-5.6-terra"], defaultModel: "gpt-5.6-terra" },
  ],
};
const draft = { name: "Assisted estimate", application: { type: "benchmark", benchmarkId: "grovers-search" }, architecture: { type: "gateBased", errorRate: 0.0001, gateTime: 50, measurementTime: 100, twoQubitGateTime: null }, magicStateFactories: ["round_based"], secondaryFactories: [], memoryOptimization: "none", parameters: { searchQubits: 24 }, traceTransform: { tStatesPerRotation: 20, ccxMagicStates: false }, maxError: 1 } satisfies GeneratedRunDraft;

/** Every method, so a service double cannot quietly omit the new ones. */
function makeService(overrides: Partial<AgentService> = {}): AgentService {
  return {
    getStatus: async () => status,
    previewRequest: vi.fn(async (request: AgentDraftRequest) => ({ model: request.model, provider: request.provider, messages: [{ role: "user", content: request.prompt }] })),
    requestDraft: vi.fn(async (): Promise<AgentDraftResult> => ({ ok: true, draft, provider: "Anthropic", model: "claude-sonnet-5" })),
    cancelDraft: vi.fn(async () => {}),
    configureCredential: async () => ({ ok: true as const }),
    clearCredential: async () => ({ ok: true as const }),
    ...overrides,
  };
}

/**
 * The prompt is the SHELL's state now (see `AgentInterfaceProps.prompt`), so the
 * tests hold it the way `App` does. Typing into an uncontrolled textarea would
 * pass while proving nothing about the lifted wiring.
 */
function Harness(props: Omit<React.ComponentProps<typeof AgentInterface>, "prompt" | "onPromptChange"> & { initialPrompt?: string }) {
  const { initialPrompt = "", ...rest } = props;
  const [prompt, setPrompt] = useState(initialPrompt);
  return <AgentInterface {...rest} prompt={prompt} onPromptChange={setPrompt} />;
}

describe("AgentInterface", () => {
  it("previews and sends the same selected provider/model request", async () => {
    const service = makeService();
    render(<Harness service={service} status={status} provider="anthropic" model="claude-sonnet-5" onSelectionChange={vi.fn()} onReviewDraft={vi.fn()} onCredentialChange={vi.fn()} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Run description" }), "Estimate a 24-qubit Grover search");
    await userEvent.click(screen.getByRole("button", { name: "Review request" }));
    const expected = { prompt: "Estimate a 24-qubit Grover search", generationSchema: "runconfig-generation-v1.4.0", provider: "anthropic" as const, model: "claude-sonnet-5" };
    expect(service.previewRequest).toHaveBeenCalledWith(expected);
    expect(within(screen.getByRole("heading", { name: "Exact outbound request" }).closest(".agent-review")!).getByText(/claude-sonnet-5/)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Send and create draft" }));
    expect(service.requestDraft).toHaveBeenCalledWith(expected);
  });

  /**
   * The regression that matters most on this surface: the review panel claims
   * to show exactly what will be sent. Changing the provider after reviewing
   * used to leave the OLD provider's body on screen while Send transmitted the
   * NEW one — the analyst approving payload A and payload B going out.
   */
  it("invalidates the review when the provider changes, so no unreviewed request is sent", async () => {
    const service = makeService();
    const props = { service, status, onSelectionChange: vi.fn(), onReviewDraft: vi.fn(), onCredentialChange: vi.fn() };
    const { rerender } = render(<Harness {...props} provider="anthropic" model="claude-sonnet-5" />);

    await userEvent.type(screen.getByRole("textbox", { name: "Run description" }), "Estimate Grover");
    await userEvent.click(screen.getByRole("button", { name: "Review request" }));
    expect(screen.getByRole("button", { name: "Send and create draft" })).toBeVisible();

    // The selection changes underneath the open review — exactly what the
    // provider dropdown in the panel above does.
    rerender(<Harness {...props} provider="openai" model="gpt-5.6-terra" />);

    // The stale payload is gone and there is nothing left to send: the analyst
    // is returned to the review step for the provider now selected.
    expect(screen.queryByRole("button", { name: "Send and create draft" })).toBeNull();
    expect(screen.getByRole("button", { name: "Review request" })).toBeVisible();
    expect(service.requestDraft).not.toHaveBeenCalled();
  });

  it("invalidates the review when the model changes within one provider", async () => {
    const service = makeService();
    const props = { service, status, onSelectionChange: vi.fn(), onReviewDraft: vi.fn(), onCredentialChange: vi.fn() };
    const { rerender } = render(<Harness {...props} provider="anthropic" model="claude-sonnet-5" />);

    await userEvent.type(screen.getByRole("textbox", { name: "Run description" }), "Estimate Grover");
    await userEvent.click(screen.getByRole("button", { name: "Review request" }));

    rerender(<Harness {...props} provider="anthropic" model="claude-opus-5" />);

    expect(screen.queryByRole("button", { name: "Send and create draft" })).toBeNull();
    expect(service.requestDraft).not.toHaveBeenCalled();
  });

  /**
   * A disabled control with no stated reason is a dead end, and this is the
   * case that produced one: `status.available` is true (Anthropic holds a key),
   * so the only sentence explaining the disabled button was suppressed while the
   * SELECTED provider had nothing to send to.
   */
  it("says why Review is disabled when the selected provider has no key, even though another does", () => {
    render(<Harness service={makeService()} status={status} provider="openai" model="gpt-5.6-terra" onSelectionChange={vi.fn()} onReviewDraft={vi.fn()} onCredentialChange={vi.fn()} initialPrompt="Estimate Grover" />);

    expect(screen.getByRole("button", { name: "Review request" })).toBeDisabled();
    expect(screen.getByText(/No key is configured for OpenAI/)).toBeVisible();
  });

  it("does not repeat itself when NO provider is configured — the status message already says it", () => {
    const unavailable: AgentProviderStatus = {
      available: false, networkEnabled: false, mode: "unavailable",
      message: "No model provider is configured. The rest of the app remains available offline.",
      providers: status.providers.map((provider) => ({ ...provider, configured: false })),
    };
    render(<Harness service={makeService()} status={unavailable} provider="anthropic" model="claude-sonnet-5" onSelectionChange={vi.fn()} onReviewDraft={vi.fn()} onCredentialChange={vi.fn()} />);

    expect(screen.getByText(/No model provider is configured/)).toBeVisible();
    expect(screen.queryByText(/No key is configured for/)).toBeNull();
  });

  it("keeps the prompt the shell owns, so navigating away cannot destroy it", async () => {
    const props = { service: makeService(), status, provider: "anthropic" as const, model: "claude-sonnet-5", onSelectionChange: vi.fn(), onReviewDraft: vi.fn(), onCredentialChange: vi.fn() };
    // What App does: the panel is unmounted and later remounted, while the
    // prompt lives above it. The old local-state version came back empty.
    const { unmount } = render(<AgentInterface {...props} prompt="A carefully written description" onPromptChange={vi.fn()} />);
    expect(screen.getByRole("textbox", { name: "Run description" })).toHaveValue("A carefully written description");
    unmount();

    render(<AgentInterface {...props} prompt="A carefully written description" onPromptChange={vi.fn()} />);
    expect(screen.getByRole("textbox", { name: "Run description" })).toHaveValue("A carefully written description");
  });

  it("offers Cancel while a draft is in flight and reports the cancellation as a notice, not an error", async () => {
    let settle: (result: AgentDraftResult) => void = () => {};
    const service = makeService({
      requestDraft: vi.fn(() => new Promise<AgentDraftResult>((resolve) => { settle = resolve; })),
    });
    render(<Harness service={service} status={status} provider="anthropic" model="claude-sonnet-5" onSelectionChange={vi.fn()} onReviewDraft={vi.fn()} onCredentialChange={vi.fn()} initialPrompt="Estimate Grover" />);

    await userEvent.click(screen.getByRole("button", { name: "Review request" }));
    await userEvent.click(screen.getByRole("button", { name: "Send and create draft" }));

    // Edit description is gone while sending; the control the analyst actually
    // wants at that moment is present and enabled, not greyed out beside it.
    const cancel = screen.getByRole("button", { name: "Cancel" });
    expect(cancel).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Edit description" })).toBeNull();

    await userEvent.click(cancel);
    expect(service.cancelDraft).toHaveBeenCalledOnce();

    settle({ ok: false, code: "CANCELLED", message: "Request cancelled. Nothing was applied to the form." });
    // A cancellation is the analyst getting what they asked for — it must not
    // land in the same red panel as a revoked key.
    const note = await screen.findByRole("status");
    expect(note).toHaveTextContent("Request cancelled.");
    expect(note).toHaveClass("agent-note");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("still reports a real failure as an error", async () => {
    const service = makeService({
      requestDraft: vi.fn(async (): Promise<AgentDraftResult> => ({ ok: false, code: "AUTHENTICATION", message: "The provider rejected the stored key." })),
    });
    render(<Harness service={service} status={status} provider="anthropic" model="claude-sonnet-5" onSelectionChange={vi.fn()} onReviewDraft={vi.fn()} onCredentialChange={vi.fn()} initialPrompt="Estimate Grover" />);

    await userEvent.click(screen.getByRole("button", { name: "Review request" }));
    await userEvent.click(screen.getByRole("button", { name: "Send and create draft" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("The provider rejected the stored key.");
  });
});
