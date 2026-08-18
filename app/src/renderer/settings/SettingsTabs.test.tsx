// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import path from "node:path";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { SettingsTabs, type SettingsTab } from "./SettingsTabs";

const stylesheet = readFileSync(path.join(process.cwd(), "src/renderer/styles.css"), "utf8");

const TABS: readonly SettingsTab[] = [
  { id: "general", label: "General", panel: <p>general body</p> },
  { id: "providers", label: "AI providers", panel: <p>providers body</p> },
  { id: "data", label: "Data & storage", panel: <p>data body</p> },
];

/** The shell owns the selection, so a test of the real contract has to too. */
function Harness({ tabs = TABS }: { tabs?: readonly SettingsTab[] }): React.JSX.Element {
  const [active, setActive] = useState(0);
  return <SettingsTabs tabs={tabs} active={active} onActiveChange={setActive} />;
}

const panels = (): HTMLElement[] => screen.getAllByRole("tabpanel", { hidden: true });
const shown = (): HTMLElement[] => panels().filter((panel) => !panel.hasAttribute("hidden"));

/** The declaration block for a selector, or null when the sheet has no such rule. */
function ruleFor(selector: string): string | null {
  const escaped = selector.replace(/[.[\]]/g, "\\$&");
  const match = new RegExp(`(^|[,}])\\s*${escaped}\\s*\\{([^}]*)\\}`, "m").exec(stylesheet);
  return match?.[2] ?? null;
}

describe("SettingsTabs", () => {
  /**
   * The regression this exists to catch.
   *
   * Panels are kept mounted and hidden with the `hidden` attribute, but
   * `.settings-tabs__panel` sets `display: grid`. An author `display` beats the
   * UA stylesheet's `[hidden] { display: none }` at any specificity, so every
   * panel painted at once and the tabs did nothing at all.
   *
   * This cannot be caught by asserting on computed style here: jsdom applies
   * the author rule for a visible panel but still reports `none` for a hidden
   * one, giving the UA rule a priority the real cascade does not. jsdom shows
   * this bug as working. So the assertion is on the stylesheet itself — if a
   * panel's class sets `display`, it has to carry its own `[hidden]` guard.
   */
  it("neutralises its own display rule when a panel is hidden", () => {
    const base = ruleFor(".settings-tabs__panel");
    expect(base).not.toBeNull();

    // Guard only required because the base rule sets display; if that ever
    // stops being true this test should stop demanding one.
    if (base !== null && /(^|;)\s*display\s*:/.test(base)) {
      const guard = ruleFor(".settings-tabs__panel[hidden]");
      expect(guard, ".settings-tabs__panel sets display but has no [hidden] guard").not.toBeNull();
      expect(guard).toMatch(/display\s*:\s*none/);
    }
  });

  it("shows exactly one panel, and it is the selected one", () => {
    render(<Harness />);

    expect(panels()).toHaveLength(TABS.length);
    expect(shown()).toHaveLength(1);
    expect(within(shown()[0]!).getByText("general body")).toBeTruthy();
  });

  it("swaps which panel is shown when a tab is clicked", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("tab", { name: "Data & storage" }));

    expect(shown()).toHaveLength(1);
    expect(within(shown()[0]!).getByText("data body")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Data & storage" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("keeps every panel mounted so a tab switch does not discard its state", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("tab", { name: "AI providers" }));

    // The other panels are still in the tree, just not shown.
    expect(panels()).toHaveLength(TABS.length);
    expect(screen.getByText("general body")).toBeTruthy();
    expect(screen.getByText("data body")).toBeTruthy();
  });

  it("is one stop in the page tab order, with arrows moving inside it", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const tabs = screen.getAllByRole("tab");
    expect(tabs.filter((tab) => tab.getAttribute("tabindex") === "0")).toHaveLength(1);

    tabs[0]!.focus();
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(tabs[1]);
    expect(within(shown()[0]!).getByText("providers body")).toBeTruthy();

    await user.keyboard("{End}");
    expect(document.activeElement).toBe(tabs[2]);

    // Wraps, so the list has no dead end.
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(tabs[0]);
  });
});
