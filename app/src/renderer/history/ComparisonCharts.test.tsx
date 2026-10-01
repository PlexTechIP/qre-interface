// @vitest-environment jsdom
/**
 * The per-metric bars name each run once, above the charts, instead of under
 * every bar. Under the bars, three long run names in a 280px chart ran into one
 * another ("Ising ModeRSA-2048 SShor's…") and named nothing. jsdom draws no
 * SVG, so this asserts the legend, which is HTML.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SAMPLE_RUN_RECORDS } from "../../shared/testing";
import { ComparisonCharts } from "./ComparisonCharts";
import { toComparisonColumn } from "./comparisonModel";

afterEach(cleanup);

describe("ComparisonCharts", () => {
  it("names each compared run once, in a legend", () => {
    const records = SAMPLE_RUN_RECORDS.slice(0, 3);
    render(
      <ComparisonCharts
        columns={records.map((record) => toComparisonColumn(record))}
        hiddenKeys={new Set()}
      />,
    );

    // Numbered as well as coloured: the bars carry the same numbers, so a bar
    // is matched to its run without relying on telling the colours apart.
    const legend = screen.getByRole("list", { name: "Runs in these charts" });
    expect(within(legend).getAllByRole("listitem").map((item) => item.textContent)).toEqual(
      records.map((record, index) => `${index + 1}${record.config.name}`),
    );
  });
});
