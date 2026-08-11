// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { AgentProviderStatus } from "../../shared/agentTypes";
import { NetworkStatus } from "./NetworkStatus";

const status: AgentProviderStatus = {
  available: true, networkEnabled: true, mode: "provider",
  providers: [
    { provider: "anthropic", displayName: "Anthropic", configured: true, models: ["claude-sonnet-5", "claude-opus-5"], defaultModel: "claude-sonnet-5" },
    { provider: "openai", displayName: "OpenAI", configured: false, models: ["gpt-5.6-terra"], defaultModel: "gpt-5.6-terra" },
  ],
};

describe("NetworkStatus", () => {
  it("keeps model detail out of the visible badge but exposes it to assistive technology", () => {
    render(<NetworkStatus status={status} provider="anthropic" model="claude-sonnet-5" />);
    expect(screen.getByText("Network on")).toBeVisible();
    expect(screen.queryByText(/claude-sonnet-5/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Anthropic\/claude-sonnet-5/)).toBeInTheDocument();
  });

  /**
   * The indicator's whole job is saying whether networked features are on AND
   * which provider they point at. Reading the any-provider `networkEnabled`
   * flag made it announce a provider it could not reach.
   */
  it("reads off when the selected provider has no key, though another does", () => {
    render(<NetworkStatus status={status} provider="openai" model="gpt-5.6-terra" />);

    expect(screen.getByText("Network off")).toBeVisible();
    // And it must not name OpenAI as though traffic were flowing there.
    expect(screen.queryByLabelText(/OpenAI\/gpt-5\.6-terra/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/No key configured for OpenAI/)).toBeInTheDocument();
  });

  it("names the offline fixture rather than a provider it will never call", () => {
    render(
      <NetworkStatus
        status={{ ...status, networkEnabled: false, mode: "local_demo" }}
        provider="anthropic"
        model="claude-sonnet-5"
      />,
    );

    expect(screen.getByText("Network off")).toBeVisible();
    expect(screen.getByLabelText(/Local demo/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Anthropic\/claude-sonnet-5/)).not.toBeInTheDocument();
  });
});

/**
 * The "on" dot is the only colour on this surface that has to read against both
 * themes, and it was the one colour written as a literal — twice, in 170 lines
 * of otherwise token-clean CSS. A literal cannot be remapped for dark, so the
 * dot was carrying a value tuned against a white card onto a navy one.
 *
 * Asserted against the stylesheet source because there is nothing to assert in
 * the DOM: jsdom applies no stylesheet, so a rendered dot has no colour here.
 */
describe("the online dot's colour", () => {
  // Resolved from the vitest root (app/), not from import.meta.url — the
  // renderer project is transformed by vite, where that is not a file: URL.
  const css = readFileSync(resolve("src/renderer/styles.css"), "utf8");

  const block = (selector: string): string => {
    const match = new RegExp(
      `${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`,
    ).exec(css);
    if (match?.[1] === undefined) throw new Error(`No rule for ${selector}`);
    return match[1];
  };

  it("is a token, not a literal", () => {
    const rule = block(".agent-status--on .agent-status__dot");

    expect(rule).not.toMatch(/#[0-9a-f]{3,8}/i);
    // One token, used for the dot and derived for its halo — two tokens would
    // let the ring drift away from the dot it surrounds.
    expect(rule).toMatch(/background:\s*var\(--color-status-online\)/);
    expect(rule).toMatch(/color-mix\([^)]*var\(--color-status-online\)/);
  });

  it("is defined in both themes, so dark gets its own value", () => {
    const light = block(":root");
    const dark = block(':root[data-theme="dark"]');

    expect(light).toMatch(/--color-status-online:\s*#[0-9a-f]{3,8};/i);
    expect(dark).toMatch(/--color-status-online:\s*#[0-9a-f]{3,8};/i);
    expect(/--color-status-online:\s*(#[0-9a-f]{3,8});/i.exec(light)?.[1]).not.toBe(
      /--color-status-online:\s*(#[0-9a-f]{3,8});/i.exec(dark)?.[1],
    );
  });
});
