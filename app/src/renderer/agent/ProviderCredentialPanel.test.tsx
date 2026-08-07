// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { AgentProviderStatus, CredentialConfigureResult } from "../../shared/agentTypes";
import { ProviderCredentialPanel } from "./ProviderCredentialPanel";

const UNCONFIGURED: AgentProviderStatus = {
  available: false,
  networkEnabled: false,
  providers: [
    { provider: "anthropic", displayName: "Anthropic", configured: false, models: ["claude-sonnet-5", "claude-opus-5"], defaultModel: "claude-sonnet-5" },
    { provider: "openai", displayName: "OpenAI", configured: false, models: ["gpt-5.6-terra"], defaultModel: "gpt-5.6-terra" },
  ],
  mode: "unavailable",
  message: "No model provider is configured.",
};

const CONFIGURED: AgentProviderStatus = {
  available: true, networkEnabled: true,
  mode: "provider",
  providers: [
    { provider: "anthropic", displayName: "Anthropic", configured: true, models: ["claude-sonnet-5", "claude-opus-5"], defaultModel: "claude-sonnet-5" },
    { provider: "openai", displayName: "OpenAI", configured: false, models: ["gpt-5.6-terra"], defaultModel: "gpt-5.6-terra" },
  ],
};

function setup(result: CredentialConfigureResult = { ok: true }, status = UNCONFIGURED) {
  const configureCredential = vi.fn(async () => result);
  const onConfigured = vi.fn();
  const onSelectionChange = vi.fn();
  render(<ProviderCredentialPanel service={{ configureCredential }} status={status} provider="anthropic" model="claude-sonnet-5" onSelectionChange={onSelectionChange} onConfigured={onConfigured} />);
  return { configureCredential, onConfigured, onSelectionChange };
}

describe("ProviderCredentialPanel", () => {
  it("starts open when no provider is configured, and labels both selects", () => {
    setup();
    expect(screen.getByText("Model provider").closest("details")).toHaveProperty("open", true);
    expect(screen.getByLabelText("Provider")).toBeInTheDocument();
    expect(screen.getByLabelText("Model")).toHaveValue("claude-sonnet-5");
  });

  it("hands the selected provider's key to main and clears the field", async () => {
    const user = userEvent.setup();
    const { configureCredential, onConfigured } = setup();
    const field = screen.getByLabelText("Anthropic API key");
    await user.type(field, "sk-ant-secret-value");
    await user.click(screen.getByRole("button", { name: /validate and save/i }));
    expect(configureCredential).toHaveBeenCalledWith("anthropic", "sk-ant-secret-value");
    expect(onConfigured).toHaveBeenCalledOnce();
    expect(field).toHaveValue("");
  });

  it("switching provider changes the model default and clears a half-typed key", async () => {
    const user = userEvent.setup();
    const { onSelectionChange } = setup();
    const field = screen.getByLabelText("Anthropic API key");
    await user.type(field, "sk-ant-half");
    await user.selectOptions(screen.getByLabelText("Provider"), "openai");
    expect(onSelectionChange).toHaveBeenCalledWith("openai", "gpt-5.6-terra");
    expect(field).toHaveValue("");
  });

  it("keeps configured details in the panel while the summary starts collapsed", () => {
    setup({ ok: true }, CONFIGURED);
    const details = screen.getByText("Model provider").closest("details");
    expect(details).toHaveProperty("open", false);
    expect(screen.getByText("Anthropic · claude-sonnet-5")).toBeInTheDocument();
  });

  it("starts open when the SELECTED provider needs a key, even if the other has one", () => {
    // `status.available` is true here (Anthropic is configured), so keying the
    // disclosure off it left the panel shut in exactly the case that needs it
    // open — the selected provider still has no key.
    render(
      <ProviderCredentialPanel
        service={{ configureCredential: vi.fn(async () => ({ ok: true as const })) }}
        status={CONFIGURED}
        provider="openai"
        model="gpt-5.6-terra"
        onSelectionChange={vi.fn()}
        onConfigured={vi.fn()}
      />,
    );
    expect(screen.getByText("Model provider").closest("details")).toHaveProperty("open", true);
  });

  it("masks the key while it is being typed", () => {
    setup();
    expect(screen.getByLabelText("Anthropic API key")).toHaveAttribute("type", "password");
  });

  it("clears the field even when the provider rejects the key", async () => {
    const user = userEvent.setup();
    const { onConfigured } = setup({
      ok: false,
      code: "AUTHENTICATION",
      message: "The provider rejected this key.",
    });
    const field = screen.getByLabelText("Anthropic API key");

    await user.type(field, "sk-ant-wrong");
    await user.click(screen.getByRole("button", { name: /validate and save/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("The provider rejected this key.");
    expect(onConfigured).not.toHaveBeenCalled();
    // A rejected key is still a secret — it must not linger on screen.
    expect(field).toHaveValue("");
  });

  it("surfaces a refused storage backend as an explained failure", async () => {
    const user = userEvent.setup();
    setup({
      ok: false,
      code: "BACKEND_UNAVAILABLE",
      message: "No OS secret store was found, so the app refuses to store a key.",
    });

    await user.type(screen.getByLabelText("Anthropic API key"), "sk-ant-value");
    await user.click(screen.getByRole("button", { name: /validate and save/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/refuses to store/i);
  });

  it("does not call the main process for an empty key", async () => {
    const user = userEvent.setup();
    const { configureCredential } = setup();

    await user.click(screen.getByRole("button", { name: /validate and save/i }));

    expect(configureCredential).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent(/enter a key/i);
  });
});
