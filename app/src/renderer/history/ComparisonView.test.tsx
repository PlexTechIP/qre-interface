// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ComparisonView } from "./ComparisonView";
import { MOCK_RUN_RECORDS } from "../../shared/runRecordFixtures";
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
  it("shows a 'pick runs' empty state and disables its actions with no selection", () => {
    render(<ComparisonView records={[]} onClear={noop} onRemove={noop} onExport={noop} />);

    expect(screen.getByText(/select at least 2 runs to compare/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /export comparison/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /clear selection/i })).toBeDisabled();
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

  it("renders the six per-metric charts, including physical factory qubits", () => {
    render(<ComparisonView records={trio} onClear={noop} onRemove={noop} onExport={noop} />);

    for (const label of [
      "Physical Qubits",
      "Runtime",
      "Logical Cycle Time",
      "Physical Factory Qubits",
      "Total Error",
      "Code Distance",
    ]) {
      // Chart labels live in <figcaption>, distinct from the table row headers.
      const figure = screen.getByRole("figure", { name: new RegExp(label, "i") });
      expect(figure).toBeInTheDocument();
    }
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
