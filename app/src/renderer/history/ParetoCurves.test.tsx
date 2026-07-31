// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { buildFrontierRow, buildRunRecord } from "../../shared/testing";
import type { FrontierRow, RunRecord } from "../../shared/types";
import { ParetoCurves } from "./ParetoCurves";

/**
 * Recharts draws into a ResponsiveContainer, which has no measurable size under
 * jsdom — so these assert on the surface's own accessible scaffolding (the
 * figure, the named curve key, the "not plotted" note, and the text-equivalent
 * table). The geometry itself is covered by `buildParetoModel`'s pure tests.
 */

function point(runtimeNs: number, qubits: number): FrontierRow {
  return buildFrontierRow({
    runtime: { value: runtimeNs, unit: "ns", display: `${runtimeNs} ns` },
    physicalQubits: { value: qubits, unit: "qubits", display: String(qubits) },
  });
}

function run(
  id: string,
  name: string,
  frontier: FrontierRow[] | null,
  status: "succeeded" | "failed" = "succeeded",
): RunRecord {
  return buildRunRecord({
    config: { id, name },
    result: {
      status,
      frontier,
      ...(status === "failed"
        ? { error: { code: "ESTIMATION_FAILED", message: "No feasible point." } }
        : {}),
    },
  });
}

const ID_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ID_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ID_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const RUN_A = run(ID_A, "Superconducting frontier", [
  point(19_100_000, 829_766),
  point(14_300_000, 1_048_200),
  point(31_800_000, 652_440),
]);
const RUN_B = run(ID_B, "Majorana frontier", [point(9_000_000, 2_400_000), point(40_000_000, 900_000)]);

afterEach(cleanup);

describe("Pareto frontier curves", () => {
  it("plots one named curve per selected run", () => {
    render(<ParetoCurves records={[RUN_A, RUN_B]} />);

    expect(screen.getByRole("figure", { name: /pareto frontier curves/i })).toBeInTheDocument();

    const key = screen.getByRole("list", { name: /curve key/i });
    expect(within(key).getByText("Superconducting frontier")).toBeInTheDocument();
    expect(within(key).getByText("Majorana frontier")).toBeInTheDocument();
    expect(within(key).getAllByRole("listitem")).toHaveLength(2);
  });

  it("states each curve's point count, including a one-row frontier", () => {
    render(<ParetoCurves records={[RUN_A, run(ID_C, "Sparse run", [point(0, 12_000)])]} />);

    const key = screen.getByRole("list", { name: /curve key/i });
    expect(within(key).getByText(/3 points/)).toBeInTheDocument();
    // A single-row frontier is a curve with one visible point, not an omission.
    expect(within(key).getByText(/1 point$/)).toBeInTheDocument();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("names a failed run as not plotted rather than crashing or blanking", () => {
    render(<ParetoCurves records={[RUN_A, run(ID_C, "Infeasible budget", null, "failed")]} />);

    const note = screen.getByRole("note");
    expect(note).toHaveTextContent(/not plotted/i);
    expect(note).toHaveTextContent("Infeasible budget");
    expect(note).toHaveTextContent(/no frontier/i);
    // The surviving run still plots.
    expect(
      within(screen.getByRole("list", { name: /curve key/i })).getByText("Superconducting frontier"),
    ).toBeInTheDocument();
  });

  it("renders a single-run selection without crashing", () => {
    render(<ParetoCurves records={[RUN_A]} />);

    expect(screen.getByRole("figure", { name: /pareto frontier curves/i })).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: /curve key/i })).getAllByRole("listitem")).toHaveLength(
      1,
    );
  });

  it("falls back to an explanatory message when nothing can be plotted", () => {
    render(<ParetoCurves records={[run(ID_C, "Infeasible budget", null, "failed")]} />);

    expect(screen.getByText(/none of the selected runs has a frontier to plot/i)).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("Infeasible budget");
  });

  it("offers the curves as a text-equivalent table, marking the represented row", async () => {
    render(<ParetoCurves records={[RUN_A, RUN_B]} selectedRowByRunId={{ [ID_A]: 2 }} />);

    const toggle = screen.getByRole("button", { name: /curve data as a table/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    const table = screen.getByRole("table");
    // Five plotted points across the two runs, each with its saved row number.
    expect(within(table).getAllByRole("row")).toHaveLength(6); // header + 5
    // RUN_A's row index 2 is the session's representative row.
    expect(within(table).getByText(/Row 3 of 3 · shown in the table above/)).toBeInTheDocument();
    // Values come from formatMetric, not the record's `display` string.
    expect(within(table).getByText("829,766")).toBeInTheDocument();
    expect(within(table).getByText("19.1 ms")).toBeInTheDocument();
  });

  it("describes the plot for a screen reader without needing the table opened", () => {
    render(<ParetoCurves records={[RUN_A]} />);

    const caption = screen.getByText(/physical qubits against runtime/i);
    expect(caption).toHaveTextContent("Superconducting frontier: 3 frontier points");
  });
});
