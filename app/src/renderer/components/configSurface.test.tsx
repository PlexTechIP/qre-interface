// @vitest-environment jsdom
/**
 * The week-5 configuration surface: the merged factory control, the four-stage
 * trace pipeline, and the tooltip mechanism.
 *
 * These are the behaviours most likely to regress silently. A toggle that writes
 * nothing, or writes an object when it should write nothing, produces identical
 * numbers and looks exactly like a working feature — so the pipeline assertions
 * below check the SHAPE that reaches the config, not just that a control moved.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildTraceTransform,
  createInitialFormState,
  normalizeFormState,
  type FormState,
  type TraceTransformForm,
} from "../state/formState";
import { MicroArchitectureSection } from "./MicroArchitectureSection";

afterEach(cleanup);

/** Renders the section over a live-ish state, returning the latest transform. */
function renderSection(overrides: Partial<FormState> = {}) {
  const state = { ...createInitialFormState(), ...overrides };
  const onTraceTransformChange = vi.fn();
  const onSecondaryFactoriesChange = vi.fn();
  const onMagicStateFactoriesChange = vi.fn();
  render(
    <MicroArchitectureSection
      architecture={state.architecture}
      magicStateFactories={state.magicStateFactories}
      onMagicStateFactoriesChange={onMagicStateFactoriesChange}
      secondaryFactories={state.secondaryFactories}
      onSecondaryFactoriesChange={onSecondaryFactoriesChange}
      memoryOptimization={state.memoryOptimization}
      onMemoryOptimizationChange={vi.fn()}
      traceTransform={state.traceTransform}
      onTraceTransformChange={onTraceTransformChange}
      maxError={state.maxError}
      onMaxErrorChange={vi.fn()}
    />,
  );
  return {
    onTraceTransformChange,
    onSecondaryFactoriesChange,
    onMagicStateFactoriesChange,
  };
}

const factoryGroup = () =>
  screen.getByRole("group", { name: /magic state factory/i });
const factoryBox = (name: RegExp) =>
  within(factoryGroup()).getByRole("checkbox", { name });

describe("One factory control with five options", () => {
  it("lists all five options in a single group", () => {
    renderSection();
    const boxes = within(factoryGroup()).getAllByRole("checkbox");
    expect(boxes).toHaveLength(5);
  });

  it("never shows the analyst the word 'Secondary'", () => {
    renderSection();
    // The merge is a presentation change; the split still exists on the wire.
    expect(screen.queryByText(/secondary/i)).not.toBeInTheDocument();
  });

  it("keeps the two contract fields distinct — a modifier routes to secondaryFactories", async () => {
    const user = userEvent.setup();
    const { onSecondaryFactoriesChange, onMagicStateFactoriesChange } =
      renderSection();

    await user.click(factoryBox(/magic up-to-clifford/i));

    expect(onSecondaryFactoriesChange).toHaveBeenCalledWith(["magic_up_to_clifford"]);
    expect(onMagicStateFactoriesChange).not.toHaveBeenCalled();
  });

  it("routes a primary to magicStateFactories, not secondaryFactories", async () => {
    const user = userEvent.setup();
    const { onSecondaryFactoriesChange, onMagicStateFactoriesChange } =
      renderSection();

    await user.click(factoryBox(/litinski19/i));

    expect(onMagicStateFactoriesChange).toHaveBeenCalledWith([
      "round_based",
      "litinski19",
    ]);
    expect(onSecondaryFactoriesChange).not.toHaveBeenCalled();
  });

  it("refuses to empty the primary set — modifiers alone is unreachable", () => {
    renderSection();
    // Round-Based is the only primary checked, so it is held.
    expect(factoryBox(/round-based/i)).toBeDisabled();
    expect(
      screen.getByText(/at least one of round-based, litinski19 or gsj24/i),
    ).toBeInTheDocument();
  });

  it("gives every unavailable option a visible reason", async () => {
    const user = userEvent.setup();
    const state = createInitialFormState();
    state.architecture.type = "majorana";
    renderSection({ architecture: state.architecture });

    expect(factoryBox(/magic up-to-clifford/i)).toBeDisabled();
    expect(screen.getByText(/not compatible with majorana/i)).toBeInTheDocument();
    await user.click(factoryBox(/^gsj24$/i)).catch(() => undefined);
  });

  it("keeps GSJ24 CCX bound to CCX Magic States in both directions", async () => {
    const user = userEvent.setup();
    const { onSecondaryFactoriesChange, onTraceTransformChange } = renderSection();

    // Factory -> flag
    await user.click(factoryBox(/gsj24 ccx/i));
    expect(onSecondaryFactoriesChange).toHaveBeenCalledWith(["gsj24_ccx"]);
    expect(onTraceTransformChange).toHaveBeenCalledWith(
      expect.objectContaining({ ccxMagicStates: true }),
    );

    // Flag -> factory
    onSecondaryFactoriesChange.mockClear();
    await user.click(screen.getByRole("switch", { name: /ccx magic states/i }));
    expect(onSecondaryFactoriesChange).toHaveBeenCalledWith(["gsj24_ccx"]);
  });
});

describe("The trace transform is a four-stage ordered pipeline", () => {
  it("shows Unmemory disabled until Dynamic Memory Compute is on", () => {
    renderSection();
    expect(screen.getByRole("switch", { name: /unmemory/i })).toBeDisabled();
  });

  it("enables stage 0 with qdk's own defaults, not a blank object", async () => {
    const user = userEvent.setup();
    const { onTraceTransformChange } = renderSection();

    await user.click(
      screen.getByRole("switch", { name: /dynamic memory compute/i }),
    );

    expect(onTraceTransformChange).toHaveBeenCalledWith(
      expect.objectContaining({
        dynamicMemoryCompute: {
          computeCapacityPercentage: 0.5,
          evictionStrategy: "least_recently_used",
        },
      }),
    );
  });

  it("clears Unmemory when stage 0 is switched off", async () => {
    const user = userEvent.setup();
    const state = createInitialFormState();
    const traceTransform: TraceTransformForm = {
      ...state.traceTransform,
      dynamicMemoryCompute: {
        computeCapacityPercentage: 0.5,
        evictionStrategy: "least_recently_used",
      },
      unmemory: true,
    };
    const { onTraceTransformChange } = renderSection({ traceTransform });

    await user.click(
      screen.getByRole("switch", { name: /dynamic memory compute/i }),
    );

    expect(onTraceTransformChange).toHaveBeenCalledWith(
      expect.objectContaining({ dynamicMemoryCompute: null, unmemory: false }),
    );
  });
});

describe("An off stage is ABSENT, not present at its defaults", () => {
  // The distinction this whole deliverable turns on: qdk composes
  // DynamicMemoryCompute(0.5, LRU) x PSSPC x LatticeSurgery into a different
  // estimate than PSSPC x LatticeSurgery, so serializing a stage the analyst
  // left off would silently change every run.
  it("omits dynamicMemoryCompute entirely when the stage is off", () => {
    const state = createInitialFormState();
    const transform = buildTraceTransform(state.traceTransform);

    expect(transform).not.toBeNull();
    expect(Object.keys(transform!)).not.toContain("dynamicMemoryCompute");
    expect(Object.keys(transform!)).not.toContain("unmemory");
  });

  it("writes the stage only when it is on", () => {
    const state = createInitialFormState();
    const transform = buildTraceTransform({
      ...state.traceTransform,
      dynamicMemoryCompute: {
        computeCapacityPercentage: 0.25,
        evictionStrategy: "least_frequently_used",
      },
    });

    expect(transform?.dynamicMemoryCompute).toEqual({
      computeCapacityPercentage: 0.25,
      evictionStrategy: "least_frequently_used",
    });
  });

  it("refuses to serialize a stage enabled with no capacity entered", () => {
    const state = createInitialFormState();
    // Dropping the stage would run a shorter pipeline than the form shows, so
    // this gates serialization instead — the same way a missing gate time does.
    expect(
      buildTraceTransform({
        ...state.traceTransform,
        dynamicMemoryCompute: {
          computeCapacityPercentage: null,
          evictionStrategy: "least_recently_used",
        },
      }),
    ).toBeNull();
  });

  it("never writes unmemory without the stage it reverses", () => {
    const state = createInitialFormState();
    const transform = buildTraceTransform({
      ...state.traceTransform,
      dynamicMemoryCompute: null,
      unmemory: true,
    });

    expect(Object.keys(transform!)).not.toContain("unmemory");
  });

  it("normalizeFormState clears a stranded Unmemory", () => {
    const state = createInitialFormState();
    const next = normalizeFormState({
      ...state,
      traceTransform: {
        ...state.traceTransform,
        dynamicMemoryCompute: null,
        unmemory: true,
      },
    });

    expect(next.traceTransform.unmemory).toBe(false);
  });
});

describe("Renames are live where the user sees them", () => {
  it("shows T Count Per Rotation, not T States / Rotation", () => {
    renderSection();
    expect(screen.getByText("T Count Per Rotation")).toBeInTheDocument();
    expect(screen.queryByText(/T States \/ Rotation/i)).not.toBeInTheDocument();
  });

  it("shows Total Fault Tolerant Execution Error, not Max Error", () => {
    renderSection();
    expect(
      screen.getByText("Total Fault Tolerant Execution Error"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Max Error$/i)).not.toBeInTheDocument();
  });
});

describe("Tooltips are reachable and associated with the control", () => {
  it("puts the definition on the CONTROL via aria-describedby, not only the trigger", () => {
    renderSection();
    const qec = screen.getByRole("combobox", { name: /QEC Code/i });
    const describedBy = qec.getAttribute("aria-describedby");

    expect(describedBy).toBe("micro-qec-definition");
    expect(document.getElementById(describedBy!)).toHaveAttribute(
      "role",
      "tooltip",
    );
  });

  it("exposes each trigger as a real button, so it is keyboard reachable", () => {
    renderSection();
    const trigger = screen.getByRole("button", { name: /QEC Code definition/i });

    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("opens on click and dismisses on Escape without moving focus", async () => {
    const user = userEvent.setup();
    renderSection();
    const trigger = screen.getByRole("button", { name: /QEC Code definition/i });

    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    await user.keyboard("{Escape}");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });

  it("does not fold the trigger into a checkbox's accessible name", () => {
    renderSection();
    // A tooltip trigger nested inside a <label> would make this announce as
    // "Litinski19 Litinski19 definition".
    expect(factoryBox(/^Litinski19$/)).toBeInTheDocument();
  });
});
