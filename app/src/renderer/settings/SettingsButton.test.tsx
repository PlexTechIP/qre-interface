// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { AgentProviderStatus, ProviderId } from "../../shared/agentTypes";
import { PROVIDER_MODELS } from "../../shared/providerModels";
import { SettingsButton } from "./SettingsButton";

const statusWith = (
  configured: readonly ProviderId[],
  overrides: Partial<AgentProviderStatus> = {},
): AgentProviderStatus =>
  ({
    available: configured.length > 0,
    networkEnabled: configured.length > 0,
    mode: configured.length > 0 ? "provider" : "unavailable",
    message: "No model provider is configured.",
    providers: (["anthropic", "openai", "openrouter"] as const).map((provider) => ({
      provider,
      ...PROVIDER_MODELS[provider],
      configured: configured.includes(provider),
    })),
    ...overrides,
  }) as AgentProviderStatus;

function setup(options: { status?: AgentProviderStatus; active?: boolean } = {}) {
  const onOpen = vi.fn();
  render(
    <SettingsButton
      status={options.status ?? statusWith(["anthropic"])}
      provider="anthropic"
      model="claude-sonnet-5"
      active={options.active ?? false}
      onOpen={onOpen}
    />,
  );
  return { onOpen };
}

const button = (): HTMLElement => screen.getByRole("button", { name: /^Settings/ });

describe("SettingsButton", () => {
  it("opens Settings", async () => {
    const { onOpen } = setup();

    await userEvent.click(button());

    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("marks itself as the current page while Settings is open", () => {
    setup({ active: true });

    expect(button()).toHaveAttribute("aria-current", "page");
  });

  it("is not current anywhere else", () => {
    setup({ active: false });

    expect(button()).not.toHaveAttribute("aria-current");
  });
});

/**
 * This button replaced the standalone "Network on" badge, so it inherited that
 * badge's job: brief constraint 7 asks that the feature stay VISIBLY networked,
 * and this is now the only indicator outside the chat page.
 *
 * The action leads the accessible name and the state follows, for the same
 * reason it does on `ThemeToggle`: `aria-label` overrides `title`, so a state
 * that lived only in the tooltip would reach sighted mouse users and nobody
 * else.
 */
describe("SettingsButton — the networked-features indicator", () => {
  it("says which provider and model the next send would reach", () => {
    setup();

    expect(button()).toHaveAccessibleName(/Anthropic\/claude-sonnet-5/);
    expect(button()).toHaveAccessibleName(/on/i);
  });

  /** On/off is per SELECTED provider, not per app — see the old badge. */
  it("reads off when the selected provider holds no key", () => {
    setup({ status: statusWith(["openai"]) });

    expect(button()).toHaveAccessibleName(/off/i);
    expect(button()).toHaveAccessibleName(/no key configured for Anthropic/i);
  });

  it("reads off when nothing is configured at all", () => {
    setup({ status: statusWith([]) });

    expect(button()).toHaveAccessibleName(/off/i);
  });

  /** The offline fixture is available but deliberately not networked. */
  it("does not claim a network the local demo never uses", () => {
    setup({ status: statusWith(["anthropic"], { mode: "local_demo" }) });

    expect(button()).toHaveAccessibleName(/no request leaves this machine/i);
    expect(button()).toHaveAccessibleName(/off/i);
  });

  it("carries the same words in the tooltip", () => {
    setup();

    expect(button().getAttribute("title")).toBe(button().getAttribute("aria-label"));
  });

  /** The dot is what a sighted analyst reads at a glance. */
  it("paints the dot to match", () => {
    const { container } = render(
      <SettingsButton
        status={statusWith(["anthropic"])}
        provider="anthropic"
        model="claude-sonnet-5"
        active={false}
        onOpen={vi.fn()}
      />,
    );

    expect(container.querySelector(".agent-status--on")).not.toBeNull();
  });
});
