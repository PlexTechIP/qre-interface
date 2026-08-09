// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { MemoryOptimizationId } from "../../shared/types";
import { createInitialFormState } from "../state/formState";
import { MicroArchitectureSection } from "./MicroArchitectureSection";

afterEach(cleanup);

function renderSection(memoryOptimization: MemoryOptimizationId = "none"): void {
  const state = createInitialFormState();
  render(
    <MicroArchitectureSection
      architecture={state.architecture}
      magicStateFactories={state.magicStateFactories}
      onMagicStateFactoriesChange={vi.fn()}
      secondaryFactories={state.secondaryFactories}
      onSecondaryFactoriesChange={vi.fn()}
      memoryOptimization={memoryOptimization}
      onMemoryOptimizationChange={vi.fn()}
      traceTransform={state.traceTransform}
      onTraceTransformChange={vi.fn()}
      maxError={state.maxError}
      onMaxErrorChange={vi.fn()}
    />,
  );
}

function memoryOptControl(): HTMLSelectElement {
  // By ROLE, not by label text: the field now carries a definition tooltip whose
  // trigger is named "Memory Optimization definition", which a loose label match
  // also finds. The select is the only combobox here.
  return screen.getByRole("combobox", {
    name: /Memory Optimization/i,
  }) as HTMLSelectElement;
}

describe("Memory Optimization is marked unavailable, not optional", () => {
  it("lists the yoked codes but disables them, leaving only None selectable", () => {
    // The yoked codes only PROVIDE a MEMORY instruction; nothing in this build
    // demands one, so selecting them changes nothing. They stay visible in the
    // dropdown so their existence is discoverable, but each is disabled — an
    // enabled option that silently does nothing is the defect this replaces.
    renderSection();

    const control = memoryOptControl();
    expect(control).toBeEnabled();

    const options = within(control).getAllByRole("option") as HTMLOptionElement[];
    const byLabel = (pattern: RegExp): HTMLOptionElement => {
      const match = options.find((option) => pattern.test(option.textContent ?? ""));
      if (!match) throw new Error(`No option matching ${pattern}`);
      return match;
    };

    expect(byLabel(/^None$/i)).toBeEnabled();
    expect(byLabel(/1D Yoked/i)).toBeDisabled();
    expect(byLabel(/2D Yoked/i)).toBeDisabled();
  });

  it("flags itself unavailable, with the reason in the tooltip, not optional", () => {
    renderSection();

    // The field's visible eyebrow says "(unavailable)", never "(optional)"...
    const field = memoryOptControl().closest(".field") as HTMLElement;
    expect(within(field).getByText(/unavailable/i)).toBeInTheDocument();
    expect(field).not.toHaveTextContent(/optional/i);

    // ...and the "why" lives in the tooltip now, not a help paragraph.
    expect(
      screen.getByText(/they don't change the estimate, so the control is disabled/i),
    ).toBeInTheDocument();
  });

  it("still shows the value a stored record carries", () => {
    // A v1.1.0 record may hold yoked_2d. Rerun rehydrates it, and the form must
    // report what the record says instead of quietly showing None.
    renderSection("yoked_2d");

    expect(memoryOptControl()).toHaveValue("yoked_2d");
  });
});
