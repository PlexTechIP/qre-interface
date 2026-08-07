// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
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
  it("disables the control", () => {
    // The yoked codes only PROVIDE a MEMORY instruction; nothing in this build
    // demands one, so selecting them changes nothing. An enabled control that
    // silently does nothing is the defect this replaces.
    renderSection();

    expect(memoryOptControl()).toBeDisabled();
  });

  it("says why, rather than calling itself optional", () => {
    renderSection();

    const help = screen.getByTestId("memory-opt-help");
    expect(help).toHaveTextContent(/unavailable/i);
    expect(help).not.toHaveTextContent(/defaults to None/i);
  });

  it("still shows the value a stored record carries", () => {
    // A v1.1.0 record may hold yoked_2d. Rerun rehydrates it, and the form must
    // report what the record says instead of quietly showing None.
    renderSection("yoked_2d");

    expect(memoryOptControl()).toHaveValue("yoked_2d");
  });
});
