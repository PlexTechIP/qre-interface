// @vitest-environment jsdom
import { cloneElement, isValidElement, type ReactElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildFrontierRow, buildRunRecord } from "../../shared/testing";
import type { FrontierRow } from "../../shared/types";
import { toComparisonColumn } from "./comparisonModel";
import { FrontierCurves } from "./FrontierCurves";

/**
 * Recharts sizes itself from a ResizeObserver, which jsdom never fires — so a
 * `ResponsiveContainer` measures 0x0 and renders NOTHING. The other comparison
 * tests therefore only assert on the legend/caption around the chart, which
 * cannot catch a chart that throws once it actually has room to draw.
 *
 * Substituting a fixed-size container is a substitute for the missing browser
 * layout, not for the component under test: everything asserted below is our own
 * SVG output, rendered by the real Recharts.
 */
/** The dimensions a browser would have given the container. */
type Sized = { width?: number; height?: number };

vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactElement<Sized> }) =>
      isValidElement<Sized>(children)
        ? cloneElement(children, { width: 600, height: 320 })
        : children,
  };
});

afterEach(cleanup);

function pointAt(runtime: number, physicalQubits: number): FrontierRow {
  return buildFrontierRow({
    runtime: { value: runtime, unit: "ns", display: "ignored" },
    physicalQubits: { value: physicalQubits, unit: "qubits", display: "ignored" },
  });
}

function columnsFor(
  specs: Array<{ id: string; name: string; points: FrontierRow[]; selectedIndex?: number }>,
) {
  return specs.map((spec) =>
    toComparisonColumn(
      buildRunRecord({
        config: { id: spec.id, name: spec.name },
        result: { frontier: spec.points },
      }),
      spec.selectedIndex ?? 0,
    ),
  );
}

const TWO_RUNS = [
  {
    id: "10000000-0000-4000-8000-00000000000a",
    name: "Run A",
    points: [pointAt(1_000, 900_000), pointAt(5_000, 400_000), pointAt(20_000, 250_000)],
    selectedIndex: 2,
  },
  {
    id: "10000000-0000-4000-8000-00000000000b",
    name: "Run B",
    points: [pointAt(2_000, 600_000), pointAt(9_000, 300_000)],
  },
];

describe("FrontierCurves — real Recharts render", () => {
  it("draws a chart with a connecting line per run once it has room", () => {
    const { container } = render(<FrontierCurves columns={columnsFor(TWO_RUNS)} />);

    const svg = container.querySelector(".recharts-surface");
    expect(svg).not.toBeNull();

    // One joint line per plotted run — this is what makes it a curve rather than
    // a cloud of points.
    const lines = container.querySelectorAll(".recharts-scatter-line");
    expect(lines).toHaveLength(2);
  });

  it("renders every frontier point as a marker, not only the representative row", () => {
    const { container } = render(<FrontierCurves columns={columnsFor(TWO_RUNS)} />);

    const symbols = container.querySelectorAll(".recharts-scatter-symbol");
    expect(symbols).toHaveLength(5); // 3 + 2
  });

  it("rings each run's representative point so the curve agrees with the table", () => {
    const { container } = render(<FrontierCurves columns={columnsFor(TWO_RUNS)} />);

    // Every run has a representative row (row 1 by default), so each series rings
    // exactly one point — that is the tie between a curve and its table column.
    // The ring is the only stroke-only circle we draw.
    expect(container.querySelectorAll('circle[fill="none"]')).toHaveLength(2);
  });

  it("rings nothing for a run it cannot plot", () => {
    const { container } = render(
      <FrontierCurves
        columns={[
          ...columnsFor([TWO_RUNS[0]!]),
          toComparisonColumn(
            buildRunRecord({
              config: { id: "10000000-0000-4000-8000-00000000000f", name: "Broken" },
              result: { status: "failed", frontier: null, raw: null },
            }),
          ),
        ]}
      />,
    );

    expect(container.querySelectorAll('circle[fill="none"]')).toHaveLength(1);
  });

  it("plots a one-row run as a visible point rather than an invisible line", () => {
    const { container } = render(
      <FrontierCurves
        columns={columnsFor([
          {
            id: "10000000-0000-4000-8000-00000000000c",
            name: "Sparse",
            points: [pointAt(42, 4_200)],
          },
        ])}
      />,
    );

    expect(container.querySelectorAll(".recharts-scatter-symbol")).toHaveLength(1);
  });

  it("survives a wide magnitude range on a log axis", () => {
    const { container } = render(
      <FrontierCurves
        columns={columnsFor([
          {
            id: "10000000-0000-4000-8000-00000000000d",
            name: "Wide",
            points: [pointAt(1, 10), pointAt(1_000_000, 5_000_000)],
          },
        ])}
      />,
    );

    expect(container.querySelector(".recharts-surface")).not.toBeNull();
    expect(container.querySelectorAll(".recharts-scatter-symbol")).toHaveLength(2);
    // No NaN escaped into the geometry.
    expect(container.innerHTML).not.toMatch(/NaN/);
  });

  it("renders the failed-run notice without attempting a chart", () => {
    const failedColumn = toComparisonColumn(
      buildRunRecord({
        config: { id: "10000000-0000-4000-8000-00000000000e", name: "Broken" },
        result: { status: "failed", frontier: null, raw: null },
      }),
    );

    const { container } = render(<FrontierCurves columns={[failedColumn]} />);

    expect(screen.getByText(/no frontier data to plot/i)).toBeInTheDocument();
    expect(container.querySelector(".recharts-surface")).toBeNull();
    expect(container.innerHTML).not.toMatch(/NaN/);
  });
});
