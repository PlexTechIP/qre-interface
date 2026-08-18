// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ThemeToggle } from "./ThemeToggle";

describe("ThemeToggle", () => {
  it("offers the theme you are not currently in", () => {
    const { unmount } = render(
      <ThemeToggle theme="light" preference="light" onToggle={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "Switch to dark mode" })).toBeVisible();
    unmount();

    render(<ThemeToggle theme="dark" preference="dark" onToggle={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Switch to light mode" })).toBeVisible();
  });

  it("toggles", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<ThemeToggle theme="light" preference="light" onToggle={onToggle} />);

    await user.click(screen.getByRole("button"));

    expect(onToggle).toHaveBeenCalledOnce();
  });

  /**
   * The button reads the RESOLVED theme, not the preference — "system" is
   * never something the document is painted as, so a toggle that tried to
   * describe it would have nothing to offer the analyst instead.
   */
  it("describes the resolved theme while following the system", () => {
    render(<ThemeToggle theme="dark" preference="system" onToggle={vi.fn()} />);

    // Prefix-matched: in system mode the name continues into the side-effect
    // warning, and what this pins down is that it offers LIGHT, not dark.
    expect(screen.getByRole("button", { name: /^Switch to light mode/ })).toBeVisible();
  });

  /**
   * Clicking this while following the system silently pins an explicit theme.
   * Saying so in the tooltip is the difference between a control that has a
   * side effect and one that hides it.
   */
  it("says that toggling will stop following the system", () => {
    render(<ThemeToggle theme="dark" preference="system" onToggle={vi.fn()} />);

    expect(screen.getByRole("button")).toHaveAttribute(
      "title",
      expect.stringMatching(/following your system theme/i) as unknown as string,
    );
  });

  /**
   * `title` is a mouse-hover affordance, and `aria-label` overrides it in the
   * accessible-name computation — so putting the warning only in the tooltip
   * told sighted mouse users about the side effect and no one else. Following
   * the system is a setting people choose for accessibility reasons; being
   * dropped out of it without being told is exactly the wrong audience to
   * surprise.
   */
  it("tells assistive tech too, not just hover", () => {
    render(<ThemeToggle theme="dark" preference="system" onToggle={vi.fn()} />);

    expect(screen.getByRole("button")).toHaveAccessibleName(
      /following your system theme/i,
    );
  });

  it("keeps the plain action as the accessible name once pinned", () => {
    render(<ThemeToggle theme="dark" preference="dark" onToggle={vi.fn()} />);

    expect(screen.getByRole("button")).toHaveAccessibleName("Switch to light mode");
  });

  it("does not claim to follow the system once a theme is pinned", () => {
    render(<ThemeToggle theme="dark" preference="dark" onToggle={vi.fn()} />);

    expect(screen.getByRole("button").getAttribute("title")).not.toMatch(/system/i);
  });
});
