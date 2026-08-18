// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ComparisonView } from "./ComparisonView";
import { SAMPLE_RUN_RECORDS as MOCK_RUN_RECORDS } from "../../shared/testing";
import type { RunRecord } from "../../shared/types";

const SHOR_TRIO_NAMES = [
  "Shor's Factoring - Litinski19",
  "Shor's Factoring - GateBased Round-Based",
  "Shor's Factoring - Majorana Three-Aux",
];

function byName(name: string): RunRecord {
  const record = MOCK_RUN_RECORDS.find((r) => r.config.name === name);
  if (!record) throw new Error(`No mock record named "${name}"`);
  return record;
}

const trio = SHOR_TRIO_NAMES.map(byName);

const noop = () => {};

afterEach(cleanup);

describe("Comparison surface (Part E)", () => {
  it("shows a 'pick runs' empty state and no comparison actions with no selection", () => {
    render(<ComparisonView records={[]} onClear={noop} onRemove={noop} onExport={noop} />);

    expect(screen.getByText(/select at least 2 runs to compare/i)).toBeInTheDocument();
    // The Export/Clear actions now sit in the comparison summary, which only
    // renders alongside a selection — there is nothing to export or clear here.
    expect(screen.queryByRole("button", { name: /export comparison/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /clear selection/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("renders one column per selected run and the six default field rows", () => {
    render(<ComparisonView records={trio} onClear={noop} onRemove={noop} onExport={noop} />);

    const table = screen.getByRole("table");
    // Each run identifies its column (name appears here and in its chip → ≥1 in the table).
    for (const name of SHOR_TRIO_NAMES) {
      expect(within(table).getByText(name)).toBeInTheDocument();
    }

    for (const label of [
      "Total Fault Tolerant Execution Error",
      "T Count Per Rotation",
      "Physical Qubits",
      "Runtime",
      "Total Error",
      "Factories",
      "Code Distance",
      "Logical Cycle Time",
    ]) {
      expect(within(table).getByText(label)).toBeInTheDocument();
    }

    // Succeeded runs → real values, not the "—" no-data fallback, in the Physical Qubits row.
    const physicalQubitsRow = within(table).getByText("Physical Qubits").closest("tr");
    expect(physicalQubitsRow).not.toBeNull();
    const cells = within(physicalQubitsRow as HTMLElement).getAllByRole("cell");
    expect(cells).toHaveLength(3);
    cells.forEach((cell) => expect(cell.textContent).not.toBe("—"));
  });

  it("renders a per-metric chart for each numeric field the table shows", () => {
    render(<ComparisonView records={trio} onClear={noop} onRemove={noop} onExport={noop} />);

    // One chart per numeric field on the table — default result fields plus the
    // reported additional ones (e.g. Phys. Factory Qubits). Anchored so a label
    // never matches a longer sibling (e.g. "Runtime" vs "Runtime / Shot").
    for (const label of [
      "Physical Qubits",
      "Runtime",
      "Logical Cycle Time",
      "Phys\\. Factory Qubits",
      "Total Error",
      "Code Distance",
    ]) {
      // Chart labels live in <figcaption>, distinct from the table row headers.
      const figure = screen.getByRole("figure", { name: new RegExp(`^${label} by run`, "i") });
      expect(figure).toBeInTheDocument();
    }
  });

  it("chains the per-metric charts to the field filter", async () => {
    render(<ComparisonView records={trio} onClear={noop} onRemove={noop} onExport={noop} />);
    const factoryChart = /^Phys\. Factory Qubits by run/i;

    // The additional field reported by the trio shows as its own chart by default.
    expect(screen.getByRole("figure", { name: factoryChart })).toBeInTheDocument();

    // Filtering it out from the charts' own control removes the matching chart,
    // while a default metric's chart stays.
    await userEvent.click(screen.getByRole("button", { name: /filter metrics/i }));
    await userEvent.click(screen.getByRole("button", { name: /defaults only/i }));

    expect(screen.queryByRole("figure", { name: factoryChart })).not.toBeInTheDocument();
    expect(
      screen.getByRole("figure", { name: /^Physical Qubits by run/i }),
    ).toBeInTheDocument();
  });

  it("field filter adds/removes additional rows without touching the defaults", async () => {
    render(<ComparisonView records={trio} onClear={noop} onRemove={noop} onExport={noop} />);
    const table = screen.getByRole("table");

    // The trio reports physicalFactoryQubits — shown as a row by default.
    expect(within(table).getByText("Phys. Factory Qubits")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /filter fields/i }));
    await userEvent.click(screen.getByRole("button", { name: /defaults only/i }));

    // Additional row gone; a default row stays.
    expect(within(table).queryByText("Phys. Factory Qubits")).not.toBeInTheDocument();
    expect(within(table).getByText("Physical Qubits")).toBeInTheDocument();
  });

  it("renders a single-run selection without crashing", () => {
    render(<ComparisonView records={[trio[0]!]} onClear={noop} onRemove={noop} onExport={noop} />);

    const table = screen.getByRole("table");
    const physicalQubitsRow = within(table).getByText("Physical Qubits").closest("tr");
    expect(within(physicalQubitsRow as HTMLElement).getAllByRole("cell")).toHaveLength(1);
  });

  it("says a single run is not yet a comparison, however the user arrived here", () => {
    // Reachable by the sidebar/tab nav, which deliberately is NOT blocked — so the
    // below-threshold explanation has to live on this surface too, not only behind
    // the Compare Selected button.
    render(<ComparisonView records={[trio[0]!]} onClear={noop} onRemove={noop} onExport={noop} />);

    expect(screen.getByRole("status", { name: /below the comparison threshold/i })).toHaveTextContent(
      /at least 2 runs/i,
    );
  });

  it("drops that notice once two runs are selected", () => {
    render(<ComparisonView records={trio} onClear={noop} onRemove={noop} onExport={noop} />);

    expect(
      screen.queryByRole("status", { name: /below the comparison threshold/i }),
    ).not.toBeInTheDocument();
  });

  it("plots one Pareto curve per compared run, identified by name and shape", () => {
    render(<ComparisonView records={trio} onClear={noop} onRemove={noop} onExport={noop} />);

    const curves = screen.getByRole("figure", { name: /pareto frontier/i });
    expect(curves).toBeInTheDocument();

    // Each run gets a legend entry naming it and stating its marker shape, so the
    // series are distinguishable without relying on colour.
    for (const name of SHOR_TRIO_NAMES) {
      const entry = within(curves).getByTestId(`curve-legend-${name}`);
      expect(entry).toHaveTextContent(name);
      expect(entry).toHaveTextContent(/circle|square|triangle|diamond|star|cross/i);
    }
  });

  it("names a failed run as absent from the curves instead of dropping it silently", () => {
    const failed = MOCK_RUN_RECORDS.find((r) => r.result.status === "failed");
    if (!failed) throw new Error("Expected a failed mock record.");

    render(
      <ComparisonView
        records={[trio[0]!, failed]}
        onClear={noop}
        onRemove={noop}
        onExport={noop}
      />,
    );

    const curves = screen.getByRole("figure", { name: /pareto frontier/i });
    const omitted = within(curves).getByText(/not plotted/i).closest("p");
    expect(omitted).toHaveTextContent(failed.config.name);
    expect(omitted).toHaveTextContent(/run failed/i);
  });

  it("keeps the curve panel usable when nothing in the selection can be plotted", () => {
    const failed = MOCK_RUN_RECORDS.filter((r) => r.result.status === "failed");
    expect(failed.length).toBeGreaterThan(0);

    render(<ComparisonView records={failed} onClear={noop} onRemove={noop} onExport={noop} />);

    const curves = screen.getByRole("figure", { name: /pareto frontier/i });
    expect(within(curves).getByText(/no frontier data to plot/i)).toBeInTheDocument();
  });

  it("reads a failed run's cells as failed rather than as blank dashes", () => {
    const failed = MOCK_RUN_RECORDS.find((r) => r.result.status === "failed");
    if (!failed) throw new Error("Expected a failed mock record.");

    render(
      <ComparisonView
        records={[trio[0]!, failed]}
        onClear={noop}
        onRemove={noop}
        onExport={noop}
      />,
    );

    const table = screen.getByRole("table");
    const qubitsRow = within(table).getByText("Physical Qubits").closest("tr");
    const cells = within(qubitsRow as HTMLElement).getAllByRole("cell");

    // Column 2 is the failed run: it says so, rather than showing an ambiguous "—".
    expect(cells[1]).toHaveTextContent(/no result data/i);
    expect(cells[1]?.textContent).not.toBe("—");
    // The succeeded run is untouched.
    expect(cells[0]?.textContent).not.toMatch(/no result data/i);
  });

  it("leads with a summary of what is being compared", () => {
    const failed = MOCK_RUN_RECORDS.find((r) => r.result.status === "failed");
    if (!failed) throw new Error("Expected a failed mock record.");

    render(
      <ComparisonView
        records={[...trio, failed]}
        onClear={noop}
        onRemove={noop}
        onExport={noop}
      />,
    );

    const summary = screen.getByRole("status", { name: /comparison summary/i });
    expect(summary).toHaveTextContent(/4 runs/i);
    expect(summary).toHaveTextContent(/1 failed/i);
  });

  /**
   * The filter is this view's own state, so the export could only ever be the
   * comparison the analyst actually built if the view hands it over. It used to
   * export every field a run reported regardless of what was on screen.
   */
  it("hands the export the fields it is currently hiding", async () => {
    const onExport = vi.fn();
    render(<ComparisonView records={trio} onClear={noop} onRemove={noop} onExport={onExport} />);

    await userEvent.click(screen.getByRole("button", { name: /filter fields/i }));
    await userEvent.click(screen.getByRole("button", { name: /defaults only/i }));
    await userEvent.click(screen.getByRole("button", { name: /export comparison/i }));

    expect(onExport).toHaveBeenCalledTimes(1);
    const hidden = onExport.mock.calls[0]?.[0] as ReadonlySet<string>;
    expect(hidden.has("physicalFactoryQubits")).toBe(true);
    expect(hidden.has("physicalQubits")).toBe(false);
  });

  it("hands the export an empty hidden set when nothing is filtered out", async () => {
    const onExport = vi.fn();
    render(<ComparisonView records={trio} onClear={noop} onRemove={noop} onExport={onExport} />);

    await userEvent.click(screen.getByRole("button", { name: /export comparison/i }));

    expect((onExport.mock.calls[0]?.[0] as ReadonlySet<string>).size).toBe(0);
  });

  it("wires the export and per-run remove affordances", async () => {
    const onExport = vi.fn();
    const onRemove = vi.fn();
    render(<ComparisonView records={trio} onClear={noop} onRemove={onRemove} onExport={onExport} />);

    await userEvent.click(screen.getByRole("button", { name: /export comparison/i }));
    expect(onExport).toHaveBeenCalledTimes(1);

    await userEvent.click(
      screen.getByRole("button", { name: new RegExp(`remove ${SHOR_TRIO_NAMES[0]}`, "i") }),
    );
    expect(onRemove).toHaveBeenCalledWith(trio[0]!.id);
  });
});
