// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MaxErrorSection } from "./MaxErrorSection";

afterEach(cleanup);

describe("MaxErrorSection log slider", () => {
  it("keeps an exact sub-0.01 value visible instead of clamping it to the slider minimum", () => {
    // The old linear slider had min=0.01 and would clamp/misrepresent 0.001.
    render(<MaxErrorSection value={0.001} onChange={() => {}} />);

    expect(screen.getByText("0.001")).toBeInTheDocument();
  });

  it("emits a clean decade value when the slider is dragged (log mapping)", () => {
    const onChange = vi.fn();
    render(<MaxErrorSection value={1} onChange={onChange} />);

    fireEvent.change(screen.getByRole("slider"), { target: { value: "-6" } });

    expect(onChange).toHaveBeenCalledWith(1e-6);
  });

  it("covers the full valid range: dragging to the minimum yields 1e-12", () => {
    const onChange = vi.fn();
    render(<MaxErrorSection value={1} onChange={onChange} />);

    fireEvent.change(screen.getByRole("slider"), { target: { value: "-12" } });

    expect(onChange).toHaveBeenCalledWith(1e-12);
  });
});
