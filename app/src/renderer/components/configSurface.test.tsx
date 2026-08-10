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
import { ConfigurationSummary } from "./ConfigurationSummary";
import { MicroArchitectureSection } from "./MicroArchitectureSection";

afterEach(cleanup);

/** Renders the section over a live-ish state, returning the latest transform. */
function renderSection(
  overrides: Partial<FormState> = {},
  props: { magicStateFactoriesError?: string } = {},
) {
  const state = { ...createInitialFormState(), ...overrides };
  const onTraceTransformChange = vi.fn();
  const onSecondaryFactoriesChange = vi.fn();
  const onMagicStateFactoriesChange = vi.fn();
  render(
    <MicroArchitectureSection
      architecture={state.architecture}
      magicStateFactories={state.magicStateFactories}
      onMagicStateFactoriesChange={onMagicStateFactoriesChange}
      magicStateFactoriesError={props.magicStateFactoriesError}
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

  it("lets the last primary be unchecked, asking to empty the set", async () => {
    const user = userEvent.setup();
    const { onMagicStateFactoriesChange } = renderSection();
    // Round-Based is the only primary checked and is now removable, not held.
    const roundBased = factoryBox(/round-based/i);
    expect(roundBased).toBeEnabled();

    await user.click(roundBased);
    expect(onMagicStateFactoriesChange).toHaveBeenCalledWith([]);
  });

  it("surfaces the empty-set error passed from validation", () => {
    renderSection(
      { magicStateFactories: [] },
      {
        magicStateFactoriesError:
          "At least one of Round-Based, Litinski19 or GSJ24 must stay selected.",
      },
    );
    const error = screen.getByRole("alert");
    expect(error).toHaveTextContent(
      /at least one of round-based, litinski19 or gsj24 must stay selected/i,
    );
  });

  it("greys out the options an architecture can't use and names each requirement", () => {
    const state = createInitialFormState();
    state.architecture.type = "majorana";
    renderSection({ architecture: state.architecture });

    const boxes = within(factoryGroup()).getAllByRole("checkbox");
    const disabled = boxes.filter((box) => (box as HTMLInputElement).disabled);
    // Majorana rules out Litinski19, GSJ24 and Magic Up-to-Clifford; Round-Based
    // stays available (the set is allowed to go empty, so it is not force-held).
    expect(disabled.map((box) => box.id).sort()).toEqual([
      "micro-factory-gsj24",
      "micro-factory-litinski19",
      "micro-factory-magic_up_to_clifford",
    ]);

    // Each option carries its requirement in parentheses, per-rule, not one
    // copy-pasted sentence.
    expect(screen.getByText(/\(not compatible with majorana\)/i)).toBeInTheDocument();
    expect(screen.getAllByText(/requires superconducting/i)).toHaveLength(2);
    // The section help states the Majorana rule.
    expect(
      screen.getByText(/majorana supports round-based only/i),
    ).toBeInTheDocument();
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

  /**
   * The case the click test above cannot see. WCAG 2.1 SC 1.4.13 requires
   * dismissal without moving pointer hover OR focus, and a hover-opened bubble
   * has focus nowhere near the trigger — so a keydown handler ON the trigger
   * never fires and the pointer user's only exit was to move the mouse. The
   * listener sits on the document while open instead.
   */
  it("dismisses on Escape when the bubble was opened by hover, not focus", async () => {
    const user = userEvent.setup();
    renderSection();
    const trigger = screen.getByRole("button", { name: /QEC Code definition/i });

    await user.hover(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(trigger).not.toHaveFocus();

    await user.keyboard("{Escape}");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  /**
   * The dismiss listener sits on `document` in the CAPTURE phase, and React
   * delegates from the root container — a descendant of `document`. So an
   * unconditional `stopPropagation()` there stopped Escape before it ever
   * reached the React tree, and a bubble opens on plain `onMouseEnter`: merely
   * resting the pointer on a "?" glyph made Escape dead for every other
   * dismissible surface in the app.
   *
   * A hover is not a claim on the key. A focused trigger is — the analyst
   * deliberately opened that bubble, and it really is the topmost thing they
   * are interacting with.
   */
  describe("Escape ownership", () => {
    function listenForEscape(): { seen: () => number; stop: () => void } {
      let count = 0;
      const listener = (event: KeyboardEvent): void => {
        if (event.key === "Escape") count += 1;
      };
      // Bubble phase on the container React delegates from, which is what an
      // enclosing dialog's own handler would see.
      document.body.addEventListener("keydown", listener);
      return {
        seen: () => count,
        stop: () => document.body.removeEventListener("keydown", listener),
      };
    }

    it("leaves Escape available to the rest of the app when opened by hover", async () => {
      const user = userEvent.setup();
      renderSection();
      const trigger = screen.getByRole("button", { name: /QEC Code definition/i });
      const escapes = listenForEscape();

      try {
        await user.hover(trigger);
        expect(trigger).toHaveAttribute("aria-expanded", "true");

        await user.keyboard("{Escape}");

        // The bubble closes AND the key still reaches everything else.
        expect(trigger).toHaveAttribute("aria-expanded", "false");
        expect(escapes.seen()).toBe(1);
      } finally {
        escapes.stop();
      }
    });

    it("claims Escape only while its own trigger holds focus", async () => {
      const user = userEvent.setup();
      renderSection();
      const trigger = screen.getByRole("button", { name: /QEC Code definition/i });
      const escapes = listenForEscape();

      try {
        await user.click(trigger);
        expect(trigger).toHaveFocus();

        await user.keyboard("{Escape}");

        expect(trigger).toHaveAttribute("aria-expanded", "false");
        expect(escapes.seen()).toBe(0);
      } finally {
        escapes.stop();
      }
    });
  });

  it("does not fold the trigger into a checkbox's accessible name", () => {
    renderSection();
    // A tooltip trigger nested inside a <label> would make this announce as
    // "Litinski19 Litinski19 definition".
    expect(factoryBox(/^Litinski19$/)).toBeInTheDocument();
  });
});

describe("The summary reads back the pipeline the run would actually use", () => {
  const renderSummary = (traceTransform: TraceTransformForm): void => {
    render(
      <ConfigurationSummary
        state={{ ...createInitialFormState(), traceTransform }}
        generatedName="draft"
        qreVersion="qdk-qre-v1-fixture"
      />,
    );
  };

  const withStage0 = (
    computeCapacityPercentage: number | null,
  ): TraceTransformForm => ({
    ...createInitialFormState().traceTransform,
    dynamicMemoryCompute: {
      computeCapacityPercentage,
      evictionStrategy: "least_recently_used",
    },
  });

  /** The value <dd> paired with the given label, scoped to its config-grid cell. */
  const valueFor = (label: string): HTMLElement =>
    within(screen.getByText(label).closest("div") as HTMLElement).getByText(
      (_, node) => node?.tagName === "DD",
    );

  it("flags Dynamic Memory Compute as active when stage 0 is on and complete", () => {
    renderSummary(withStage0(0.5));

    // Stage 0 is its own explicit recap row, so it can never look like the OFF
    // state the way the old collapsed pipeline string could.
    expect(valueFor("Dynamic Memory Compute")).toHaveTextContent("On");
  });

  it("still flags stage 0 in the recap even when its capacity is not yet entered", () => {
    renderSummary(withStage0(null));

    // The stage is switched on regardless of whether its capacity is filled in;
    // ValidationSummary names the missing field. The recap must not drop it.
    expect(valueFor("Dynamic Memory Compute")).toHaveTextContent("On");
  });

  it("breaks out the stage-0 parameters in the advanced details", async () => {
    const user = userEvent.setup();
    renderSummary(withStage0(0.5));

    await user.click(screen.getByText("Advanced details"));

    expect(valueFor("Compute Capacity Percentage")).toHaveTextContent("0.5");
    expect(valueFor("Eviction Strategy")).toHaveTextContent("Least Recently Used");
  });
});
