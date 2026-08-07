import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { AgentProviderStatus, CredentialConfigureResult } from "../../shared/agentTypes";
import { ProviderCredentialPanel } from "./ProviderCredentialPanel";

const UNCONFIGURED: AgentProviderStatus = {
  available: false,
  networkEnabled: false,
  provider: null,
  model: null,
  mode: "unavailable",
  message: "No model provider is configured.",
};

const CONFIGURED: AgentProviderStatus = {
  available: true,
  networkEnabled: true,
  provider: "Anthropic",
  model: "claude-opus-5",
  mode: "provider",
};

function setup(
  result: CredentialConfigureResult = { ok: true },
  status: AgentProviderStatus = UNCONFIGURED,
) {
  const configureCredential = vi.fn(async () => result);
  const onConfigured = vi.fn();
  render(
    <ProviderCredentialPanel
      service={{ configureCredential }}
      status={status}
      onConfigured={onConfigured}
    />,
  );
  return { configureCredential, onConfigured };
}

describe("ProviderCredentialPanel", () => {
  it("hands the key to the main process and clears the field", async () => {
    const user = userEvent.setup();
    const { configureCredential, onConfigured } = setup();

    const field = screen.getByLabelText("API key");
    await user.type(field, "sk-ant-secret-value");
    await user.click(screen.getByRole("button", { name: /validate and save/i }));

    expect(configureCredential).toHaveBeenCalledWith("sk-ant-secret-value");
    expect(onConfigured).toHaveBeenCalledTimes(1);
    // The field is the only place the key ever lived; leaving it populated
    // would put a secret on screen for the rest of the session.
    expect((field as HTMLInputElement).value).toBe("");
    expect(await screen.findByRole("status")).toHaveTextContent(/stored/i);
  });

  it("masks the key while it is being typed", () => {
    setup();
    expect(screen.getByLabelText("API key")).toHaveAttribute("type", "password");
  });

  it("clears the field even when the provider rejects the key", async () => {
    const user = userEvent.setup();
    const { onConfigured } = setup({
      ok: false,
      code: "AUTHENTICATION",
      message: "The provider rejected this key.",
    });

    await user.type(screen.getByLabelText("API key"), "sk-ant-wrong");
    await user.click(screen.getByRole("button", { name: /validate and save/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("The provider rejected this key.");
    expect(onConfigured).not.toHaveBeenCalled();
    // A rejected key is still a secret — it must not linger on screen.
    expect((screen.getByLabelText("API key") as HTMLInputElement).value).toBe("");
  });

  it("surfaces a refused storage backend as an explained failure", async () => {
    const user = userEvent.setup();
    setup({
      ok: false,
      code: "BACKEND_UNAVAILABLE",
      message: "No OS secret store was found, so the app refuses to store a key.",
    });

    await user.type(screen.getByLabelText("API key"), "sk-ant-value");
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

  it("reports an already-configured provider without naming the key", () => {
    setup({ ok: true }, CONFIGURED);

    expect(screen.getByText("Configured")).toBeInTheDocument();
    expect(screen.getByText(/Anthropic\/claude-opus-5/)).toBeInTheDocument();
  });
});
