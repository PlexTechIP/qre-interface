import { describe, expect, it } from "vitest";

import { formatDateTime } from "./formatDateTime";

describe("formatDateTime", () => {
  /**
   * The conversation list grew its own formatter that omitted the year, so a
   * conversation last touched in August 2025 rendered identically to one from
   * August 2026 — in a column whose whole job is ordering them by recency.
   */
  it("distinguishes the same day in different years", () => {
    expect(formatDateTime("2025-08-11T09:04:00.000Z")).not.toBe(
      formatDateTime("2026-08-11T09:04:00.000Z"),
    );
  });

  it("carries both a date and a time", () => {
    const formatted = formatDateTime("2026-08-11T09:04:00.000Z");
    expect(formatted).toMatch(/\d/);
    expect(formatted.split(" ").length).toBeGreaterThan(1);
  });

  it("hands back an unparseable value rather than 'Invalid Date'", () => {
    expect(formatDateTime("yesterday")).toBe("yesterday");
  });
});
