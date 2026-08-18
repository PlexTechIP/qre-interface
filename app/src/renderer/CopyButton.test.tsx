import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CopyButton } from "./CopyButton";
import { withClipboard } from "./test/clipboard";

describe("CopyButton", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /**
   * The bug this pins: holding only `"copied" | "failed" | "idle"`, a second
   * copy set the state to the value it already held. React bails out of an
   * identical update, so the reset effect never re-ran and the FIRST click's
   * timer was still the one counting — the label could snap back to rest a few
   * milliseconds after the second copy succeeded.
   */
  it("gives each copy its own window, not the first click's leftovers", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn(() => Promise.resolve());

    await withClipboard(writeText, async () => {
      render(<CopyButton value="{}" label="Copy JSON" />);
      const button = screen.getByRole("button");

      await act(async () => {
        button.click();
      });
      expect(button).toHaveTextContent("Copied");

      // Spend all but 100ms of the first window, then copy again.
      await act(async () => {
        vi.advanceTimersByTime(1900);
      });
      await act(async () => {
        button.click();
      });

      // The first click's deadline passes here. The second click's must not.
      await act(async () => {
        vi.advanceTimersByTime(300);
      });
      expect(button).toHaveTextContent("Copied");

      await act(async () => {
        vi.advanceTimersByTime(1800);
      });
      expect(button).toHaveTextContent("Copy JSON");
    });

    expect(writeText).toHaveBeenCalledTimes(2);
  });

  /** A refusal is reported, because a silent no-op teaches you to trust it. */
  it("says so when the clipboard refuses", async () => {
    await withClipboard(
      () => Promise.reject(new Error("denied")),
      async () => {
        render(<CopyButton value="{}" label="Copy JSON" />);
        const button = screen.getByRole("button");

        await act(async () => {
          button.click();
        });

        expect(button).toHaveTextContent("Could not copy");
      },
    );
  });
});
