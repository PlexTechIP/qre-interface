// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type {
  CredentialClearResult,
  CredentialConfigureResult,
} from "../../shared/agentTypes";
import { ProviderKeyCard } from "./ProviderKeyCard";

function setup(
  options: {
    configured?: boolean;
    configureResult?: CredentialConfigureResult;
    clearResult?: CredentialClearResult;
  } = {},
) {
  const configureCredential = vi.fn(
    async () => options.configureResult ?? ({ ok: true } as CredentialConfigureResult),
  );
  const clearCredential = vi.fn(
    async () => options.clearResult ?? ({ ok: true } as CredentialClearResult),
  );
  const onConfigured = vi.fn();
  const onCleared = vi.fn();

  render(
    <ProviderKeyCard
      provider="anthropic"
      displayName="Anthropic"
      configured={options.configured ?? false}
      service={{ configureCredential, clearCredential }}
      onConfigured={onConfigured}
      onCleared={onCleared}
    />,
  );

  return { configureCredential, clearCredential, onConfigured, onCleared };
}

describe("ProviderKeyCard", () => {
  it("names the provider and reports that no key is stored", () => {
    setup();
    const card = screen.getByRole("region", { name: "Anthropic" });
    expect(within(card).getByText("Not configured")).toBeVisible();
  });

  it("reports a stored key without revealing anything about it", () => {
    setup({ configured: true });
    const card = screen.getByRole("region", { name: "Anthropic" });
    expect(within(card).getByText("Configured")).toBeVisible();
    // The key itself is unreadable by construction — there is no getter on the
    // agent surface — so the card must never imply it can show one.
    expect(within(card).getByLabelText("Anthropic API key")).toHaveValue("");
  });

  it("masks the key while it is being typed", () => {
    setup();
    expect(screen.getByLabelText("Anthropic API key")).toHaveAttribute("type", "password");
  });

  it("hands the key to main, clears the field, and tells the shell", async () => {
    const user = userEvent.setup();
    const { configureCredential, onConfigured } = setup();
    const field = screen.getByLabelText("Anthropic API key");

    await user.type(field, "sk-ant-secret-value");
    await user.click(screen.getByRole("button", { name: /validate and save/i }));

    expect(configureCredential).toHaveBeenCalledWith("anthropic", "sk-ant-secret-value");
    expect(onConfigured).toHaveBeenCalledWith("anthropic");
    expect(field).toHaveValue("");
  });

  it("clears the field even when the provider rejects the key", async () => {
    const user = userEvent.setup();
    const { onConfigured } = setup({
      configureResult: {
        ok: false,
        code: "AUTHENTICATION",
        message: "The provider rejected this key.",
      },
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
      configureResult: {
        ok: false,
        code: "BACKEND_UNAVAILABLE",
        message: "No OS secret store was found, so the app refuses to store a key.",
      },
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

  describe("removing a stored key", () => {
    it("offers no removal control when there is nothing stored", () => {
      setup();
      expect(screen.queryByRole("button", { name: /remove/i })).toBeNull();
    });

    it("asks once before deleting, and does not call main on the first press", async () => {
      const user = userEvent.setup();
      const { clearCredential } = setup({ configured: true });

      await user.click(screen.getByRole("button", { name: "Remove key" }));

      expect(clearCredential).not.toHaveBeenCalled();
      expect(screen.getByText(/deletes the encrypted key from this machine/i)).toBeVisible();
      expect(screen.getByRole("button", { name: "Remove Anthropic key" })).toBeVisible();
    });

    it("backs out cleanly", async () => {
      const user = userEvent.setup();
      const { clearCredential } = setup({ configured: true });

      await user.click(screen.getByRole("button", { name: "Remove key" }));
      await user.click(screen.getByRole("button", { name: "Keep it" }));

      expect(clearCredential).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Remove key" })).toBeVisible();
    });

    it("deletes this provider's key and asks the shell to re-read status", async () => {
      const user = userEvent.setup();
      const { clearCredential, onCleared } = setup({ configured: true });

      await user.click(screen.getByRole("button", { name: "Remove key" }));
      await user.click(screen.getByRole("button", { name: "Remove Anthropic key" }));

      expect(clearCredential).toHaveBeenCalledWith("anthropic");
      // Without this the header badge keeps claiming "Network on" against a key
      // that is no longer there.
      expect(onCleared).toHaveBeenCalledWith("anthropic");
      expect(await screen.findByRole("status")).toHaveTextContent(/Key removed from this machine/);
    });

    it("surfaces a refused deletion instead of claiming the key is gone", async () => {
      const user = userEvent.setup();
      const { onCleared } = setup({
        configured: true,
        clearResult: {
          ok: false,
          code: "CLEAR_FAILED",
          message: "The stored key could not be deleted (EPERM). It is still on this machine.",
        },
      });

      await user.click(screen.getByRole("button", { name: "Remove key" }));
      await user.click(screen.getByRole("button", { name: "Remove Anthropic key" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(/still on this machine/);
      expect(screen.queryByText(/Key removed from this machine/)).toBeNull();
      expect(onCleared).not.toHaveBeenCalled();
    });
  });

  /**
   * Settings renders one card per provider, so nothing in a card may be armed
   * or reported globally — the old single panel could only ever be showing one
   * provider, and its state had nowhere else to leak to.
   */
  it("keeps each card's removal confirmation to itself", async () => {
    const user = userEvent.setup();
    const service = {
      configureCredential: vi.fn(async () => ({ ok: true as const })),
      clearCredential: vi.fn(async () => ({ ok: true as const })),
    };
    render(
      <>
        <ProviderKeyCard
          provider="anthropic"
          displayName="Anthropic"
          configured
          service={service}
          onConfigured={vi.fn()}
          onCleared={vi.fn()}
        />
        <ProviderKeyCard
          provider="openai"
          displayName="OpenAI"
          configured
          service={service}
          onConfigured={vi.fn()}
          onCleared={vi.fn()}
        />
      </>,
    );

    const anthropic = screen.getByRole("region", { name: "Anthropic" });
    await user.click(within(anthropic).getByRole("button", { name: "Remove key" }));

    const openai = screen.getByRole("region", { name: "OpenAI" });
    expect(within(openai).getByRole("button", { name: "Remove key" })).toBeVisible();
    expect(within(openai).queryByRole("button", { name: /^Remove OpenAI key$/ })).toBeNull();
  });
});
