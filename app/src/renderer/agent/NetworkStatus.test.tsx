// @vitest-environment jsdom
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
